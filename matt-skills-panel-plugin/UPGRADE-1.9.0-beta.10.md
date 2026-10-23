# Matt 面板 1.9.0-beta.10 升级记录

## 来源与范围

本次派生版为 `1.9.0-beta.10.workflow.1`，随 Ghost DSH Station 0.4.1 发布。原版子模块与派生基准统一固定到已发布版本的提交 `f8ccc9c4964477d6c6753ebff2d0244afd7bc0dd`。

三方合并基准为 beta.5 的 `ea0dc0736bbfe9fea0fbe4753a524ab4fc007493`，本地一侧来自主仓库提交 `56972a02b8ebc9917196a00cee901b30ddeedf79`。提案覆盖 503 个路径，另按上游重命名关系审查本地定制。

npm 包记录的提交为 `2298c11e6e5049010258a65f4ad277c0aad95383`。与发布标签相比，仅少一项研究文档删除；本次导入的源码与构建输入一致。

## 保留的定制

| 功能 | 本次处理 |
| --- | --- |
| 包与界面身份 | 继续使用 `dsh-workflow-matt-panel`，宿主、客户端和工具保持一致。 |
| 独立中文技能 | 保留外部提供器、工作区透传、详情缓存及缺文档与服务失败的区分。 |
| 技能文案 | 将 implement-spec、pr 和 retro 的中英文定制迁入 `config/copy/skilldesc.yaml`。 |
| 仓库 GitHub 账号 | 保留 `.ghswitch` 动态读取、出站 `GH_CONFIG_DIR` 和 `BASH_ENV` 接线。 |
| macOS 路径 | 保留大小写、字面反斜杠和 Markdown 文件写入队列。 |
| 自更新 | 宿主安装接口和客户端入口继续停用，升级随 Workflow 发布。 |
| 插件卸载 | 保留工具注册重试取消及晚到结果守卫。 |
| 生产依赖 | 继续将日志和 YAML 模块内嵌到包内，迁移后仍检查相对引用与许可证。 |

上游在 bundled provider 内新增的 ask-matt 推荐规则不注册。本派生版继续使用独立中文技能提供器，不恢复随包技能目录。

## 构建迁移

采用上游 `.mts` 构建脚本及 `.build/shared` 域产物布局。保留 `scripts/build.mjs` 和 `scripts/ts-hook.mjs` 作为项目现有命令的入口。

采用上游构建锁、缓存与并发检查。缓存同时覆盖本地许可证、来源声明、词表 YAML、提示词 YAML 和 `package/vendor`。构建仅写派生目录，不修改已安装插件或用户 profile。

上游源码中的 NUL 字符曾使三方提案中断。提案工具现可直接接收未被本地修改的文件；双方均修改的含 NUL 文件会标为人工审查，不覆盖本地源码。

上游将未知命令的刷新策略改为 `default-tick`。macOS 回归仍验证 Windows 命令不被识别为确定写入，断言同步采用新刷新策略。

## 验证命令

- `node matt-skills-panel-plugin/scripts/build.mjs --pkg-only`。
- `npm test --prefix matt-skills-panel-plugin`。
- 使用固定 TypeScript 工具链逐项运行客户端、契约及各源码域的 `tsc -p`。
- 主仓库完整项目回归、发布流程回归及候选 App 的完整 Flutter 验收。
- 真实隔离 Host 核对插件加载版本、随包解析路径、界面入口和正常停止。

最终退出码、源码输入摘要和包校验结果随本次发布验收记录保存。本次发布不升级本机现有 App 或共享 Core。
