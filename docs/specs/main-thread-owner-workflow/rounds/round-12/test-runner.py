from pathlib import Path
import json,hashlib,subprocess,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-12'
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text());paths=list(b['hashes'])+['owner-workflow-plugin/src/recovery-budget.mjs','owner-workflow-plugin/test/recovery-budget.test.mjs'];paths+=[str((d.parent.parent/'contracts/recovery-budget-v1.md').relative_to(r))]
hashes={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths}
assert all(hashes[p]==h for p,h in b['hashes'].items()),'prior source changed'
freeze={'at':now(),'scope':'T-13 / R4-V03-1: pure recovery budget ledger','hashes':hashes};(d/'candidate.json').write_text(json.dumps(freeze,indent=2))
diff=[]
for p in paths:
 if p not in b['hashes']:diff.extend(difflib.unified_diff([], (r/p).read_text().splitlines(True),fromfile='/dev/null',tofile=p))
(d/'round.diff').write_text(''.join(diff))
results=[]
for suite in ['recovery-budget','convergence','model','plan-revision','workflow-state']:
 cmd=[node,'--test','--test-force-exit',f'owner-workflow-plugin/test/{suite}.test.mjs'];row={'suite':suite,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':60}
 p=subprocess.Popen(cmd,cwd=r,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try: output,_=p.communicate(timeout=60);row.update(exitCode=p.returncode,timedOut=False)
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
