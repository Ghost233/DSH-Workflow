import pathlib,json,subprocess,time,os,signal
root=pathlib.Path('/Volumes/LargeStorage/code/DSH-Workflow');out=root/'docs/specs/main-thread-owner-workflow/proofs/ukr1/2026-09-13/isolated-attempt-recovery/lockfile-generation-20260914';r=json.loads((out/'generation-result.json').read_text());work=pathlib.Path(r['scratch']);args=[*r['commands'][0]['argv'][:2],'ci','--foreground-scripts','--cache',str(work/'npm-cache')];start=time.monotonic();timed=False
with (out/'actual-install.stdout.log').open('w') as stdout,(out/'actual-install.stderr.log').open('w') as stderr:
 p=subprocess.Popen(args,cwd=work,stdout=stdout,stderr=stderr,start_new_session=True)
 try: p.wait(timeout=300)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
result={'argv':args,'cwd':str(work),'exitCode':p.returncode,'timedOut':timed,'elapsedSeconds':round(time.monotonic()-start,3),'diagnosticOnly':True,'fixedWorkflowVerification':False,'foregroundLifecycleLogging':True};(out/'actual-install-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
