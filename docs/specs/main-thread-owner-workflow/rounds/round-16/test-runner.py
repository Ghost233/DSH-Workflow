from pathlib import Path
import json,hashlib,subprocess,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-16'
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text())
changed=['owner-workflow-plugin/src/runtime.mjs','owner-workflow-plugin/src/recovery-admission.mjs','owner-workflow-plugin/src/recovery-session.mjs','owner-workflow-plugin/test/recovery-session.test.mjs','docs/specs/main-thread-owner-workflow/contracts/recovery-session-v1.md']
changed += [str(p.relative_to(r)) for p in (r/'owner-workflow-plugin/test/fixtures').glob('recovery-session-*') if p.is_file() and p.suffix in ['.mjs','.js','.ts']]
paths=list(dict.fromkeys([*b['hashes'],*changed]))
hashes={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths}
assert all(hashes[p]==h for p,h in b['hashes'].items() if p not in changed),'unrelated source changed'
freeze={'at':now(),'scope':'T-22 / R4-V03-1: conservative recovery session adapter','hashes':hashes};(d/'candidate.json').write_text(json.dumps(freeze,indent=2))
diff=[]
for p in changed:
 before=d/(Path(p).name+'.before')
 lines=before.read_text().splitlines(True) if before.exists() else []
 diff.extend(difflib.unified_diff(lines,(r/p).read_text().splitlines(True),fromfile=p+' (baseline)' if lines else '/dev/null',tofile=p))
(d/'round.diff').write_text(''.join(diff))
results=[]
for suite in ['recovery-session','recovery-admission','recovery-budget','convergence','model','plan-revision','workflow-state','control','security']:
 cmd=[node,'--test','--test-force-exit',f'owner-workflow-plugin/test/{suite}.test.mjs'];row={'suite':suite,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180 if suite in ['control','security','recovery-session'] else 60}
 env=dict(os.environ)
 if suite=='recovery-session':
  cmd[1:1]=['--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs')]
  env['TSX_TSCONFIG_PATH']=str(r/'deepseek-harness/tsconfig.json')
 p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try: output,_=p.communicate(timeout=row['timeoutSeconds']);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);output,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(d/f'formal-{suite}.log').write_text(output);counts={}
 for line in output.splitlines():
  parts=line.split()
  if len(parts)==3 and parts[1] in ['tests','pass','fail','cancelled','skipped','todo'] and parts[2].isdigit():counts[parts[1]]=int(parts[2])
 row['counts']=counts;results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 (d/'test-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':results},indent=2))
drift=[p for p,h in hashes.items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
(d/'test-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':results,'drift':drift},indent=2));print('drift',drift)
