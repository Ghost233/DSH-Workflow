# DSH Workflow Matt 面板

本目录是主仓库维护的 MattSkillsDeck 派生版本。上游基准见 `upstream.json`。

保留面板与工具，技能由独立中文提供器加载。原版 submodule 保留原样用于对照升级。构建只写本目录，不同步用户 profile，不重启服务。

```sh
npm ci --prefix matt-skills-panel-plugin --ignore-scripts
npm run build --prefix matt-skills-panel-plugin
npm test --prefix matt-skills-panel-plugin
npm run upstream:check --prefix matt-skills-panel-plugin
```

派生版随 DSH Workflow 构建更新，面板中的原版 npm 自更新已停用。来源与许可证见 `THIRD_PARTY_NOTICES.md` 和 `LICENSE`。

## 对照上游升级

1. 在工程正常的上游更新流程中 fetch 原版 submodule，保持其源码干净。GitHub 操作使用根目录约束指定的 Ghost233 账号。
2. `npm run upstream:check --prefix matt-skills-panel-plugin` 比较已记录的基准与本机最新的 `origin/main`；命令本身不联网、不切换 submodule。
3. `npm run upstream:check --prefix matt-skills-panel-plugin -- --prepare` 在 `.upstream-review/<目标提交>/` 生成三方合并提案与 `review.json`。也可在参数末尾指定已获取的 commit 或 ref。
4. 审查每个变更；`clean-merge` 也须检查。冲突、上游删除、本地删除或路径新增冲突单独处理。只将审查通过的文件合入派生版，保留面板专用 bootstrap、独立包标识、禁用自更新及无 profile 同步的构建行为。
5. 运行构建与全部派生版测试，再将 `upstream.json` 的 commit/version 更新为审查目标，提升根开发清单和 `package/package.json` 的本地版本，重新生成 npm 锁文件。源码、基准和锁文件一起提交主仓库。

提案工具不覆盖源码、不删除文件、不自动提升基准。变更判断依据完整 commit，避免上游未提升版本号时漏掉更新。新上游出现导入范围以外的构建依赖时，按构建脚本实际需求补充 `sourcePaths` 和源码。
