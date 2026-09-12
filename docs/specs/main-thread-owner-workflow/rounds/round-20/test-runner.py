from pathlib import Path
import json,hashlib,subprocess,re,datetime,os,signal,difflib,sys
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-20'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text())
changed=['owner-workflow-plugin/src/runtime.mjs','owner-workflow-plugin/src/recovery-session.mjs','owner-workflow-plugin/test/recovery-session.test.mjs','owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs','docs/specs/main-thread-owner-workflow/contracts/recovery-session-v1.md']
h={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in b['hashes']}
assert all(h[p]==v for p,v in b['hashes'].items() if p not in changed)
if (d/'candidate.json').exists():
 assert json.loads((d/'candidate.json').read_text())['hashes']==h,'frozen candidate changed'
else:
 (d/'candidate.json').write_text(json.dumps({'at':now(),'hashes':h},indent=2))
diff=[]
for p in changed:diff.extend(difflib.unified_diff((d/(Path(p).name+'.before')).read_text().splitlines(True),(r/p).read_text().splitlines(True),fromfile=p+' (baseline)',tofile=p))
(d/'round.diff').write_text(''.join(diff))
old=json.loads((d.parent/'round-18/control-shards.json').read_text());control=old['control-a']+old['control-b'];assert len(set(control))==166
assert h['owner-workflow-plugin/test/control.test.mjs']==b['hashes']['owner-workflow-plugin/test/control.test.mjs']
resilience=re.findall(r"^test\('([^']+)'",(r/'owner-workflow-plugin/test/resilience.test.mjs').read_text(),re.M);assert len(set(resilience))==51
shards={**{f'control-{i//42+1}':control[i:i+42] for i in range(0,166,42)},**{f'resilience-{i//17+1}':resilience[i:i+17] for i in range(0,51,17)}}
(d/'shards.json').write_text(json.dumps(shards,ensure_ascii=False,indent=2))
mode=sys.argv[1] if len(sys.argv)>1 else 'all'
assert mode in ['all','session','regression']
rows=json.loads((d/'test-results.json').read_text())['results'] if mode=='regression' else []
for suite in ['recovery-session','recovery-admission','recovery-budget','convergence','model','plan-revision','workflow-state',*[s for s in shards if s.startswith('control-')],'security',*[s for s in shards if s.startswith('resilience-')]]:
 if mode=='session' and suite!='recovery-session':continue
 if mode=='regression' and suite=='recovery-session':continue
 target=suite.rsplit('-',1)[0] if suite in shards else suite
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--test','--test-force-exit','--test-reporter=tap']
 if suite in shards:cmd+=['--test-name-pattern','^(?:'+'|'.join(re.escape(x) for x in shards[suite])+')$']
 cmd+=[f'owner-workflow-plugin/test/{target}.test.mjs']
 env=dict(os.environ)
 if suite=='recovery-session':
  cmd[1:1]=['--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs')];env['TSX_TSCONFIG_PATH']=str(r/'deepseek-harness/tsconfig.json')
 row={'suite':suite,'command':cmd,'cwd':str(r),'start':now(),'executionEnvironment':'outside outer sandbox; real Owner sandbox enabled' if mode=='session' else 'default outer sandbox','timeoutSeconds':180 if suite in shards or suite in ['security','recovery-session'] else 60}
 p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:out,_=p.communicate(timeout=row['timeoutSeconds']);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(d/f'formal-{suite}.log').write_text(out)
 row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',out,re.M)}
 if suite in shards:row['selectionComplete']=re.findall(r'^# Subtest: (.*)$',out,re.M)==shards[suite]
 row['warnings']=re.findall(r'^.*(?:PromiseRejectionHandledWarning|unhandledRejection).*$',out,re.M)
 rows.append(row);(d/'test-results.json').write_text(json.dumps({'results':rows},ensure_ascii=False,indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts']},flush=True)
drift=[p for p,v in h.items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
(d/'test-results.json').write_text(json.dumps({'results':rows,'drift':drift},ensure_ascii=False,indent=2));print('drift',drift)
