# 浏览器任务定向返修复测（2026-09-14）

本轮实际执行了 Owner 返修、候选冻结、固定验证和独立审查，**结果未通过**。DAG 保持 planVersion=3，未重规划。

## 通过及失败

- 正式批准一次恢复，历史 used 从14到15，上限15。旧候选与全部历史保留。
- Owner 修正了根 `fsevents@2.3.3` 的错误 integrity；新旧候选 lockfile 只差这一行。对照官方元数据的条目检查从失败变为通过。
- 新候选：`ab6c1c53f3b04f39e22eccc46709922abdc63e25f8e4f197c3b746ebaba0d9f5`。
- 新固定验证动作：`act-5fd287e21f17baa260d9c79fd745cbb1319697f6`。
- 正式 `npm ci` 在约11秒内退出1，`timedOut=false`、`managedRangeStopped=true`。不是上一轮300秒超时。
- 错误：`EUSAGE` / `Missing: fsevents@2.3.2 from lock file`。
- `playwright@1.58.2` 精确要求 optional `fsevents@2.3.2`，而 lockfile 只有根2.3.3，没有可解析的2.3.2条目。Vite/Wrangler仍需要2.3.3，不能只替换根版本。独立Reviewer也确认该缺项。
- 浏览器下载和原固定 `node scripts/playwright-harness-smoke.mjs` 均未在本轮执行，完整端到端验收未完成。

## 暴露的问题及后续修复依据

Owner 只修复单个校验值，并以字符串/语法检查确认新增锁条目，漏掉依赖树完整性。下一次应使用包管理器生成并校验完整的锁文件，覆盖Playwright的精确传递依赖，再执行同一固定smoke。不能用跳过安装、修改缓存/用户配置、放宽超时或重写DAG解决本次候选缺陷。

上轮隔离目录发现Chromium安装完成标记，但其余浏览器组件未齐；只能说明有部分安装成果，不能证明超时的完整原因。该旧超时仍未被新的安装验证排除。

主线程另曾在本轮Owner仍running时，将历史失败误报为当前终态，已通过实际attempt/action状态纠正并记录；不能将额度用尽等同于正在运行的任务失败。

## 保留与证据

当前15/15停止，未再申请额度或重复retry。DSH继续运行，浏览器复用原3080页面，未修改框架/上游源码或用户配置。

- `dispatch.json`：原生恢复授权、Owner派发与状态误报纠正。
- `lock-check-before.json` / `lock-check-after.json`：原错误及单行修复证据。
- `result.json`：安装回执、独立审查和DAG/旧任务/旧attempt/用户配置保留核对。
- `configuration-hashes-before.json` / `configuration-hashes-after.json`：用户DSH配置哈希一致。

本轮依赖准备安装1次、完整复制0次，cacheAcquire约11.3秒。锁文件变化导致依赖身份变化合理；失败安装未当作有效缓存复用。
