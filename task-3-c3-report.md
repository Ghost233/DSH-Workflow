# Task 3 Review C3 修复报告

## 结论

C3 已修复：Owner 即使声明 `scope: ['**']`，也不能修改 `.owner-workflow/**`。

## 修改

- 在 `owner-workflow-plugin/src/runtime.mjs` 的 `isProtectedRelativePath` 中加入 `.owner-workflow` 及其所有子路径。
- `ownerTarget`（覆盖 `owner_write`、`owner_edit`）、Owner 执行后的改动检查、提交代理前后检查继续共用该保护规则；未修改 Registry、审批或 Runner 逻辑。
- 在 `owner-workflow-plugin/test/security.test.mjs` 增加 `owner_write`、`owner_edit` 和提交检查指向 `.owner-workflow/owners/x.md` 的回归测试，Owner scope 使用 `['**']`。

## TDD 验证

- RED：移除 `isProtectedRelativePath` 中的 `.owner-workflow` 规则后，新增写入/编辑测试因 `ENOENT`、提交检查因未识别受保护文件而失败。
- GREEN：`node --test owner-workflow-plugin/test/security.test.mjs` 通过，12/12 测试通过，0 失败。

未执行 Git commit。
