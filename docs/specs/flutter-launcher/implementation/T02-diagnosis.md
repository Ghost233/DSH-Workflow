# T02 — 官方 Desktop 打开失败诊断循环

状态：source CI-ready；尚未执行新的 live loop，不能据此宣称复现或修复。

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

1. 独立 Swift 探针使用当前项目 `prepare-desktop.mjs` 和 native `NSWorkspace.OpenConfiguration` 边界，连续 5 次启动。记录真实 NSError domain/code/message/underlying chain、目标 bundle/PID/launchDate、信号与清理耗时。仅正常 terminate 当次精确 bundle、PID 和 launchDate 对应的实例；无法确认归属或正常退出时停止重复。
2. 构建一次当前 Debug candidate，重复 3 次原 T02 应用命令。独立 Dart observer 只读取现有应用 VM extension 的 `observe` 状态，直接记录第一次 `PlatformException(open-failed)`，不发 UI action、不调整产品或共有 driver 的超时与清理。

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

Swift 类型检查与编译通过，固定 Dart 工具链的 format/analyze 通过，workflow YAML 和全部 10 段 shell 的语法检查通过。本机真实非 CI 调用分别被 Swift/Dart guard 拒绝，退出 2/255，未启动应用；这些是边界验证，不是业务缺陷红循环。已按普通 merge 同步最新 integration；主线程负责集成与 push。新的 artifact 与实际结果将在 live workflow 完成后绑定到精确 source SHA，补记本文件。原绿色验收不能覆盖最新失败，也不能用诊断 workflow 替代正式 native acceptance。
