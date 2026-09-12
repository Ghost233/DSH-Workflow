from pathlib import Path
import json,hashlib,subprocess,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-14'
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
freeze=json.loads((d/'candidate.json').read_text())
hashes=freeze['hashes']
assert all(hashlib.sha256((r/p).read_bytes()).hexdigest()==h for p,h in hashes.items())
results=[]
for suite in ['control']:
 cmd=[node,'--test','--test-force-exit',f'owner-workflow-plugin/test/{suite}.test.mjs'];row={'suite':suite,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180}
 p=subprocess.Popen(cmd,cwd=r,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try: output,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);output,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(d/f'supplemental-{suite}.log').write_text(output);counts={}
 for line in output.splitlines():
  parts=line.split()
  if len(parts)==3 and parts[1] in ['tests','pass','fail','cancelled','skipped','todo'] and parts[2].isdigit():counts[parts[1]]=int(parts[2])
 row['counts']=counts;results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 (d/'supplemental-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':results},indent=2))
drift=[p for p,h in hashes.items() if not (r/p).is_file() or hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
(d/'supplemental-results.json').write_text(json.dumps({'candidate':freeze['at'],'results':results,'drift':drift},indent=2));print('drift',drift)
