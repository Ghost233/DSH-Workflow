# jevcore 实际测试与独立用户反馈

检索日期：2026-10-05（Asia/Shanghai）。目标项目为 `PerryLink/jevcore` 及其 `jevcore-dsh`、`jevcore-mcp` 包；排除同名项目与只谈 Jev 模型的评测。

## 结论

作者报告了真实 TypeSafe / OpenRouter API 调用与 MCP 调用测试。公开检索中未找到可核验的独立用户长期使用评价，也未找到独立的 DSH 完整工作流性能对照。因此，之前对它的推荐依据是接口能力与本需求的匹配，而非已有充分用户口碑。

没有找到公开评价不等于没人使用；Star、下载量、插件目录收录与作者自测均不能直接当作独立用户满意度证据。

## 找到的证据

### 1. 作者自测：实际 API 调用存在，但范围有限

当前 README 报告通过 TypeSafe 与 OpenRouter 调用真实 System One 模型，测试 typed questions、排序和证据核对。它也报告 DSH 插件激活与工具调用成功，但该 DSH 示例使用的是 mock；不能把示例中的 1 ms 当作真实 Jev 延迟。作者明确说明仍缺少真实工具调用的 gate 端到端验证，以及长期和对抗性测试。[作者的 Status](https://github.com/PerryLink/jevcore#status)

这些是作者公开的测试记录，本次未独立重跑。

### 2. 独立仓库的兼容性排查：具体到旧版本，不是功能评价

`Quyenld9699/dsh` 保存的 2026-09-30 Windows 排查报告，记录环境为 DSH `0.2.0-rc.2` / Node `24.20.0`。在 Jev 插件兼容性表中，作者指出 `jevcore-dsh@0.4.1` 的 `dsh-tools <0.2.0` peer 范围会被 DSH preflight 阻止安装。该报告主复现对象是另一个插件 `dsh-jev-verify`，对 jevcore 的条目属于兼容性检查，不能推导出其已完成真实 Jev 工作流实跑。[固定版本排查报告，第 4(b) 节](https://github.com/Quyenld9699/dsh/blob/5ba8a9de4abaee8a526a6e6a4645799357334d47/backup/JEV-RCA.md)

查询时 jevcore 主分支的 DSH 包清单已为 `0.4.2`，peer / engine 范围已经加入 DSH 0.2.x。旧报告不能当作当前版仍不兼容的结论；源码声明更新也不等于本次已验证 npm 发布或运行兼容性。[当前 DSH 包清单](https://github.com/PerryLink/jevcore/blob/main/packages/dsh/package.json)

### 3. 外部维护者推荐：推荐存在，使用体验未附

`buberlo/dsh-jev` 停更后推荐迁移到 jevcore。该推荐来自其他项目的维护者，有参考意义，但未附使用时长、任务样本、性能对照或问题记录，不能视为独立实测评价。[停更声明](https://github.com/buberlo/dsh-jev)

### 4. GitHub 反馈：没有用户体验讨论

通过 GitHub API 查询时，jevcore 仓库创建于 2026-09-20，共 1 个 Issue、0 个 PR，未启用 Discussions。唯一 Issue 由 `Dominic789654` 于 2026-09-28 发布，内容是加入 Awesome DeepSeek Harness 目录的通知，评论数为 0；没有记录安装过程、使用效果或缺陷。[Issue #1](https://github.com/PerryLink/jevcore/issues/1)、[PR 列表](https://github.com/PerryLink/jevcore/pulls)

这些计数仅是查询时状态，不能证明没有真实用户或没有缺陷。

### 5. 目录网站：不能替代真人口碑

- dsh.so 公布过自动安装检查，测试对象为 `jevcore@0.4.1` 核心包，记录安装成功但未挂载 DSH 能力；它没有测试到 `jevcore-dsh` 的完整功能。这是平台自身的检查记录，不是真人使用体验。[检查页](https://www.dsh.so/artifact/jevcore/)
- dshfind 的反馈区查询时显示 Useful 0 / Not recommended 0；没有用户评价正文。[反馈区](https://www.dshfind.com/en/plugins/PerryLink/jevcore)
- AgentStack 查询时显示 No reviews yet；其自动源代码检查不表示完成运行或性能验证。[目录页](https://agentstack.voostack.com/l/mcp-perrylink-jevcore)

## 检索边界

使用准确名称与仓库名，检索英文/中文使用、安装、评测与故障关键词；社区探查覆盖 Reddit、HN、Lobsters、X、V2EX、Linux.do、知乎、dev.to、Medium 和一般博客。GitHub 查询覆盖完整 Issue/PR 及评论，并以代码搜索探查非 PerryLink 仓库中的引用。

另一个非作者仓库 `kashman001/ai-workspace-template` 有 Jev 接入调研，明确写明没有 API key、没有调用模型 API；该文档只是列举 `jevcore-mcp`，因此排除为真实使用评价。[调研记录](https://github.com/kashman001/ai-workspace-template/blob/a753c1bfb5dbc56111a242bcfd1ba00900939199/work/jev-integration/research/integration-paths/pass/mcp-cli-adapters.md)

未登录的搜索覆盖不包括私聊、私有仓库或未被搜索索引的使用经历。没有把本次搜索结果描述为对全部用户的调查。
