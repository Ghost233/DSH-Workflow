# Task 3 I1：大小写不敏感路径别名修复报告

## 修复内容

- `isProtectedRelativePath` 现在对路径分隔符归一化后的 ASCII 字母执行大小写折叠。
- 以下受保护目录及其子路径均按大小写不敏感比较：`.git`、`.dsh-workflow`、`.owner-memory`、`.owner-workflow`、`deepseek-harness`。
- 普通文件路径仍沿用原有 scope 匹配逻辑，不受保护路径折叠影响。

## 回归覆盖

- `scope: ['**']` 下，`.OWNER-WORKFLOW/config.json` 与混合大小写别名被 `owner_write` 拒绝。
- `scope: ['**']` 下，混合大小写别名被 `owner_edit` 拒绝。
- 提交前检查识别并拒绝 `.OWNER-WORKFLOW/config.json`。
- 提交代理及提交后二次检查识别并拒绝该大小写别名。
- 普通大小写文件 `ordinary-Case.txt` 仍可正常写入。

## 验证

```text
node --test owner-workflow-plugin/test/security.test.mjs
14 passed, 0 failed
```
