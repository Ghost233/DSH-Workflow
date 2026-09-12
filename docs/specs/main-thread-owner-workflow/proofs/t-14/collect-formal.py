from pathlib import Path
import datetime, hashlib, json, os, signal, subprocess
root=Path(__file__).resolve().parents[5]
d=Path(__file__).resolve().parent
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
b=json.loads((d/'baseline.json').read_text())
assert all(hashlib.sha256((root/p).read_bytes()).hexdigest()==h for p,h in b['hashes'].items()),'production/source drift before freeze'
paths=list(b['hashes'])+[str(p.relative_to(root)) for p in d.rglob('*') if p.is_file() and p.suffix in ['.mjs','.py']]
# Freeze source audit and proposed adapter contract, final reports remain outside candidate.
paths += [str((d/p).relative_to(root)) for p in ['session/source-audit.md','proposed-contract.md']]
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
c={'at':now(),'scope':'T-14 / BUD-02,03 technical validation; real storage functions and controlled process/session boundaries','hashes':hashes}
(d/'candidate.json').write_text(json.dumps(c,indent=2))
results=[]
for name,script,extra,timeout in [('storage','storage/run-development.mjs',['--formal'],90),('session','session/probe.mjs',[],35),('identity','session/identity.mjs',[],15)]:
 cmd=[node,str(d/script),*extra];row={'name':name,'command':cmd,'cwd':str(root),'start':now(),'timeoutSeconds':timeout}
 p=subprocess.Popen(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 try:stdout,stderr=p.communicate(timeout=timeout);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);stdout,stderr=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 (d/f'formal-{name}.log').write_text(stdout);(d/f'formal-{name}.stderr.log').write_text(stderr)
 rows=[];unparsed=[]
 for line in stdout.splitlines():
  try:rows.append(json.loads(line))
  except json.JSONDecodeError:unparsed.append(line)
 row.update(end=now(),observations=rows,unparsedLines=unparsed)
 results.append(row);(d/'formal-results.json').write_text(json.dumps({'candidate':c['at'],'results':results},indent=2));print(json.dumps({'name':name,'exitCode':row['exitCode'],'timedOut':row['timedOut'],'jsonRows':len(rows)},ensure_ascii=False),flush=True)
drift=[p for p,h in hashes.items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
(d/'formal-results.json').write_text(json.dumps({'candidate':c['at'],'results':results,'drift':drift},indent=2));print('candidate drift',drift)
