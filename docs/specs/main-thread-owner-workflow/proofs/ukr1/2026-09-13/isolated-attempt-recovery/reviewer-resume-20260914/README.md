# Reviewer 恢复与实际 Owner 验证（2026-09-14）

本轮 Reviewer 补齐了关闭记录，**同一已审查 DAG 成功激活为 planVersion=3**，未重新派发 Planner。Runner 随后完成浏览器 Owner 开发、候选冻结和独立验证；验证在依赖安装阶段失败。整条业务验收仍未完成。

## 已通过的流程

- 经原生批准，仅恢复一次 Reviewer，used 从13到14，当前14/14，历史未清零。
- Reviewer `act-436c085e769b9bab4c29a220fd4da7b7dc719555` 提交有效 `obligationClosures`，关闭旧 wrapper 义务。
- 新活动 DAG 与上一轮已审查 DAG 完全一致；源码基线绑定准备成功，未新派 Planner。
- seed成功记录、foundation失败记录、旧隔离attempt及其容量保留；用户DSH配置哈希、Registry及原始policy不变。
- 浏览器Owner attempt：`try-079e32f49bbfe7a46e3776f15df75212450c55d8`，已提交冻结候选。

## 本次实际失败

- 候选：`7febdf0adb3778432ef21d8fb428f14644de07cdbd4c30943cef13d7f6610ae6`。
- 验证动作：`act-6ca4b95540704add9df58fe258e8c34adbbec38f`。
- 固定命令应为 `node scripts/playwright-harness-smoke.mjs`，但准备依赖的 `npm ci` 超过300秒上限；`exitCode=-1`、`timedOut=true`、`managedRangeStopped=true`。
- 故障阶段为 `install`，不是旧 `cache_seal` 问题；metrics记录安装1次、完整复制0次、cacheAcquire约302秒。本次依赖输入变化产生新key，未将未完成安装当作可复用环境。
- npm日志最后未结算的生命周期脚本是 `@playwright/browser-chromium@1.58.2 install`。普通bufferutil、utf-8-validate、bigint-buffer已报成功。当前回执未给出浏览器脚本具体停在哪个步骤，不能断言是下载失败、`.npmrc`警告或某个单一原因。
- 独立代码审查确认大部分wrapper、路径设置、smoke结构已实现，但因没有实际浏览器通过证据拒绝候选。

## 额外确认的候选错误

Owner手工修改lockfile时，把 `node_modules/fsevents` 的 **2.3.3版本和tarball** 配上了 **2.3.2的integrity**。项目基线的2.3.3校验值原本正确。已与npm官方两个版本元数据逐项核对，npm回执中也两次出现同一tarball校验损坏警告。

该错误是明确待修复项，不能仅将这次失败归为环境问题；但现有证据也不能证明它独自解释了全部300秒超时。先修正候选的lockfile一致性，再定位浏览器安装脚本的实际阻塞步骤。此后仍需运行原固定smoke及独立审查，不能直接认可当前候选。

## 当前状态及证据

当前14/14已停止，没有自动retry/replan或再申请额度。1个任务完成、2个失败、13个待执行。foundation原有“版本化可复用unary/stream场景”缺口仍保留。本轮没有修改框架源码、DSH用户配置或第三方代码。

- `activation.json`：原DAG保留、Reviewer结果和激活证据。
- `result.json`：候选结果、停止证据、依赖指标及逐项保留核对。
- `approval.json`：本轮原生授权记录。
- `fsevents-lock-mismatch.json`：候选与项目基线条目的精确对比。
- `fsevents-registry-evidence.json`：来自 https://registry.npmjs.org/fsevents/2.3.2 和 https://registry.npmjs.org/fsevents/2.3.3 的官方元数据。
- `configuration-hashes-before.json`、`configuration-hashes-after.json`：用户配置未变证明。

DSH继续运行在原3080页面，未打开新标签页，所有候选、安装失败隔离目录与旧执行证据保留。
