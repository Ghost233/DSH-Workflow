import subprocess,os,signal,json,datetime
from pathlib import Path
r=Path('/Volumes/LargeStorage/code/DSH-Workflow');d=Path('/tmp/dsh-t22-success-r20')
cmd=['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node','--import',str(r/'deepseek-harness/node_modules/tsx/dist/esm/index.mjs'),'--test','--test-force-exit','--test-reporter=tap','--test-name-pattern','settles a real completed Owner|cannot report succeeded',str(r/'owner-workflow-plugin/test/recovery-session.test.mjs')]
e=dict(os.environ);e['TSX_TSCONFIG_PATH']=str(r/'deepseek-harness/tsconfig.json')
v={'command':cmd,'cwd':str(r),'start':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeoutSeconds':180}
p=subprocess.Popen(cmd,cwd=r,env=e,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
try:out,_=p.communicate(timeout=180);v.update(exitCode=p.returncode,timedOut=False)
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGKILL);out,_=p.communicate();v.update(exitCode=p.returncode,timedOut=True)
v['end']=datetime.datetime.now(datetime.timezone.utc).isoformat();(d/'root-directed.log').write_text(out);(d/'root-directed.json').write_text(json.dumps(v,indent=2));print(out)
