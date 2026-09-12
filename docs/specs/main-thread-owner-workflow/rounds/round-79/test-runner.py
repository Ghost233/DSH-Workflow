from pathlib import Path
import hashlib,json,subprocess,os,signal,re,datetime
root=Path('/Volumes/LargeStorage/code/DSH-Workflow'); out=root/'docs/specs/main-thread-owner-workflow/rounds/round-79'
paths=['owner-workflow-plugin/src/planning-references.mjs','owner-workflow-plugin/test/planning-references.test.mjs','docs/specs/main-thread-owner-workflow/contracts/planning-references-v1.md','owner-workflow-plugin/src/orchestrator-documents.mjs','owner-workflow-plugin/test/orchestrator-documents.test.mjs','owner-workflow-plugin/test/orchestrator-documents-native.test.mjs']
paths=list(dict.fromkeys([*paths,*[str(p.relative_to(root)) for p in (root/'owner-workflow-plugin/src').rglob('*.mjs')]]))
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
(out/'candidate.json').write_text(json.dumps({'at':now(),'hashes':hashes},indent=2))
for name in paths[:3]:(out/(Path(name).name+'.candidate')).write_bytes((root/name).read_bytes())
rows=[]
for suite in ['planning-references','orchestrator-documents','orchestrator-documents-native']:
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(root/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap',f'owner-workflow-plugin/test/{suite}.test.mjs']
 env=dict(os.environ,TSX_TSCONFIG_PATH=str(root/'deepseek-harness/tsconfig.json'))
 row={'suite':suite,'command':cmd,'cwd':str(root),'start':now(),'timeoutSeconds':120,'environment':'outside outer tool sandbox; native Harness guards retained'}
 p=subprocess.Popen(cmd,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:log,_=p.communicate(timeout=120);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);log,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 (out/f'formal-{suite}.log').write_text(log);row['end']=now();row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',log,re.M)};rows.append(row)
 (out/'test-results.json').write_text(json.dumps({'results':rows},indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts']},flush=True)
drift=[p for p,h in hashes.items() if hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
(out/'test-results.json').write_text(json.dumps({'results':rows,'drift':drift},indent=2));print('drift',drift)
raise SystemExit(0 if not drift and all(r['exitCode']==0 and not r['timedOut'] for r in rows) else 1)
