from pathlib import Path
import json,hashlib,subprocess,datetime,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/proofs/t-21'
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
hook=r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
base=json.loads((d/'baseline.json').read_text())['hashes']; sources=json.loads((d/'source-baseline.json').read_text()); hashes={**base,**sources}
assert all(hashlib.sha256((r/p).read_bytes()).hexdigest()==h for p,h in hashes.items()),'source baseline drift'
for name in ['session/probe.mjs','prompt/worker.mjs','prompt/run.mjs','source-audit.md','proposed-contract.md','collect-formal.py']:
 p=d/name;hashes[str(p.relative_to(r))]=hashlib.sha256(p.read_bytes()).hexdigest()
for p in [r/'deepseek-harness/pnpm-lock.yaml',r/'deepseek-harness/node_modules/tsx/package.json',hook]:
 hashes[str(p.relative_to(r))]=hashlib.sha256(p.read_bytes()).hexdigest()
freeze={'at':now(),'hashes':hashes};(d/'candidate.json').write_text(json.dumps(freeze,indent=2))
rows=[]
for name,cmd in [('session',[node,'--import',str(hook),str(d/'session/probe.mjs')]),('prompt',[node,str(d/'prompt/run.mjs'),str(d/'formal-prompt')])]:
 env={**os.environ,'TSX_TSCONFIG_PATH':str(r/'deepseek-harness/tsconfig.json')}
 row={'name':name,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':150}
 p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 try:stdout,stderr=p.communicate(timeout=150);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);stdout,stderr=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 (d/f'formal-{name}.stdout.log').write_text(stdout);(d/f'formal-{name}.stderr.log').write_text(stderr)
 row.update(end=now(),stderrBytes=len(stderr.encode()));rows.append(row);print(json.dumps(row),flush=True)
 (d/'formal-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':rows},indent=2))
drift=[p for p,h in hashes.items() if not (r/p).exists() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
(d/'formal-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':rows,'drift':drift},indent=2));print('drift',drift)
