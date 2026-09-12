from pathlib import Path
import json,hashlib,subprocess,re,datetime,os,signal,difflib
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=r/'docs/specs/main-thread-owner-workflow/rounds/round-78'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text())
changed=['owner-workflow-plugin/src/runtime.mjs', 'owner-workflow-plugin/src/candidate-recovery-pause.mjs', 'owner-workflow-plugin/test/candidate-arbitration-metered.test.mjs', 'owner-workflow-plugin/test/candidate-arbitration-recovery.test.mjs', 'owner-workflow-plugin/test/candidate-owner-consultation.test.mjs', 'owner-workflow-plugin/test/fixtures/candidate-arbitration-fixture.mjs', 'docs/specs/main-thread-owner-workflow/contracts/candidate-arbitration-v1.md', 'owner-workflow-plugin/test/recovery-admission.test.mjs']
excluded={'owner-workflow-plugin/test/launcher.test.mjs'}
externalBefore={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in excluded}
paths=[p for p in dict.fromkeys([*b['hashes'],*changed]) if p not in excluded];h={p:hashlib.sha256((r/p).read_bytes()).hexdigest() for p in paths}
external=json.loads((d/'external-changes.json').read_text())
assert all(h[p]==v or (external.get(p,{}).get('baseline')==v and external[p]['current']==h[p]) for p,v in b['hashes'].items() if p not in changed and p not in excluded)
(d/'candidate-2.json').write_text(json.dumps({'at':now(),'hashes':h,'excludedExternalTests':externalBefore,'exclusionReason':'launcher.test.mjs is outside selected suites and runtime imports; external changes retained in first-candidate and Git evidence'},indent=2))
diff=[]
for p in changed:
 before=d/(Path(p).name+'.before');a=before.read_text().splitlines(True) if before.exists() else []
 diff.extend(difflib.unified_diff(a,(r/p).read_text().splitlines(True),fromfile=p+' (baseline)' if a else '/dev/null',tofile=p))
(d/'round-2.diff').write_text(''.join(diff))
rows=[]
for suite in ['candidate-arbitration-metered','candidate-owner-consultation','candidate-arbitration-recovery','candidate-rebuild-recovery','candidate-review-recovery','candidate-recovery-pause','handoff-recovery','recovery-budget','recovery-admission','control']:
 target='docs/specs/main-thread-owner-workflow/proofs/t-23/boundary.test.mjs' if suite=='t23-boundary' else f'owner-workflow-plugin/test/{suite}.test.mjs'
 cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap',target]
 env=dict(os.environ);env['TSX_TSCONFIG_PATH']=str(r/'deepseek-harness/tsconfig.json')
 if suite=='t23-boundary':env['DSH_T22_RESTART_EVIDENCE_DIR']=str(d/'restart-artifacts')
 row={'suite':suite,'command':cmd,'cwd':str(r),'start':now(),'timeoutSeconds':180,'executionEnvironment':'Outside outer tool sandbox; actual Owner sandbox retained'}
 p=subprocess.Popen(cmd,cwd=r,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:out,_=p.communicate(timeout=180);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=now();(d/f'formal-2-{suite}.log').write_text(out)
 row['counts']={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',out,re.M)}
 row['warnings']=re.findall(r'^.*(?:PromiseRejectionHandledWarning|unhandledRejection).*$',out,re.M)
 rows.append(row);(d/'test-results-2.json').write_text(json.dumps({'results':rows},ensure_ascii=False,indent=2));print({k:row[k] for k in ['suite','exitCode','timedOut','counts']},flush=True)
drift=[p for p,v in h.items() if hashlib.sha256((r/p).read_bytes()).hexdigest()!=v]
(d/'test-results-2.json').write_text(json.dumps({'results':rows,'drift':drift,'externalChanges':{p:{'before':v,'after':hashlib.sha256((r/p).read_bytes()).hexdigest()} for p,v in externalBefore.items()}},ensure_ascii=False,indent=2));print('drift',drift)
