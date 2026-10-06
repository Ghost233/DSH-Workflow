# T02 — 官方 Desktop 打开失败诊断循环

状态：首次 live diagnostics 未复现目标症状；原 Launcher 主路径尚未执行。新源码改为先运行真实 parent loop，待下一轮 CI，阶段 1–2 未完成。

正式验收仍以 [T02 issue #3](https://github.com/Ghost233/DSH-Workflow/issues/3) 与原 native acceptance workflow 为准。本文件记录后续失败的诊断，不改变产品合同。

## 已观察症状

源提交 `d15b776eec9cfed2bf52f21a0a76d56230f7f1d2` 的 [native run 37411333892，T02 job 112100202921](https://github.com/Ghost233/DSH-Workflow/actions/runs/37411333892/job/112100202921) 中，UI 记录：

```text
PlatformException(open-failed, The application “DeepSeek Harness” could not be launched because it is corrupt., null, null)
```

随后固定应用命令等待 `real Web readiness after management action` 超时，退出 255。Launcher 窗口仍可观察，最终清理退出 -15；25 次后端 receipt 均缺失，未观察到 Desktop PID。前一轮绿色的源提交 `a5b2ee9fa55bdbc0983cf29a56b9e5eb6f63a16f` 与 d15 之间仅 T05 报告发生变化，固定 DMG、Node、Desktop executable、backend helper 哈希一致。

原始及脱敏证据指针：`/private/tmp/dsh-flutter-implementation/T02/CI-37411333892/diagnosis.md`。本次错误与 T05 的 receipt 到达晚于既有等待期限属于不同观察，不合并为同一原因。

## 已授权接缝与固定命令

诊断只在干净 GitHub macOS runner 上运行，不在用户主机启动 Desktop、Host、Web 33080、浏览器或访问 Keychain。

隔离 workflow `.github/workflows/flutter-launcher-diagnostics.yml` 仅在 `codex/flutter-launcher-spec` push 且该 workflow 或两份新诊断工具发生变化时自动运行，并保留 `workflow_dispatch` 声明。首次 dispatch 要求文件存在默认分支，本次通过已授权 integration push 运行，不修改 main。参见 [GitHub workflow_dispatch 事件文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)。它使用 macos-15、当前 checkout 和固定 Flutter 3.47.6。运行包仍为 run 37325723931、artifact 11353327247 的 `dsh-workflow-arm64`，DMG SHA-256 固定为 `f02b23ca5d2888bf5b0317a5b57736d114855eb4eef9f56fb90f95c15b5ed5af`，只读挂载。

1. 构建一次当前 Debug candidate，先运行最多 3 次原 T02 应用命令。独立 Dart observer 只读取现有应用 VM extension 的 `observe` 状态，直接记录第一次 `PlatformException(open-failed)`，不发 UI action、不调整产品或共有 driver 的超时与清理。缺少 root/PID/receipt/查询证据时停止并退出 2。
2. 只有 3 次 parent cleanup 的归属及退出证据全部充分，才运行最多 5 次独立 Swift 对照。它使用当前 `prepare-desktop.mjs` 和 native `NSWorkspace.OpenConfiguration`，记录真实 NSError、精确 bundle/PID/launchDate、信号与清理耗时；正常 terminate 前核对新查询的相同实例。退出观测保留原 15 秒窗口，记录原始 `/bin/kill -0` 的 exit/stdout/stderr、fresh NSRunningApplication 的相同 bundle/executable/launchDate 状态及本轮 private root 残留。只有明确 ESRCH 与原生实例缺席或同实例已退出一致时才认定 exited；未知结果仍停止，不依据 cached isTerminated 或端口观测作猜测。

```sh
# Setup/build 不计入 warm iteration；仅干净 CI。
dart run tool/desktop_launch_observer.dart \
  'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow' \
  "$RUNTIME_RESOURCES" "$DIAGNOSTIC_ROOT"
```

Observer 内每次执行的实际业务命令保持原样：

```sh
dart run tool/application_probe.dart \
  'build/macos/Build/Products/Debug/DSH Workflow.app/Contents/MacOS/DSH Workflow' \
  --web-runtime "$RUNTIME_RESOURCES" --web-backend desktop --web-port 33080
```

记录 `timeToSignalMs` 与 `iterationWallMs`，区分立即观察到的 native 错误与原命令最后退出、清理耗时。Swift 外部 caller 的成功不代表父 Launcher 上下文已复现；若外部调用全绿，以真实 Launcher 循环结果继续最小化。

## 判定与阶段边界

- 真实 native `open-failed/corrupt` 是当前诊断目标。准备失败、observer 无法连接、callback timeout、后端 readiness deadline 或清理失败必须分别记录，不能当作该缺陷复现。
- 每次保留真实退出证据与精确进程事实。NSWorkspace 打开的实例不是 Swift 探针子进程，因此不存在可由该探针 reap 的退出码；报告正常退出观察及其限制。
- 签名检查与实际 xattr 只读采集；不去 quarantine、不重签输入、不修改 Gatekeeper、不改 renderer、不改官方/第三方源码、不延长现有 timeout。
- 下载和构建可以较慢。新的 live CI 必须证明 warm 信号以秒计，并给出固定输入的实际重复率，才能完成 diagnosing-bugs 阶段 1；随后逐项删除非必要步骤并确认同一症状仍红，才能完成阶段 2。
- 语法检查、离线 trace extraction 或普通门禁失败均不是业务红循环。尚未进入阶段 3，不提前提出、排名或测试修复假设。

## 当前验证

源 `8daaeebf483538e81cd3d23896761502c71f93df` 的 [diagnostics run 37416680128，job 112116721491](https://github.com/Ghost233/DSH-Workflow/actions/runs/37416680128/job/112116721491) 已实际执行。产物 ID 11391965832，SHA-256 `03684e4033c020f2e0ee6324158b6efef0148879f24f150e44aeb23b7fb461f0`，下载摘要与 GitHub 元数据一致。

实际只有 1 次外部 Swift：prepare exit 0 / 1355 ms；native-open-succeeded / 634 ms，PID 5045，launchDateUnix 1791263262.017611；normalTerminationRequested=true，但原 15 秒窗口内 cached isTerminated 未确认退出，wall 17087 ms，probe exit 2。它未观察到 corrupt NSError；未知清理门禁正确停止后续 4 次及全部 parent loop。该 CI 红是探针退出观测不足，不能记作目标业务复现。

同 PID native journal 记录 started → quit-requested → workspace-failed，尚不建立原因。最终 lsof 33080 exit 1 / empty 不证明 Desktop 退出。`runtime-detach.exit` 实际 16 / Resource busy；workflow step 显示 success 不能称实际 detach 成功。固定三项 payload 前后 SHA 一致；Desktop 签名只读校验 0、xattrs 查询 0 / empty。细节与脱敏证据：`/private/tmp/dsh-flutter-implementation/T02/CI-37416680128/diagnosis.md`。

当前 canonical 原完整 T02 的 [Native run 37418181101，job 112121385724](https://github.com/Ghost233/DSH-Workflow/actions/runs/37418181101/job/112121385724) 也已核对实际产物：source `0d35785a289f35deba9b5848ba2ea4682aa845a2`，artifact 11391494641，SHA-256 `0df71f9d525224d9c58d6406faa1520b108c4394a37ef2d1dadf3143f4ec5d25`。原全场景 application exit 0 / UI+SDK start-recycle=true；Launcher 6419、Desktop 6703、Host 6841，lease `41ca2c12-0d81-4deb-b14c-ea2e7eeef40d`，首 receipt 18.012 秒，14 次 present，Launcher normal exit 0 / 32.711 秒。owned helper capture/cleanup 均 0，三 PID 查验都是明确 No such process，receipt removed；lsof exit 1 / empty、reuseAddr bind+listen 可用，raw no-reuse bind 则实际 errno 48，不把这项描述为通过；实际 runtime detach exit 0。它是一次完整真实绿色证据，仍不能替代 Corrupt 的红循环或证明原因。脱敏产物在上述 CI 临时目录的 `downloads/full-green-sanitized/`。

新 source 改为 parent first，并补 Swift 精确 OS/native 退出观测；当前仍待新的 live CI。源码及纯门禁检查仅用于检查诊断器，不能代替业务红循环。已普通 merge 同步 canonical `0d35785a289f35deba9b5848ba2ea4682aa845a2`；主线程负责集成/push。未改 product、第三方、Gatekeeper 或 timeout，也未运行本机 GUI。原绿色验收不能覆盖最新失败，诊断 workflow 不能替代正式 native acceptance。
