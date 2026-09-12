from pathlib import Path
import json,hashlib,subprocess,re,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-21'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text());target='owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs'
h={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in b['hashes']}
assert all(h[p]==v for p,v in b['hashes'].items() if p!=target)
(d/'candidate.json').write_text(json.dumps({'at':now(),'hashes':h},indent=2))
(d/'round.diff').write_text(''.join(difflib.unified_diff((d/'recovery-session-fixture.mjs.before').read_text().splitlines(True),(r/target).read_text().splitlines(True),fromfile=target+' (baseline)',tofile=target)))
cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap','owner-workflow-plugin/test/recovery-session.test.mjs']
env=dict(os.environ);env['TSX_TSCONFIG_PATH']=str(r/'deepseek-harness/tsconfig.json')
row={'suite':'recovery-session','command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180,'executionEnvironment':'Outside outer tool sandbox; real Owner sandbox remains enabled'}
p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
try:out,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
row['end']=now();(d/'formal-recovery-session.log').write_text(out)
row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',out,re.M)}
row['warnings']=re.findall(r'^.*(?:PromiseRejectionHandledWarning|unhandledRejection).*$',out,re.M)
expected=re.findall(r"^test\('([^']+)'",(r/'owner-workflow-plugin/test/recovery-session.test.mjs').read_text(),re.M)
row['selectionComplete']=len(expected)==11 and re.findall(r'^# Subtest: (.*)$',out,re.M)==expected
row['drift']=[p for p,v in h.items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
(d/'test-results.json').write_text(json.dumps(row,ensure_ascii=False,indent=2));print(json.dumps({k:row[k] for k in ['exitCode','timedOut','counts','warnings','selectionComplete','drift']}))
