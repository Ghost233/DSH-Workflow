# DeepSeek Harness 跨项目开发与工作树组织

## 建议

根据用户补充，前后端平时需要独立修复，也存在跨两边的开发任务。可以保留独立仓库，用普通父目录组织工作区，按需创建各仓 worktree。用户进一步提出使用父仓加 submodule，并让同一 Agent Team 按子模块分工；这也是可行方案，详见下节。它保留独立仓库，同时记录组合版本。

用户需要独立维护和同时开发两种方式。这份分析讨论 DSH 中的目录与任务组织，不涉及迁移现有仓库或修改 DSH。单边维护本身并不妨碍采用 monorepo，但当前需求没有必须合仓的理由。

## 同一 Agent Team 按 submodule 分工

用户进一步明确的方案是一套聚合仓 checkout，由同一团队的成员分别负责子模块。它可以利用 Team 的共享文件系统、成员消息和共享任务板。它与为含子模块的整个父仓频繁创建多份 worktree，是不同的使用场景。

```text
product/                         聚合仓，也是 Team 的工作区根目录
  frontend/                      submodule，前端 teammate 负责
  backend/                       submodule，后端 teammate 负责
  contracts/                     接口约定，指定负责人
  docs/                          跨仓需求与验收记录
  scripts/                       项目侧准备与联调入口
```

Lead 负责拆分任务、接口协调、验收和父仓指针。前端与后端成员各自修改自己的子仓。单边 bug 只启动相关成员；跨仓需求为两边建立任务并安排联调。同一团队的成员可以直接互相发消息。[Team 工具](../../deepseek-harness/packages/experimental/tool-agent-team/README.zh.md)

当前实现支持任务领取、依赖和 owner 检查。路径范围 `write_scopes` 只提示重叠，不是目录权限或互斥锁。`spawn_teammate` 没有子模块绑定或 `cwd` 参数；成员从共享根目录开始，操作时必须明确使用所属路径，例如 `git -C frontend ...`。让前端只领取前端任务，需要写入成员职责和任务说明；工具不会自动按仓库路由。[工具实现](../../deepseek-harness/packages/experimental/tool-agent-team/src/index.ts)、[领取校验](../../deepseek-harness/packages/experimental/agent-team/src/task-board.ts)

持续领取任务可以作为成员工作约定，但任务变为就绪不会自行启动成员。Lead 要用消息启动或恢复空闲成员；任务 owner 也不会因成员停止而自动释放。[团队策略](../../deepseek-harness/packages/experimental/tool-agent-team/src/index.ts)、[Team 限制](../../deepseek-harness/packages/experimental/agent-team/README.zh.md)

同一份前端 checkout 只有一个分支检出状态，后端同理。每个子仓默认由一个写入者负责；需要并行开发同一子仓的不同分支时，再分别准备子仓 worktree，并约定成员使用的确切路径。Team 本身不会创建或绑定这些工作树。不同团队也不能在同一子仓 checkout 中独立切换分支。

