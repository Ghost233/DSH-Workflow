# T05 Debug app reuse

The two x64 T05 jobs share a concurrency group, so the first cache miss produces the app before the next job restores it. Flutter stays fixed at 3.47.6; its SDK and locked pub dependencies use the Flutter action's engineering cache. Each job still runs `check.sh` against its own checkout.

The artifact key binds the Debug command, architecture, Flutter/engine/Dart revisions, Xcode build, macOS SDK version/build, macOS version, and actual tracked launcher build source/configuration bytes, including `pubspec.yaml` and `pubspec.lock` with the official SDK revision. External `tool/`, `test/`, collector, CI, and documentation changes do not invalidate the app. Build inputs are checked again after compilation.

A producer saves `app.tar.gz` and its manifest before business acceptance, then uploads those complete bytes as an artifact. The tar preserves executable modes and framework symlinks. A consumer verifies the exact inputs, archive SHA256, and every extracted payload member before using the app. Invalid bytes stop the job. A miss (including cache eviction) requires a producer build; historical evidence hashes alone cannot supply an app.

`debug-app-decision.json` distinguishes production from reuse and records the actual producer and consumer checkout commits, workflow/run/attempt/job/repository, key, and archive hash. On a hit there is no current `build.exit`: the cached producer's build exit belongs to the producer manifest. Artifact uploads retain that original producer manifest even when business acceptance later fails.

Each scenario still stages the current association, uses the separately recorded frozen runtime source, and creates fresh isolated data and processes. No profile, receipt, runtime process, port, Keychain, or acceptance result is cached. This Debug artifact is not a T09 current Release candidate. The other four native acceptance jobs are unchanged.

Public artifact-boundary checks: `python3 .github/scripts/flutter_debug_artifact_test.py`.
