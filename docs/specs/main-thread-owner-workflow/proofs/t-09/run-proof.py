from pathlib import Path
import json,hashlib,subprocess,datetime,os,signal
root=Path(__file__).resolve().parents[5]
out=Path(__file__).resolve().parent
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
production=json.loads((out/'candidate.json').read_text())['hashes']
proof={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [out/'fixtures.mjs',out/'probe.mjs',out/'boundaries.mjs',out/'run-proof.py']}
allhashes={**production,**proof}
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in production.items())
(out/'freeze.json').write_text(json.dumps({'at':now(),'production':production,'proof':proof},indent=2))
runs=[]
entries=[('recovery',[node,str(out/'probe.mjs')],5),('boundaries',[node,str(out/'boundaries.mjs')],3),('timeout-regression',[node,'--test','--test-force-exit','--test-name-pattern=任务达到 onTimeout|Owner 恢复后使用本次运行时间|持续产生心跳的长任务', 'owner-workflow-plugin/test/control.test.mjs'],None)]
for name,cmd,expected in entries:
 row={'name':name,'command':cmd,'cwd':str(root),'start':now(),'timeoutSeconds':60}
 p=subprocess.Popen(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try: output,_=p.communicate(timeout=60);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);output,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(out/f'formal-{name}.log').write_text(output)
 if expected is not None:
  try:
   scenarios=[json.loads(line) for line in output.splitlines()];row['collectedScenarios']=len(scenarios);row['probeErrors']=[x for x in scenarios if 'probeError' in x];row['collectionComplete']=len(scenarios)==expected and not row['probeErrors']
  except Exception as e:row['collectionError']=str(e)
 else:
  row['counts']={}
  for line in output.splitlines():
   parts=line.split()
   if len(parts)==3 and parts[1] in ['tests','pass','fail','cancelled','skipped','todo'] and parts[2].isdigit():row['counts'][parts[1]]=int(parts[2])
 runs.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 (out/'formal-results.json').write_text(json.dumps({'runs':runs},indent=2))
drift=[f for f,h in allhashes.items() if not (root/f).is_file() or hashlib.sha256((root/f).read_bytes()).hexdigest()!=h]
(out/'formal-results.json').write_text(json.dumps({'runs':runs,'drift':drift},indent=2));print('drift',drift)
