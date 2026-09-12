from pathlib import Path
import json,hashlib,subprocess,re,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-19'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text());target='owner-workflow-plugin/test/resilience.test.mjs'
h={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in b['hashes']}
assert all(h[p]==v for p,v in b['hashes'].items() if p!=target)
(d/'candidate.json').write_text(json.dumps({'at':now(),'hashes':h},indent=2))
(d/'round.diff').write_text(''.join(difflib.unified_diff((d/'resilience.test.mjs.before').read_text().splitlines(True),(r/target).read_text().splitlines(True),fromfile=target+' (baseline)',tofile=target)))
names=re.findall(r"^test\('([^']+)'",(r/target).read_text(),re.M);assert len(names)==len(set(names))==51
shards=[names[i:i+17] for i in range(0,51,17)];(d/'shards.json').write_text(json.dumps(shards,ensure_ascii=False,indent=2))
rows=[]
for i,n in enumerate(shards,1):
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--test','--test-force-exit','--test-reporter=tap','--test-name-pattern','^(?:'+'|'.join(re.escape(x) for x in n)+')$',target]
 row={'suite':f'resilience-{i}','command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180,'selectedCases':n}
 p=subprocess.Popen(cmd,cwd=r,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:out,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(d/f'formal-resilience-{i}.log').write_text(out)
 row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',out,re.M)}
 actual=re.findall(r'^# Subtest: (.*)$',out,re.M);row['selectionComplete']=actual==n
 row['warnings']=re.findall(r'^.*(?:PromiseRejectionHandledWarning|unhandledRejection).*$ ',out,re.M)
 rows.append(row);(d/'test-results.json').write_text(json.dumps({'results':rows},ensure_ascii=False,indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts','selectionComplete']},flush=True)
drift=[p for p,v in h.items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
(d/'test-results.json').write_text(json.dumps({'results':rows,'drift':drift},ensure_ascii=False,indent=2));print('drift',drift)
