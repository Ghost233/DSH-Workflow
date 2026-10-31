# Matt 1.9.0-beta.32 升级记录

## 固定来源

派生版从 `1.9.0-beta.31.workflow.1` 升级到 `1.9.0-beta.32.workflow.1`。上游 npm 版本的 `gitHead` 是 `fac909c1aeffec3dd6907f433e4e3756c1f6087c`，与官方标签一致。

三方提案涉及 30 个路径：27 个自动合并、2 个新增和 1 个冲突。冲突只涉及包名和版本，保留派生包名并更新版本。保留独立中文技能提供器、macOS 路径规则、账号注入和禁止在线自更新的定制。

上游将 Markdown 工单按钮改为打开目录，原因是 Windows 文件名处理差异。本项目仅支持 macOS，因此继续打开工单文件。其他通过审查的提案已合入。

## 验证

构建使用 `npm run build --prefix matt-skills-panel-plugin`，派生测试使用 `npm test --prefix matt-skills-panel-plugin`。全部 79 项测试通过，维护中的 15 份 TypeScript 配置检查通过。

新增回归测试覆盖未打开工作区的稀疏设置、macOS 大小写与反斜杠路径，以及 Markdown 工单的打开方式。测试、三方提案与更新前文件保存在 `.build/dependency-update-20261031-1gG2oW/`。
