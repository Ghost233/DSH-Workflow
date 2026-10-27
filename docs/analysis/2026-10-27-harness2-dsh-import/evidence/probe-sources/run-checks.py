from pathlib import Path
import os,subprocess,time,json
ROOT=Path('/private/tmp/harness2-dsh-import-audit-20261027')
EVIDENCE=ROOT/'evidence';EVIDENCE.mkdir(exist_ok=True)
PYTHON='/Users/ghost233/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3.12'
NODE='/Applications/Ghost DSH Station.app/Contents/Resources/node'
def run(name,command,cwd,extra=None,timeout=55):
    env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','LC_ALL','TERM']}
    for directory in ['home','tmp']:(ROOT/directory).mkdir(exist_ok=True)
    env.update(HOME=str(ROOT/'home'),TMPDIR=str(ROOT/'tmp'),DSH_HOME=str(ROOT/'home/dsh'),PYTHONDONTWRITEBYTECODE='1')
    env.update(extra or {})
    started=time.monotonic()
    try:
        proc=subprocess.run(command,cwd=cwd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
        code=proc.returncode;output=proc.stdout;timedout=False
    except subprocess.TimeoutExpired as e:
        code=None;output=e.stdout or '';output=output.decode() if isinstance(output,bytes) else output;timedout=True
    (EVIDENCE/(name+'.log')).write_text(output)
    record={'name':name,'command':command,'cwd':str(cwd),'exitCode':code,'timedOut':timedout,'durationSeconds':round(time.monotonic()-started,3),'log':name+'.log'}
    records_path=EVIDENCE/'checks.json'
    records=json.loads(records_path.read_text()) if records_path.exists() else []
    records.append(record);records_path.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(record,ensure_ascii=False),flush=True);print(output[-5000:],flush=True)
    return code,output
if __name__=='__main__':
    run('original-demo',[PYTHON,'-B','-m','harness2.cli.demo','--output',str(ROOT/'original-demo'),'--k','1','--mode','both'],Path('/private/tmp/harness2-kingsley-audit-20261027/google-harness2'))
