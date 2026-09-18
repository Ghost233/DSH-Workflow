# npm 生成锁文件修复与安装诊断（2026-09-14）

用户要求生成修复。使用与正式Runner相同的Node v24.12.0/npm11.16.0，在独立临时目录复制上一候选的package.json、package-lock.json和项目.npmrc；未改用户配置或既有候选。

## 生成与校验

1. 对原候选运行npm ci --dry-run：exit1，明确Missing: fsevents@2.3.2 from lock file。
2. npm install --package-lock-only生成完整依赖树；禁止生命周期脚本的参数仅用于生成和dry-run诊断，不应用到正式验证。
3. npm生成了node_modules/playwright/node_modules/fsevents@2.3.2，与根fsevents@2.3.3并存。
4. 仅提取npm实际生成的缺失条目，保留npm规范化时删除的4个无关optional/peer旧条目，未修改任何原条目的版本、integrity或依赖声明。
5. 对最小修复再次执行完整npm ci --dry-run，exit0；所有原锁条目保持，package.json及项目.npmrc保持。

最小修复文件SHA256：851d4898f222a181e18bd075b313a14e39a612d6be5cbf3d511a6e5c00f5df06。`repair.patch`是待应用的完整差异；`repair-result.json`保存命令及结果。此时未安装node_modules；dry-run通过不代表浏览器smoke通过。

## 实际安装诊断

随后在同一临时目录对修复文件运行真实npm ci，开启foreground-scripts以观察浏览器安装步骤，未跳过生命周期脚本，保持300秒上限。npm已通过锁文件校验并实际下载浏览器：162.3MiB Chromium完成，91.1MiB Headless Shell达到约40%时触发300秒超时。此复现说明该次超时期间存在持续下载进展，不是DAG死循环；不证明所有历史超时都只有同一个原因。

该诊断不是正式Workflow验证，未把部分安装发布为有效缓存或伪造通过。`actual-install-result.json`和对应stdout/stderr日志保留现场。

## 正式流程的限制

Owner任意Shell命令按设计是只读的（owner-access.mjs:30），因此本轮先外部生成经校验的文件内容，再由Owner通过已有受限文件工具应用。没有放宽Owner权限。

当前task.retry把所有已结算execution_error统一视为仅能原候选重验，直到旧attempt deadline到期，即使独立审查已证实是候选lockfile缺陷。本次纯内存模拟确认同一输入在deadline前拒绝、后接受，未改写live state。这个恢复分类限制是独立待优化项，不以改时间或状态绕过。

原窗口于本地12:39:23.831结束后，通过原生已批准额度正式返修一次。当前used16/limit16，旧历史未重置。此前主线程在窗口前提前调用了一次task.retry，被准入拒绝且未扣除次数。

## 官方依据

- [npm install：package-lock-only](https://docs.npmjs.com/cli/v11/commands/npm-install/#package-lock-only)
- [npm ci：锁文件与清单一致性](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

Context7本次返回月度额度耗尽，使用npm官方文档及本机同版本npm源码/实际命令验证，没有修改认证配置。

## 正式应用及验证最终结果

- Owner应用和候选冻结均成功；本轮新候选为99d625c28c94508015cfe389ea8c08d770c8766c00b2d432d290647dc0ebc021。
- 新候选的lockfile哈希与生成并完整校验的目标完全一致；候选文件差异只有package-lock.json。
- 正式npm ci越过原Missing/EUSAGE错误并进入browser-chromium生命周期；依赖准备约302.2秒触发300秒总期限，正式smoke未执行，独立Reviewer拒绝验收。锁文件修复成立，整条业务验收不成立。
- 上层dependencyFailure.timedOut=true；底层命令回执aborted=true、timedOut=false、managedRangeStopped=true。这是上层准备期限触发中止，不能混写成未停止/失联。
- 正式安装移入保留的quarantine目录，实际仍有chromium-1208/INSTALLATION_COMPLETE；不能因原installer位置没有浏览器目录就认定没有下载或项目npmrc无效。
- Owner额外在只读Shell执行dry-run得到缓存EPERM，不能据此认定用户缓存损坏或修改权限。外部同版本npm的完整校验已经通过，正式Runner使用自己的隔离安装目录。
- 仅在新候选中应用修复，未通过验收，故尚未集成到业务项目。当前16/16停止，没有进一步retry、replan或修改用户配置。
- 计划、激活记录、Registry基线、policy、集成head、其他任务、全部旧attempt和用户DSH配置逐项保持；详见result.json及配置哈希。

正式依赖准备指标：installRuns=1、fullTreeCopies=0、cacheAcquireMs=302207。额外临时诊断安装1次用于取得浏览器下载的具体进度日志；未把该部分安装当作有效共享依赖复用。
