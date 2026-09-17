# Approve for Me：DSH 0.1.6 项目适配

项目包名为 `dsh-approve-for-me-workflow`，保留原设置命名空间 `approve-for-me`。基于固定上游 `dsh-approve-for-me` v0.2.2（`a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`），对应未修改的 DSH `0.1.6-alpha.1`（`0d1f50007f9bca3f52b06e1c3074fa14d5fb0720`）。原风险判断、字面前缀解析、复核提示与表单数据规则编译进项目包；只替换宿主和前端接入。

## 使用

项目日常 Web 宿主会自动把审批适配层加入临时组合。只需从目标项目运行统一入口：

```sh
./start-owner-workflow.sh
```

启动器会在组合期禁用旧审批宿主条目并只加载一份项目适配层；它不卸载包，也不写回用户 profile。旧设置继续使用原命名空间。不要在同一宿主中另行装配第二份审批宿主。

在 **设置 → 插件 → 插件配置 → Approve for Me** 编辑并保存。设置页不会改变会话权限；使用时需将会话权限选择为 **Approve for me**。标准 bundle 保留 read-only、workspace-write、danger-full-access 和原来的默认权限推导。自动授权只返回本次精确工具调用的 `allowed-once`，不放宽会话的长期沙箱模式。

流程为：关联实际 Agent、callId、工具名和精确升级理由 → 固定风险检查 → 字面前缀匹配 → 可选模型复核 → 单次授权。无法匹配、固定高风险、复核不允许、异常、取消或超时都会回到原生审批。模型复核通过原生 spawn 创建隔离的短期复核者，只暴露结构化结果工具。Owner 的 `owner_submit` 等授权以及 Operation 的独立审批链路不由此插件接管。

复核期间修改审批设置、切换权限或卸载插件，会让未完成的允许结果失效。设置表单使用原生 SettingsScope 与 revision：冲突时保留草稿、禁止覆盖，需载入最新设置后重新编辑。现有暂不可用的模型路线、隐藏的 timeout/limits 会保留；新增不可用模型路线不能保存。

## 定制 profile

DSH 的 Cordis patch **整体替换 config，不合并嵌套字段**。`cordis.patch.yml` 因此只适用于官方标准权限表。定制 profile 在启动前应对最终已解析的配置调用 `composeApprovalPatches(entries)`（`compose-patch.mjs`），把返回的 patch 作为最后一层装配，且不要再叠加标准 bundle 的权限 patch。

该函数保留原权限表、声明顺序、默认选项和旧宿主配置，禁用旧宿主条目后加入项目适配层；拒绝冲突策略、重复宿主、无法解析的动态配置。它不写 profile、不卸载包、不修改 DSH。函数已接入项目启动准备流程，并通过真实官方 Web 装配测试：旧宿主不加载，原配置和默认权限保留，只有一份审批设置和客户端。不会卸载旧包或改写用户 profile；直接通过标准 bundle 安装仍需遵守本节的定制配置边界。

## 构建和验证

源码位于 `src/`，只在项目侧修改。构建器先核验 `upstream.json` 中的上游摘要，再通过固定工作区工具链生成 `index.js` 和 `client.js`。安装包运行时不依赖上游 TypeScript 文件。

```sh
node approve-for-me-workflow-plugin/scripts/build.mjs
node approve-for-me-workflow-plugin/scripts/build.mjs --check
npm --prefix approve-for-me-workflow-plugin test
node --import ./deepseek-harness/node_modules/tsx/dist/esm/index.mjs --test owner-workflow-plugin/test/harness-integration.test.mjs
```

原生沙箱与 Chrome 验证需在可以启动系统沙箱/浏览器的环境执行；测试使用临时 profile、工作区与脚本化模型，真实执行的诊断命令为 `node --version`。PowerShell 表单和策略共享上游解析，但本轮在 macOS 验证，没有宣称 Windows 执行器验收。整体工作流候选验收见项目升级记录。