子仓开发前明确检出开发分支。子仓变更分别提交、审查和合并；父仓记录所选提交前，确认这些提交已可从子仓远端取得。父仓指针和共享文件由 Lead 统一处理。成员工作期间，切换其子仓分支或执行影响子模块的批量更新，必须先协调。[Git submodule 语义](https://git-scm.com/docs/gitsubmodules)

这个方案可以先使用单套 checkout。若需要多套并行产品环境，另行评估独立 clone 或各子仓 worktree；不能把当前 Git 对 superproject 多 checkout 的限制解释为禁止单套聚合仓中的 Team 协作。

## 多个任务分别使用父仓 worktree

用户进一步提出为每个并行任务建立父仓 worktree，在其中初始化子模块并分别创建开发分支。基础代码隔离可以实现；DSH 当前没有自动完成整套子模块准备与收尾的功能。

建议的单位是一个并行任务、一个 Lead 会话、一份父仓 worktree，以及一个 Team。同一任务的成员共享这份工作树，分别负责前后端。不同任务的成员使用各自任务目录。

```text
product/.agents/worktrees/
  task-a/                         父仓 task-a 分支，Team A
    frontend/                     子仓 feature/task-a 分支
    backend/                      子仓 feature/task-a 分支
  task-b/                         父仓 task-b 分支，Team B
    frontend/                     子仓 feature/task-b 分支
    backend/                      子仓 feature/task-b 分支
```

上面的目录名是示意。DSH GUI 通常生成自己的工作树名称，应使用创建结果返回的实际路径。先进入任务 worktree，完成下面的准备，再创建该任务的 Team：

```bash
git submodule update --init --recursive
git -C frontend switch -c feature/task-a
git -C backend switch -c feature/task-a
```

命令假定当前目录是刚创建、尚未开始开发的任务工作树，且目标分支不存在。它从父仓锁定的子仓 commit 建分支。只需要修改一边时，可以只给这一边建开发分支；另一边保持锁定版本。子模块默认更新流程会 detached HEAD，因此分支准备应在成员开发前完成。[Git submodule 命令](https://git-scm.com/docs/git-submodule)

DSH 创建流程不初始化子模块，也不安装依赖或复制未提交文件。其初始化过程明确使用 `--no-recurse-submodules`。父仓工作树创建成功，只表明父仓检出完成。[DSH 工作树说明](../../deepseek-harness/packages/experimental/worktree/README.zh.md)、[创建实现](../../deepseek-harness/packages/experimental/worktree/src/index.ts)

### 本机临时验证

2026-11-06 使用 `git version 2.54.0 (Apple Git-157)` 验证，命令入口为 `python3 - <<'PY' … PY`。Python 用 subprocess 执行 Git，仅在 `/private/tmp` 的临时目录内创建测试仓库；真实进程退出码为 `0`。所有测试目录在验证结束后删除，实际项目及其子模块未改动。

验证步骤为：创建本地前后端仓和聚合仓，提交子模块指针；用 `git worktree add -b` 创建父仓 task-a、task-b；在两边分别执行 `git submodule update --init --recursive`；在各子仓执行 `git switch -c`；最后只修改、提交 A 的前端。

结果：

- 两份新父仓 worktree 在初始化前，都没有已检出的子模块 Git 信息。
- A 的子仓 Git 目录位于父仓 `.git/worktrees/task-a/modules/<子仓>`，B 位于 `.git/worktrees/task-b/modules/<子仓>`。
- A 提交后，B 的子仓文件、分支和 HEAD 均未变化；断言通过。

这是 Git 基础行为验证。没有启动 DSH，也没有覆盖沙箱授权、任务环境准备、worktree 移动、恢复、清理或嵌套子模块。它不能代替完整生命周期验收。Git 官方当前仍说明 submodule 支持不完整，不推荐 superproject 的多个 checkout；含子模块的 linked worktree 也不能通过 `git worktree move` 移动。[Git worktree 支持边界](https://git-scm.com/docs/git-worktree)

### 隔离范围

父仓 worktree 共享父仓的 Git 引用与部分配置。DSH 改变当前目录也不改变会话原始权限根目录。因此，独立工作树能分开源码和检出状态，不能当作团队之间的沙箱边界。[Git worktree 说明](https://git-scm.com/docs/git-worktree)、[DSH 工作树与权限](../../deepseek-harness/docs/subsystems/worktrees.zh.md)

端口、数据库、队列和测试数据仍须按任务准备。验收时分别检查子仓 diff 和测试结果；当前父仓面板展示子模块提交变化，不展示子模块内部未提交修改。[GUI 子模块限制](../../deepseek-harness/packages/experimental/client-ui-forge/README.zh.md)

核对日期：2026-11-06。证据版本：

- DSH-Workflow：`40e10e601c147b2e49e5a0869e5630a68f7ad125`。
- DeepSeek Harness：`66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。

以下 DSH 结论来自本地固定版本，不能直接当作其他安装版本的行为保证。

## 当前 DSH 的能力边界

| 能力 | 当前实现 | 对方案的影响 |
| --- | --- | --- |
| Workspace | 可以登记普通绝对目录，无须是 Git 仓库。 | 可以用一个普通父目录组织多个仓库。 |
| 内置 worktree | 从调用会话当前目录识别一个 Git 仓库，创建该仓的新分支和检出目录。 | 没有一次创建前后端配对工作树的原生接口。 |
| 子代理目录 | 委派工具支持指定 `cwd`；省略时继承当前目录。 | 主代理可以把前后端任务派到不同子目录。 |
| 权限根目录 | 本地子代理保留父级权限根目录；改变当前目录不会扩大或收窄权限。 | `cwd` 负责定位，文件职责仍需明确。 |
| Team | 可选 Team 组合包不提供自动 worktree 隔离或文件锁。 | 启用 Team 不会自动得到每人一份代码。 |

来源：[Workspace 注册表](../../deepseek-harness/packages/workspace/workspace/README.zh.md)、[worktree 实现](../../deepseek-harness/packages/experimental/worktree/src/index.ts)、[子代理工具](../../deepseek-harness/packages/subagent/tool-subagent/README.zh.md)、[子代理服务](../../deepseek-harness/packages/subagent/subagent/README.zh.md)、[Team 限制](../../deepseek-harness/packages/experimental/agent-team-profile/README.zh.md)。

内置 worktree 默认位于当前 checkout 的 `.agents/worktrees/<name>`。它只从已提交版本创建，不复制未提交文件、被忽略文件或依赖目录。创建过程不递归检出 submodule。GUI 的“变更请求与工作树”是可选组合包；本分析没有检查当前运行实例是否启用。[工作树说明](../../deepseek-harness/docs/subsystems/worktrees.zh.md)、[实现中的 `--no-recurse-submodules`](../../deepseek-harness/packages/experimental/worktree/src/index.ts)

## 方案比较

下表是根据实现和 Git 语义作出的工程建议。

| 方案 | 适合的情况 | 工作树组织 | 主要成本 |
| --- | --- | --- | --- |
| 真正的 monorepo | 同一产品，接口经常配套变更，权限一致。 | 每个功能一份包含前后端的 worktree。 | 需要迁移仓库或调整已有 CI；发布仍须协调。 |
| 普通父目录加独立仓库 | 保留独立历史、权限和发布流程。 | 每个功能配对前后端各一份 worktree。 | 两边分别提交和合并，需要记录组合版本。 |
| 父仓加 submodule | 需要把多个独立仓的确切版本作为产品快照保存。 | 保留父仓与子仓各自的 Git 边界。 | 子仓分支、子仓提交与父仓指针都要管理。 |
| 每项任务分别 clone | 希望任务连 Git 管理目录也独立，任务数量较少。 | 每个功能各 clone 一套前后端。 | 更多磁盘、下载和远端同步成本。 |

“父仓加 submodule”通常称为聚合仓或 superproject。子仓保留自己的历史，父仓 `gitlink` 记录子仓 commit。因此，把前后端放到父仓下面，仍然需要分别提交两边，再更新父仓指针。[Git submodule 语义](https://git-scm.com/docs/gitsubmodules)

Git 官方当前仍说明 submodule 支持不完整，不推荐对 superproject 建立多个 checkout；含 submodule 的 linked worktree 也不能用 `git worktree move` 移动。这是支持边界，不能推导为所有组合必然失败。[Git worktree 文档](https://git-scm.com/docs/git-worktree)

默认 `git submodule update` 会把子仓检出到记录的 commit，并进入 detached HEAD。开发前还需明确子仓分支。父仓分支不会自动成为两个子仓的同名开发分支。[Git submodule 命令](https://git-scm.com/docs/git-submodule)

本仓库用 submodule 固定上游源码，属于“固定组件版本”的用途。它不代表频繁修改前后端时也应采用相同组织方式。[本仓 `.gitmodules`](../../.gitmodules)

## 保留独立仓库时的目录

```text
product-dev/                         普通父目录
  repos/
    frontend/                        前端基础 checkout，含共享 Git 管理目录
    backend/                         后端基础 checkout，含共享 Git 管理目录
  tasks/
    frontend-bug-123/
      frontend/                      只创建前端 worktree
    backend-bug-456/
      backend/                       只创建后端 worktree
    login/
      frontend/                      前端仓的 feature/login worktree
      backend/                       后端仓的 feature/login worktree
      integration.env                登录功能的联调配置，不提交密钥
    payment/
      frontend/                      前端仓的 feature/payment worktree
      backend/                       后端仓的 feature/payment worktree
  coordination/                      可选的独立协调仓
    specs/
    contracts/
    scripts/
    versions.json                    记录通过联调的 commit 组合
```

外层目录无需 `git init`。可选协调仓只管理规格、契约、脚本和组合版本，前后端目录不作为它的 submodule。没有共享资料需要版本管理时，协调仓也可以省略。

| 任务 | 建立的 worktree | DSH 使用方式 |
| --- | --- | --- |
| 单独修前端 bug | 只建前端工作树。 | 从前端项目创建任务会话。 |
| 单独修后端 bug | 只建后端工作树。 | 从后端项目创建任务会话。 |
| 前后端同时开发 | 为同一任务配对两个仓的工作树。 | 从产品父目录创建总控会话，分别委派。 |

任务需要启动另一侧服务时，可以先使用明确的稳定版本；只有需要修改另一侧源码时，才把另一仓纳入开发任务。相互独立的 bug 使用不同任务目录和分支。

以下只是命令示例，本次没有执行。假定两个基础 checkout 已存在、各自的 `origin/dev` 已更新，目标路径和功能分支尚不存在：

```bash
mkdir -p /work/product-dev/tasks/login

git -C /work/product-dev/repos/frontend worktree add \
  -b feature/login /work/product-dev/tasks/login/frontend origin/dev

git -C /work/product-dev/repos/backend worktree add \
  -b feature/login /work/product-dev/tasks/login/backend origin/dev
```

两个仓库可以各自使用 `feature/login`，但它们是两个不同的 Git 分支。同一仓库的同一分支，默认不能同时检出到多个 worktree。[Git worktree 文档](https://git-scm.com/docs/git-worktree)

只改一边时，另一边可使用固定版本参与联调，无需强制创建可写功能分支。已有 checkout 有未提交内容时，先保留原状；新 worktree 不会自动带走这些修改。

## DSH 会话如何安排

可以把前端基础仓、后端基础仓和 `product-dev/` 分别添加为 DSH Workspace。单边任务从对应仓库启动；跨仓任务从产品父目录启动总控。总控为登录任务分别启动前端和后端子代理，`cwd` 指向 `tasks/login/frontend/` 和 `tasks/login/backend/`。总控负责接口约定、组合验证和结果汇总。单独打开两个项目会话，不会因此自动形成总控与子代理的协作关系。

这种布局把基础仓和工作树都放在会话根目录之下，通常更容易满足工作区写权限。它同时允许代理接触整个父目录；前后端分工是职责约定，不能当作沙箱隔离。

普通父目录没有自己的 Git 分支。DSH 原生 GUI 的分支和“新建工作树”入口在非 Git 目录中隐藏。可以在各仓分别使用 Git 命令，或把前后端基础仓单独添加为 Workspace，使用各自的内置 worktree 功能。原生创建路径仍按各仓分开，不会自动得到上面的功能配对目录。[GUI worktree 说明](../../deepseek-harness/packages/experimental/client-ui-forge/README.zh.md)

不必一开始就写配对脚本。可以先使用 DSH 各仓的默认 worktree 路径，在跨仓任务说明中记录前后端路径和分支；上面的 `tasks/<任务>/<仓库>` 只是便于集中管理的布局。需要这个布局时，由项目初始化命令分别执行 Git 操作。当前 DSH 内置 `create_worktree` 没有一次指定多个仓库和任意目标路径的参数。

如果把 `tasks/login/` 单独作为会话根目录，代码范围会更集中，但共享 Git 管理目录位于外部。当前 DSH 不自动授予这些路径的写权限。部署可以用 `additionalWritableRoots` 明确授权需要的物理目录；这是组合级配置，会作用于该组合的会话，不是子代理专属授权。不能靠 `cd` 或符号链接替代授权。[沙箱策略](../../deepseek-harness/packages/sandbox/sandbox-policy/README.zh.md)

需要更强任务隔离时，可以选择独立 clone，让每项任务的 `.git` 也位于自己的目录。这里的取舍是隔离程度与存储、同步成本。

## 使用真正的 monorepo 时

```text
product/
  apps/frontend/
  apps/backend/
  packages/contracts/
  docs/specs/
```

“登录功能”创建一份包含前后端的 worktree。总控在这份工作树中启动前后端子代理，两边的修改立即出现在同一份文件系统中。前端负责 `apps/frontend/`，后端负责 `apps/backend/`，共享契约由指定负责人修改。

前后端属于同一个功能时，可以共享这一份 worktree。另一个独立功能再创建新 worktree。同一份工作树共享 Git 暂存区，提交和分支操作应由一个负责人串行处理。

如果前后端代理各用同仓的不同 worktree，两边的未提交修改不会自动可见。那种布局更适合独立交付后再集成的任务；联调需要先把两边提交集成到选定工作树。

## 联调与交付

工作树隔离代码目录，服务状态还需要按功能组织：

- 登录与支付使用不同的前后端端口，各自配置 API 地址。
- 数据库、队列、测试账号和可变存储按需要分开，避免并行任务互相影响。
- 明确接口契约的权威位置和负责人，记录请求、响应、错误码与认证方式。
- 多仓验收记录前端 commit、后端 commit、契约版本和联调命令的真实结果。
- 依赖和工程环境由项目初始化流程准备；DSH Workflow 只消费固定验证命令及其退出证据。

worktree 不会带出被忽略的 `.env` 或安装目录。每份工作树如何复用工具链和构建缓存，由项目初始化流程决定。已有进程也不会因为会话切换目录而自动切换工作位置。[工作树说明](../../deepseek-harness/docs/subsystems/worktrees.zh.md)、[工作目录服务](../../deepseek-harness/packages/session/working-directory/README.zh.md)

多仓的两次合并和发布需要单独协调。可以先采用兼容旧接口的后端变更，再接入前端；具体顺序取决于接口兼容策略。协调仓可以记录已经验证的版本组合，但不会产生跨仓原子提交。

本次只做源码和官方文档分析，未创建工作树、迁移仓库、安装依赖或运行联调测试。是否存在可直接配对多仓工作树的第三方插件，未在本次范围内验证。
