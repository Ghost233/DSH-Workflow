from pathlib import Path
import hashlib,json,subprocess,os,signal,re,datetime
root=Path('/Volumes/LargeStorage/code/DSH-Workflow'); out=root/'docs/specs/main-thread-owner-workflow/rounds/round-85'
paths=['owner-workflow-plugin/index.js','docs/specs/main-thread-owner-workflow/contracts/planning-packages-v1.md','docs/specs/main-thread-owner-workflow/contracts/planning-review-receipt-v1.md']
paths += [str(p.relative_to(root)) for p in (root/'owner-workflow-plugin/test').glob('*.test.mjs')]
paths += [str(p.relative_to(root)) for p in (root/'owner-workflow-plugin/test/fixtures').glob('*.mjs')]
paths=list(dict.fromkeys([*paths,*[str(p.relative_to(root)) for p in (root/'owner-workflow-plugin/src').rglob('*.mjs')]]))
paths.extend(str(p.relative_to(root)) for base in ['deepseek-harness/vendor/cordis/lib','deepseek-harness/packages/core/agent/lib','deepseek-harness/packages/interaction/user-questions/lib','deepseek-harness/packages/core/tools/lib','deepseek-harness/packages/core/system-prompt/lib','deepseek-harness/packages/fs/fs/lib','deepseek-harness/packages/fs/fs-local/lib','deepseek-harness/packages/fs/fs-observation-policy/lib','deepseek-harness/packages/fs/tool-fs/lib'] for p in (root/base).rglob('*.js'))
fixture=(root/'owner-workflow-plugin/test/fixtures/recovery-session-fixture.mjs').read_text()
source_block=fixture.split('const sourcePaths = [',1)[1].split(']',1)[0]
for path in re.findall(r"'([^']+)'",source_block):
 base=root/'deepseek-harness'/path
 paths.extend(str(p.relative_to(root)) for p in base.parent.rglob('*.ts'))
paths=list(dict.fromkeys(paths))
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
(out/'candidate.json').write_text(json.dumps({'at':now(),'hashes':hashes},indent=2))
rows=[]
for suite in ['planning-compile-native','plan-revision','planning-packages','plugin','control']:
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(root/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap',f'owner-workflow-plugin/test/{suite}.test.mjs']
 env=dict(os.environ,TSX_TSCONFIG_PATH=str(root/'deepseek-harness/tsconfig.json'))
 row={'suite':suite,'command':cmd,'cwd':str(root),'start':now(),'timeoutSeconds':120,'environment':'default tool sandbox; native Harness guards retained'}
 p=subprocess.Popen(cmd,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:log,_=p.communicate(timeout=120);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);log,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 (out/f'formal-{suite}.log').write_text(log);row['end']=now();row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',log,re.M)};rows.append(row)
 (out/'test-results.json').write_text(json.dumps({'results':rows},indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts']},flush=True)
drift=[p for p,h in hashes.items() if hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
(out/'test-results.json').write_text(json.dumps({'results':rows,'drift':drift},indent=2));print('drift',drift)
raise SystemExit(0 if not drift and all(r['exitCode']==0 and not r['timedOut'] and r['counts'].get('tests',0)>0 and r['counts'].get('skipped',0)==0 for r in rows) else 1)
