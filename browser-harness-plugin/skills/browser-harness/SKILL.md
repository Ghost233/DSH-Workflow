---
name: browser-harness
description: 使用 Browser Harness 操作真实浏览器中的动态网页、已登录页面和表单，并读取新状态验收操作结果。
---

# Browser Harness

开始浏览器任务前，读取[随包官方技能](references/SKILL.md)，通过 Shell 调用 `browser-harness`。本技能的官方资料来自应用固定的同一个上游提交。

官方技能提到 `interaction-skills/<文件名>` 时，读取本目录 `references/interaction-skills/` 下的对应文件。连接问题读取[固定安装说明](references/install.md)。这些本地资料对应应用采用的版本，优先于官方文档中的浮动 GitHub 链接。

把必要的观察、操作和确定性检查组合为程序。关键操作后读取新状态，按用户要求的业务结果验收；动作已发送不能代替任务完成。

如果 CLI 缺失或无法调用，报告真实错误。安装和升级由用户在任务之外处理，本技能不自动准备依赖。复用已有浏览器连接，按官方技能协调标签页；安装检查本身不连接 Chrome。
