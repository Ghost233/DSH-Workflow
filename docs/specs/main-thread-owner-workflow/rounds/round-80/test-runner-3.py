from pathlib import Path
import json,hashlib,subprocess,datetime,re,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-80'
paths=[str(p.relative_to(r)) for p in (r/'docs/specs/main-thread-owner-workflow/proofs/t-07').glob('*.mjs')]+[str(p.relative_to(r)) for p in (r/'owner-workflow-plugin/src').rglob('*.mjs')]+['owner-workflow-plugin/test/planning-references.test.mjs']
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
h={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths}
(d/'candidate-3.json').write_text(json.dumps({'at':now(),'hashes':h},indent=2))
for p in (r/'docs/specs/main-thread-owner-workflow/proofs/t-07').glob('*.mjs'):(d/(p.name+'.candidate-3')).write_bytes(p.read_bytes())
rows=[]
for name,target in [('transaction','docs/specs/main-thread-owner-workflow/proofs/t-07/transaction.test.mjs')]:
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap','--test-name-pattern=competing revisions of an already active parent',target]
 env=dict(os.environ,TSX_TSCONFIG_PATH=str(r/'deepseek-harness/tsconfig.json'),T07_EVIDENCE_DIR=str(d/'artifacts-3'))
 row={'suite':name,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180}
 p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:log,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);log,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 (d/f'formal-3-{name}.log').write_text(log);row['end']=now();row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',log,re.M)};rows.append(row);(d/'test-results-3.json').write_text(json.dumps({'results':rows},indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts']},flush=True)
drift=[p for p,v in h.items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
(d/'test-results-3.json').write_text(json.dumps({'results':rows,'drift':drift},indent=2));print('drift',drift)
raise SystemExit(0 if not drift and all(x['exitCode']==0 and not x['timedOut'] for x in rows) else 1)
