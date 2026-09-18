import pathlib,json,subprocess,tempfile,shutil,time,hashlib,difflib
root=pathlib.Path('/Volumes/LargeStorage/code/DSH-Workflow')
out=root/'docs/specs/main-thread-owner-workflow/proofs/ukr1/2026-09-13/isolated-attempt-recovery/lockfile-generation-20260914'
source=root/'.dsh-workflow/artifacts/act-ac9ba94424cddba802d55cfd1a2c5e39a3a183aa/tree'
work=pathlib.Path(tempfile.mkdtemp(prefix='dsh-lockfile-generation-',dir='/private/tmp'))
for name in ['package.json','package-lock.json','.npmrc']:shutil.copy2(source/name,work/name)
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
npm='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/lib/node_modules/npm/bin/npm-cli.js'
common=['--ignore-scripts','--no-audit','--no-fund','--cache',str(work/'npm-cache')]
records=[]
def run(name,args):
 start=time.monotonic();p=subprocess.run([node,npm,*args,*common],cwd=work,capture_output=True,text=True,timeout=180);(out/(name+'.stdout.log')).write_text(p.stdout);(out/(name+'.stderr.log')).write_text(p.stderr);r={'name':name,'argv':[node,npm,*args,*common],'cwd':str(work),'exitCode':p.returncode,'elapsedSeconds':round(time.monotonic()-start,3),'errors':[x for x in p.stderr.splitlines() if x.startswith('npm error') and ('Missing:' in x or 'code ' in x or 'in sync' in x)]};records.append(r);print(json.dumps(r),flush=True);return p
before=run('before-ci-dry-run',['ci','--dry-run']);assert before.returncode!=0 and 'Missing: fsevents@2.3.2' in before.stderr
p=run('generate-lockfile',['install','--package-lock-only']);assert p.returncode==0
old=json.loads((source/'package-lock.json').read_text());new=json.loads((work/'package-lock.json').read_text());changes={'added':[k for k in new['packages'] if k not in old['packages']],'removed':[k for k in old['packages'] if k not in new['packages']],'changed':[k for k in old['packages'] if k in new['packages'] and old['packages'][k]!=new['packages'][k]]};print('LOCK DIFF '+json.dumps(changes),flush=True)
(out/'generated-lockfile.patch').write_text(''.join(difflib.unified_diff((source/'package-lock.json').read_text().splitlines(True),(work/'package-lock.json').read_text().splitlines(True),fromfile='a/package-lock.json',tofile='b/package-lock.json')))
after=run('after-ci-dry-run',['ci','--dry-run']);assert after.returncode==0
sha=hashlib.sha256((work/'package-lock.json').read_bytes()).hexdigest(); result={'scratch':str(work),'generatedLockfile':str(work/'package-lock.json'),'generatedSha256':sha,'sourceCandidate':'ab6c1c53f3b04f39e22eccc46709922abdc63e25f8e4f197c3b746ebaba0d9f5','changes':changes,'commands':records,'packageJsonUnchanged':(work/'package.json').read_bytes()==(source/'package.json').read_bytes(),'projectNpmrcUnchanged':(work/'.npmrc').read_bytes()==(source/'.npmrc').read_bytes(),'nodeModulesCreated':(work/'node_modules').exists(),'browserSmokeVerified':False};(out/'generation-result.json').write_text(json.dumps(result,indent=2));print('SUCCESS '+json.dumps(result),flush=True)
