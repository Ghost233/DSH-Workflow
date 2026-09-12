from pathlib import Path
import subprocess,json,re,os,signal,datetime,hashlib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-18'
def names(p):
 return [re.match(r'^[✔﹣] (.*) \([\d.]+ms\)(?:.*)?$',v).group(1) for v in p.read_text().splitlines() if v.startswith(('✔ ','﹣ '))]
baseline=json.loads((d/'control-shards.json').read_text())['control-b'];done=names(d/'formal-control-b.log');assert baseline[:len(done)]==done
remaining=baseline[len(done):];assert len(remaining)==12
pattern='^(?:'+'|'.join(re.escape(v) for v in remaining)+')$'
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
cmd=[node,'--test','--test-force-exit','--test-name-pattern',pattern,'owner-workflow-plugin/test/control.test.mjs']
row={'command':cmd,'cwd':str(r),'reason':'Bounded completion of 12 unreported cases after 180s timeout; preserve original timeout.','previouslyReported':done,'selectedCases':remaining,'start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeoutSeconds':180}
f=json.loads((d/'candidate.json').read_text());assert all(hashlib.sha256((r/p).read_bytes()).hexdigest()==h for p,h in f['hashes'].items())
p=subprocess.Popen(cmd,cwd=r,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
try:out,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
row['end']=datetime.datetime.now(datetime.timezone.utc).isoformat();(d/'formal-control-supplement.log').write_text(out)
row['counts']={}
for line in out.splitlines():
 a=line.split()
 if len(a)==3 and a[1] in ['tests','pass','fail','cancelled','skipped','todo'] and a[2].isdigit():row['counts'][a[1]]=int(a[2])
row['drift']=[p for p,h in f['hashes'].items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=h]
(d/'control-supplement.json').write_text(json.dumps(row,ensure_ascii=False,indent=2));print(json.dumps({k:row[k] for k in ['exitCode','timedOut','counts','drift']},ensure_ascii=False))
