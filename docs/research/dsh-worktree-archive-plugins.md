# DSH 会话归档与工作树回收插件

## 结论

2026-11-06 核对后，找到直接匹配“新会话创建 worktree，归档会话时尝试回收”的社区插件：`@guowenzhang/dsh-worktree`。对应仓库为 [zhang-guo-wen/dsh-worktree](https://github.com/zhang-guo-wen/dsh-worktree)。它有归档清理实现，但当前 Team、子模块和 DSH 运行版本的完整组合没有实机验证。

以下版本来自 GitHub 固定提交的 package.json，不代表已核验的 npm 最新发布版本。本次没有安装、运行或修改任何第三方插件。

## 直接匹配的候选

`@guowenzhang/dsh-worktree` 的源码清单版本为 `2.4.0`，核对提交为 `3e9830a5d0ce58b114db55e44a1f7547718bc1ea`，提交时间为 2026-11-05。[清单](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/package.json)

它在新会话界面提供 worktree 创建入口，把工作树登记成独立 Workspace，再把会话放进去。默认位置是 `<工作区>/.agents/worktree/<分支>`，与 DSH 官方默认的 `.agents/worktrees/` 不同。2.x 已移除面向模型的 Worktree 工具。[中文说明](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/README.zh.md)

### 归档清理

- `removeOnSessionArchive` 默认是 `true`，可以关闭。[配置实现](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/index.ts#L172)
- 同时观察归档集合的持久化写入和 `workspace/session-stop`，普通归档与“停止并归档”都可以触发。宿主启动前已经归档的历史会话不会被追溯清理。[清理实现](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/archive-cleanup.ts#L158)
- 只处理 linked checkout，主工作树不作为删除目标。有未提交修改时拒绝回收，归档本身仍然完成；不会主动删除父仓任务分支。[清理实现](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/archive-cleanup.ts#L308)、[删除与状态检查](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/service.ts#L436)
- 该路径没有等待其他使用者停止的活动检查。当前 README 也明确要求清理前确认没有其他会话使用目录。源码检查 Workspace 中首个记账会话是否已归档，不能把它解释成检查了全部 Team 成员或全部会话都已结束。[中文限制](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/README.zh.md)、[归档对象选择](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/archive-cleanup.ts#L277)

### 创建流程与子模块

多仓创建默认关闭。设置中可开启“创建子仓库”；子模块按父仓记录的 commit 初始化，处于 detached HEAD。独立嵌套仓库则创建新的 worktree 与分支。不能把子模块初始化解释成自动为每个子模块创建任务开发分支。[中文说明](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/README.zh.md)、[子模块初始化](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/service.ts#L557)

插件清理逻辑用会话 header 的 cwd 与 Workspace 记账定位目录。DSH 官方在会话内创建 worktree 时，只改变当前工作目录，保留原始项目和权限根。因此，安装插件后是否能识别并回收既有官方 worktree，不能直接保证。应使用插件自己的新会话流程，并单独验证与官方开关并用时的行为。[定位实现](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/src/archive-cleanup.ts#L291)、[DSH 官方工作树约定](../../deepseek-harness/docs/subsystems/worktrees.zh.md)

作者给出的安装命令是以下内容，本次没有执行：

```bash
npx @deepseek-ai/dsh plugin --profile web add @guowenzhang/dsh-worktree
```

这个命令使用未固定版本的 DSH CLI，不应直接当作本项目的集成方案。本仓库有固定运行时和插件装配清单；实际集成应遵循项目流程。[作者安装说明](https://github.com/zhang-guo-wen/dsh-worktree/blob/3e9830a5d0ce58b114db55e44a1f7547718bc1ea/README.zh.md)、[本项目运行时](../../dsh-runtime.json)、[插件清单](../../project-plugins.json)

## 替代流程

| 候选 | 核对的源码版本 | 收尾方式 | 与当前需求的关系 |
| --- | --- | --- | --- |
| [kangtsang/dsh-worktree-space](https://github.com/kangtsang/dsh-worktree-space) | `1.3.10` | 结束任务时集成各仓、移除 worktree、归档文档并注销 Workspace。 | 适合多仓任务整体收尾；不等同原生会话归档触发。 |
| [KHG420/git-worktree](https://github.com/KHG420/git-worktree) | `0.2.0` | 删除 worktree 时可一并归档绑定会话；分支保留。 | 可以用一次删除操作收尾，但触发方向不同。 |
| [limoiie/dsh-plugin-worktree](https://github.com/limoiie/dsh-plugin-worktree) | `0.1.1` | 删除 Workspace 时可移除 worktree 与分支。 | 不作为首选，删除实现直接使用 force。 |

Worktree Space 的任务空间可以包含多个仓，每仓各有一个 worktree，支持指定起点与任务分支。源码在宿主能提供 agent registry 时，检查任务路径内其他会话的运行状态、未结束轮次和排队消息，再决定是否拒绝结束；这是一项有条件的活动检查，不是跨进程锁。[README](https://github.com/kangtsang/dsh-worktree-space/blob/895fed991d54815a3ab285f6103612fe720d3199/README.md)、[活动检查](https://github.com/kangtsang/dsh-worktree-space/blob/895fed991d54815a3ab285f6103612fe720d3199/src/host/task/session-guard.js)

Worktree Space 声明 DSH 范围为 `>=0.2.0-rc.1 <0.3.0-0`。作者记录的实测安装矩阵到 `0.2.1-rc.3`；范围包含其他版本不等于已经实测。[清单](https://github.com/kangtsang/dsh-worktree-space/blob/895fed991d54815a3ab285f6103612fe720d3199/package.json)、[作者验证说明](https://github.com/kangtsang/dsh-worktree-space/blob/895fed991d54815a3ab285f6103612fe720d3199/README.md)

KHG420 删除默认不传 force，宿主 agents 服务可用时有活动检查；显式 force 仍可丢弃未提交内容。其清单多项 DSH 包固定为 `0.1.7-rc.2`，尚未核验本项目兼容性。[删除实现](https://github.com/KHG420/git-worktree/blob/2ad491e86ada2fcae580a9e7a0f638f62b882627/lib/operations.js#L474)、[清单](https://github.com/KHG420/git-worktree/blob/2ad491e86ada2fcae580a9e7a0f638f62b882627/package.json)

limoiie 的删除路径无条件执行 `git worktree remove --force`，未额外检查脏文件或活动会话。分支删除用 `-d`，不能保护工作树中的未提交文件。[实现](https://github.com/limoiie/dsh-plugin-worktree/blob/1cf8d1655f0b209889d881523c29ccc9eb564ccf/lib/worktree.js#L222)

## 当前项目已有功能

本地 Matt 派生面板已有显式工作树管理与删除操作，当前会话所在工作树和锁定工作树会被阻止移除，删除命令不使用 force。本次在宿主与工作树规则层中未检索到将其与会话归档联动的实现。[工作树规则](../../matt-skills-panel-plugin/src/shared/version-control/src/worktree-ops.ts)、[界面文案](../../matt-skills-panel-plugin/config/copy/vcworktrees.yaml)

项目运行时清单固定 DSH `0.2.2-rc.1`。调研后已将 `@guowenzhang/dsh-worktree@2.4.0` 加入项目插件清单，设为启动时加载。[运行时清单](../../dsh-runtime.json)、[插件清单](../../project-plugins.json)

后续集成检查曾把三个浏览器内置模块误判为宿主缺少依赖，现已修正。它们存在于固定 DSH Web 的共享模块表和实际发布的前端脚本中，无须另装同名包。项目依赖检查已识别这些静态模块，并保留对真正缺失模块的拒绝。[项目检查](../../scripts/project-plugins.mjs)、[DSH 静态模块表](../../deepseek-harness/packages/client/web/src/platform.ts)

使用完整性校验通过、未经修改的 npm `2.4.0` 包，在临时 HOME 和独立 profile 中启动 DSH `0.2.2-rc.1`，确认 `worktree` Host 服务可用、客户端 bundle 注册成功；原有运行实例没有重启。相关 28 项测试通过。前端页面交互、Team 停止后再回收、子模块中本地提交的保留、失败恢复和重复归档等行为仍需后续验收。
