# Tobs 项目协作插件

本插件负责 GitHub 触发、任务树、派工凭证、逐级汇报与恢复。Tobs 保留 Bot 身份、独立记忆、Orchestrator 和 Assignment 的原生管理；DSH 保留执行、工作区和验证工具。本插件不修改它们的源码。

已确认的需求见[设计](../docs/project-coordination/design.md)，真实接口见[运行时核验](../docs/analysis/2026-11-10-tobs/runtime-contracts.md)。

## 配置

日常入口仍为无参数 `./start-dsh-workflow.sh`。插件随项目装配；未配置仓库时保持待配置。不会从 Git remotes 或历史聊天自动推断授权。

1. 在 Tobs 中创建总负责人、仓库负责人和初始专业成员，保存它们的真实 Bot slug。每个 Bot 使用 Tobs 自己的模型和记忆设置。
2. 复制 `configuration.example.json` 到自己的私有配置目录，填入 Bot、仓库、白名单、现有 checkout、预授权执行根目录和项目固定验证命令。准备好工程环境，插件不安装工程依赖。
3. 为每个仓库设置独立的 `ghConfigDir` 和实际登录名 `githubActor`；顶层 `ghExecutable` 填 gh 的绝对路径。插件按仓库从该目录的 gh 登录读取凭据，在进程内核对 GitHub 实际身份，清除继承的 Token 覆盖，不切换全局账号，也不把凭据写进项目。也可沿用旧的 `tokenEnv`，两种方式只能选一种。Git 提交与推送身份仍需按仓库配置本地 helper；Codex 的项目环境不会自动作用于 Tobs 原生 shell，直接调用 gh 时需显式指定账号目录。
4. 在 DSH Settings 的 `workflow-project-coordination` 中把 `configurationFile` 指向该 JSON 的绝对路径。配置文件就是常设授权的具体记录；修改仓库、岗位或权限前审阅文件。本插件不写入 Token，也不打印 Token。

项目接入的标准顺序是：固定仓库 GitHub 账号 → 创建仓库负责人 → 建立或复用项目分组 → 把负责人和专业成员归入分组 → 核对 GitHub 轮询。每个已配置仓库对应一个原生频道分组，默认使用仓库名；不同 owner 下同名仓库使用完整 `owner/repo` 区分。插件按持久分组 ID 复用，保留用户改名，不反复创建分组。新建的专业 Bot 自动归入所属项目；总负责人保留在全局。现有非项目频道、置顶、隐藏和免打扰设置保持原值。原生分组服务不可用时保留记录、退避重试并向上报告。

负责人通过 `project_work team` 查询当前授权成员、上下级和岗位模板。与总负责人聊天后，调用 `project_work inbox` 获取真实 Human 消息的一次性受理凭证。GitHub 默认每 60 秒增量轮询，事件持久保存，通过系统 Schedule 唤醒对应负责人；Schedule 仅负责唤醒，任务真相在插件 SQLite 中。

## 执行与汇报

- 总负责人拆分跨仓库目标，仓库负责人拆分 Issue，专业负责人继续拆分。每项任务只有一位当前负责人，下级可接受、拒绝或要求澄清，拒绝返回直接上级。
- `prepare_execution` 创建或核对工作目录、原生 Workspace/Grant，并返回原生 `create_assignment` 参数。负责人必须调用返回的原生工具。一般恢复返回 `send_assignment_request`；显式恢复已停止的 Session 使用 `unarchive_assignment` 并检查投递结果。两者都保留原 Session 和模型路线。
- Assignment 的 `project_work verify` 执行配置中固定的 argv 命令，记录真实退出码与输出摘要。代码需已暂存或已提交，没有未处理文件；验证后提交的树必须与证据相同。
- Assignment 提交并推送分支后调用 `deliver`。插件核对 GitHub 实际 PR 的仓库、分支、HEAD 和可审查状态，再记录“已交付”。同一任务的新提交更新原 PR。验证通过和 Bot 自述都不等于最终完成。
- `report` 接受进展、等待、阻塞或附证据的无需变更结果。无需变更上报会先核对干净工作树和最初基准树，已有代码变更必须走 PR。直接上级验收；代码变更还需核实同一 HEAD 的合并结果。父任务不会因一句“完成”自动关闭。
- 重要状态逐级进入上级的持久事件队列，并回写 Issue 评论，最终验收通过后关闭对应 Issue；总负责人用任务快照提供汇总。普通进展不逐条回写。插件没有合并或发布 API。

真实 `agent/error` 事件会保留原任务、通知直接上级并进入退避；成功的项目工具调用清除该 Bot 的失败退避。网络、限流或模型执行失败采用持久退避等待，保留原执行与副作用凭证。网络恢复后先核对 Issue、PR 和 Session。失败的唤醒 Schedule 会换成新的插件自有 Schedule；原生旧事件仍可能再次出现，因此任务和派工凭证继续去重。Tobs 对连续非瞬时错误的原生锁止没有公开的系统解锁接口：插件向上报告并等待真实 Human 在原生界面恢复；人工停止同样不会被自动绕过。HTTP 写入结果不明时不会盲目重发；无法找到唯一结果会保持待核对并报告负责人。

停止任务默认覆盖全部子任务，只停止已核实绑定的 Assignment。人工停止优先于自动重试；用户停止需要新的真实 Human 消息凭证恢复。临时成员按批准模板和模型创建，先排空工作再在 Tobs 中暂停；记忆和历史保留。

## 构建与验证

官方源码提交、Provider 提交与构建工具链在 `vendor/tobs.upstream.json` 中。原始包组保存在 `.build/tobs-upstream/artifacts/`，不提交缓存；缺少缓存时先执行官方源构建，不能在线替换为同名 npm 版本。

```sh
BUILDX_CONFIG="$PWD/.build/tobs-buildx" docker compose -f tools/registry.compose.yml build tobs-builder
docker compose -f tools/registry.compose.yml run --rm tobs-builder
node scripts/fetch-tobs-assets.mjs
```

二进制下载若受网络影响，可先运行下载脚本，再重跑官方 prepare；下载内容均校验官方摘要。全部源码构建完成后，在元数据容器中生成候选锁：

```sh
docker compose -f tools/registry.compose.yml run --rm registry node scripts/refresh-project-plugin-lock.mjs /output/project-plugins.lock.json
```

开发验证按根目录 `AGENTS.md` 的敏捷验证规则执行，只选择本次受影响的测试文件。例如，分组变更运行 `node --test project-coordination-plugin/test/project-groups.test.mjs`，gh 凭据变更运行 `node --test project-coordination-plugin/test/github-credentials.test.mjs`。原生接口的实际验证使用已有封装运行时；已有有效证据直接复用。

候选锁只有在清单摘要匹配、所有来源核验成功后才能替换根锁。根锁由脚本生成，不手改条目。Mac 应用构建通过 `sourceRoot` 读取已验证的完整 tgz 组，安装并封存生产依赖。交付后的运行端不依赖源码缓存，不联网换包。

行为测试中的 GitHub 服务和模型使用隔离 fixture。未绑定真实仓库、凭据和模型时，不能把 fixture 结果当作真实远端开发验收。
