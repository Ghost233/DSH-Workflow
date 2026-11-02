# Matt 1.9.0-beta.33 升级记录

## 固定来源

派生版从 `1.9.0-beta.32.workflow.1` 升级到 `1.9.0-beta.33.workflow.1`。上游发布标签指向 `0e957cf46dbacdef8c1bcc119189e38e1080d956`，npm 元数据中的 `gitHead` 为 `34d26637d84febf5f977cc4008267ca0d0282310`。两个提交的差异只有上游发布工作流，插件源码一致。

三方提案涉及 391 个路径：105 个自动合并、242 个新增、5 个冲突和 39 个上游删除。GitHub 后端目录发生重组，其中三个被删除的旧路径带有本地定制；这些定制通过三方合并迁移到新路径。保留独立中文技能提供器、macOS 路径规则、账号注入和禁止在线自更新的定制。

上游新增的客户端工厂来自 `dsh-featherhunter-plugin-base@0.1.5`。构建使用锁定版本生成内联客户端，并随包保留其 MIT 许可证。新增上游能力账本生成器纳入固定来源。

## 验证

构建使用 `npm run build --prefix matt-skills-panel-plugin`，派生测试使用 `npm test --prefix matt-skills-panel-plugin`。维护中的 15 份 TypeScript 配置使用 `tsc --noEmit` 检查。测试保留原有业务断言，并覆盖新的权限来源字段与内联客户端许可证。
