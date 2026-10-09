> 当前已撤销接口相关的历史说明已移除。其余原输入记录保持原样；当前就绪来源与模块装配变化后的验收见正式 Spec 和 Ticket，旧成功不自动成为新候选通过证据。

# T02 — 官方 Desktop 打开失败诊断循环

状态：当前真实 parent 三次业务绿色、只读 RPC 与 Launcher/Desktop/Host 清理证据完整；Corrupt 未复现，原因未知。针对旧 Corrupt 的诊断阶段 1–2 仍未完成。

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

## Parent-first 实际运行与只读契约修正

[诊断 run 37420441555，job 112128371896](https://github.com/Ghost233/DSH-Workflow/actions/runs/37420441555/job/112128371896) 的实际 source 为 `31912475ed7cd24edec101549e2e05b136ff285e`，artifact 11392788006，下载 SHA-256 `2e439c0833abdf02839569639899091817d6978547bcb6cc95145d22d77ded6f` 与 GitHub 元数据一致。原 parent 应用命令三次均退出 0，wall 34.085 / 24.644 / 23.593 秒，UI/SDK 场景通过，未复现 Corrupt。

| 轮次 | Root 后缀 | Launcher PID / start UTC | Desktop PID / launchDateUnix | Host PID / lease |
|---|---|---|---|---|
| 1 | dsh-t01-xcBlvb | 12463 / 05:52:31.108621 | 12658 / 1791265960.554256 | 12849 / cfd9bc8e-a88d-4e3b-aaec-d9e2718151b4 |
| 2 | dsh-t01-782MDa | 13323 / 05:53:04.997290 | 13675 / 1791265992.1682181 | 13701 / 6a8fc2a9-dd74-4543-a10b-2bd1503d2379 |
| 3 | dsh-t01-KmOrvp | 14636 / 05:53:29.635932 | 15298 / 1791266016.759393 | 15325 / ddd079e6-d376-42d1-b665-9e2d7d02efd3 |

Root 均为 `/Users/runner/work/_temp/<后缀>`。各 Launcher executable 为其 `candidate.app/Contents/MacOS/DSH Workflow`；各 Desktop executable 均为 `/Users/runner/work/_temp/dsh-native-runtime-mount/DSH Workflow.app/Contents/Resources/desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness`，其 ledger 的 probeStartedAt 与对应 Launcher start 完全一致。逐轮 Launcher/Desktop 的原始 kill 查询均 exit 1，stdout empty，stderr 分别明确 `kill: <表内PID>: No such process`；receipt read-open ENOENT=2、lsof exit 1 / stdout+stderr empty。旧 gate 据这些事实返回 0，但没有保存 Host executable/start/raw ESRCH；Host 首 receipt 观测分别为 17.052 / 12.025 / 11.123 秒，这不是进程 start。Host 归属和退出证据仍未知，不能由 receipt 消失补造。

只读 observer 三轮均记录 RPCError，且 successful metadata 未取得。实际旧 response 只有 errorType 被保存，code/message/data 没有保存。契约核对确认：`lib/application_probe.dart` 对非 null 未声明 action 返回 extensionError，`observe` 不在声明中；正式 `tool/application_probe.dart` 读取传 args=null。新 observer 删除错误 action，与正式读取一致；仅第一 parent、extension 已注册后有界一次无效 legacy 只读请求，用标签保存实际脱敏 RPC 响应，再保存无 action 的首次实际读取响应。未知 action 分支仅抛 ArgumentError 后返回 extensionError，不执行 semantic/native action。这个 contract negative 不属于 Corrupt 业务红。

新门禁还要求从本轮实际 receipt 和 live 只读 PID 查询取得 Host executable、PPID、start，绑定固定 Node/Desktop 精确 executable、同轮 Desktop 与 lease，再于清理后取得 Host raw ESRCH；未捕获、不匹配或查询错误均退出 2。没有修改原共享 driver、产品、业务等待期限、Swift 15 秒或系统设置，也没有回填旧 Host 证明。

后置 Swift 只执行一次：native open 81 ms / PID 15857，normal terminate requested=true；61 次观察中首末 raw kill 均 exit 0、stderr/stdout empty，fresh 原生对象同 bundle/executable/launchDate 且 isTerminated=false，原 15 秒后仍活，probe exit 2 / wall 15.481 秒。实际 detach 16 / Resource busy，未观察 Corrupt NSError；这是独立早期退出不完成，不能称 cached-only 或代替原症状。新只读契约与 Host 门禁尚待窄 CI 实测；阶段 1–2 仍未完成。

本轮证据指针：`/private/tmp/dsh-flutter-implementation/T02/CI-37420441555/diagnosis.md`，原始与脱敏文件在同目录 downloads/raw、downloads/sanitized 和 logs。

## 当前真实读取与三 PID 完整清理验证

[窄诊断 run 37424611318，job 112141320925](https://github.com/Ghost233/DSH-Workflow/actions/runs/37424611318/job/112141320925) 实际 source `c1afe10924e08b42579c113074e81cb4eba2b82a`，artifact 11394986556，下载 SHA-256 `2abd52eafff6dd78e68ee7b7edd2ff83196ae64a69e71fee40530af6527ef92b` 与 GitHub digest 一致。

仅第一 parent、已注册 extension 的 legacy 请求 `args={action:observe}` 实际返回 `code=-32000 / message=Server error / data.details=Invalid argument(s): Unknown application probe action: observe`，只执行一次。实际 `args=null` 正确读取三轮分别成功 336 / 191 / 185 次，并取得首响应、候选只读签名/属性和 Host 归属记录。各轮首次 null 请求曾返回 -32601 Method not found，之后均有上述实际成功响应；该请求/响应在脱敏 artifact 中完整保存。contract negative 不计作 Corrupt 业务红，旧 source319 缺失的 code/body/Host 证明没有回填。

| 轮次 | Root 后缀 | Launcher PID / start UTC | Desktop PID / launchDateUnix | Host PID / PPID / startUnixSeconds | 命令 exit / wall ms | 正确读取数 |
|---|---|---|---|---|---|---|
| 1 | dsh-t01-WxDidc | 6600 / 2026-10-06T06:40:06.070377Z | 6902 / 1791268817.2867289 | 7043 / 6902 / 1791268823.0 | 0 / 57618 | 336 |
| 2 | dsh-t01-c7Q2LM | 8567 / 2026-10-06T06:41:04.168272Z | 8954 / 1791268872.906608 | 9062 / 8954 / 1791268874.0 | 0 / 32201 | 191 |
| 3 | dsh-t01-pXJcPh | 9676 / 2026-10-06T06:41:35.923642Z | 9956 / 1791268903.6453598 | 9979 / 9956 / 1791268905.0 | 0 / 29300 | 185 |

Root 均为 `/Users/runner/work/_temp/<后缀>`，各 Launcher executable 为其 `candidate.app/Contents/MacOS/DSH Workflow`。Desktop 与实际 Host executable 均为 `/Users/runner/work/_temp/dsh-native-runtime-mount/DSH Workflow.app/Contents/Resources/desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness`。每 Host 的 live proc_pidpath 返回 146 bytes / errno 0；PS PPID 与本轮 Desktop PID 相等，lstart 查询 exit 0 / stderr empty，start 一秒精度。各 ledger 的 root/probeStartedAt 与 Launcher 完全一致；lease 分别 `d7f5f9f3-63ae-4263-9f00-3847415289f2`、`bc086ad5-0002-424d-b866-d3317fb6e1c0`、`bfdbf050-59d1-4cae-8dc1-ad84fa3b9d6d`，与本轮真实 receipt/Web 证据匹配。

逐轮 Launcher、Desktop、Host 共 9 个 PID 的原始 kill 查询都是 exit 1 / stdout empty / stderr `kill: <该PID>: No such process`，state=gone-ESRCH；逐轮 receipt read-open ENOENT=2，lsof exit 1 / stdout+stderr empty，四项 ownershipKnown/cleanupComplete=true，gateExit=0，stoppedForIncompleteCleanup=false。三个原完整 parent 场景 command exit 都为 0，当前稳定业务和清理验证已取得。Corrupt 仍为 0/3，原因未知；这是稳定观察，尚未建立能针对旧 Corrupt 变红的高复现/最小循环，diagnosing-bugs 阶段 1–2 未完成，不提出修复原因或假设。

独立后置 Swift 仍只执行一轮：PID 10398，native open succeeded / 156 ms，normal terminate requested=true；60 次观察中首末 raw kill exit 0，fresh 原生对象同 bundle/executable/launchDate 且未退出，原 15 秒后 tool exit 2 / wall 15.521 秒。该 private root 没有 Host receipt，实际 detach exit 16 / Resource busy；它是外部早期正常退出不完成，不是 Corrupt 红、不是 parent 场景失败，也不是 cached-only 猜测。固定 DMG 与三项 runtime payload 前后摘要一致。

本 run 仍使用当时旧 Web readiness 等待标准，三例没有该 deadline 失败。用户随后仅为真实 Web startup 调用授权等待实际 ready、可信失败立即退出；未来执行遵新约束，公共其它等待/Native 15 秒/ownership 不变，不从旧纯迟就绪 deadline 推断性能原因。证据：`/private/tmp/dsh-flutter-implementation/T02/CI-37424611318/diagnosis.md`；raw/ZIP/job logs 私有保留，分享仅用 downloads/sanitized 和 logs/job.sanitized.log。

## 新用户等待标准的完整 T02 验证

[Native run 37428158902，T02 job 112152486026](https://github.com/Ghost233/DSH-Workflow/actions/runs/37428158902/job/112152486026) 的 source 为 `7633f7d78884a6ae55af48c54fa103c75c6aed53`，T02 job SUCCESS；整体 run failure 来自其他作业，不归类为 T02 失败。artifact 11396261299，下载 SHA-256 `ef173bffa2a6cb326b2de40588beb33a6c5383fc39d3eff245eb2de9d6558893` 与 GitHub digest 一致。


隔离 root `/Users/runner/work/_temp/dsh-t01-dJATal`；Launcher PID 12520、executable `candidate.app/Contents/MacOS/DSH Workflow`、start `2026-10-06T07:16:29.693312Z`。Desktop PID 12595、launchDateUnix 1791271000.5998、executable `/Users/runner/work/_temp/t02-runtime-mount/DSH Workflow.app/Contents/Resources/desktop/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness`，其 probeStartedAt 与 Launcher 一致。实际 Host receipt PID 12908、lease `48a9a0f1-063d-449d-8a09-ae1b3b38ed0c`，首 receipt 23.019 秒、10 次 present；Host executable/process start 未由本完整场景 collector 保存，保持未知，不借另一 source/另一 PID 的 c1 证明补填。Launcher 最终 normal exit 0 / 33.644 秒。

owned Desktop helper capture/cleanup 两次实际 exit 0、observed already-exited=true；清理 collector 报告三个 PID exists=false，stderr 各明确 `kill: <12520|12595|12908>: No such process`。该 collector 没有保存每个 kill 的数值 exit/stdout，不虚填这些字段。receiptRemoved=true，lsof exit 1 / stdout+stderr empty，reuseAddr bind+listen 可用；raw no-reuse bind 实际 false/errno48，不描述为通过。实际 runtime detach exit 0。固定 DMG SHA 为 `f02b23ca5d2888bf5b0317a5b57736d114855eb4eef9f56fb90f95c15b5ed5af`。

当前新标准完整 T02 为真实绿色验证；旧 Corrupt 未在这些新样本复现，原因仍未知，不据绿色样本声称因果修复或补造高复现红循环。原始 ZIP/job logs 私有保留，脱敏证据在 `/private/tmp/dsh-flutter-implementation/T02/CI-37428158902/`；本阶段仅核对与记录事实，未改 shared wait/common code/product，也没有新 CI/build/GUI/push/issue 操作。
