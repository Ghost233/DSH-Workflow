# Issue 跟踪器：GitHub

当前项目的正式 issue 和规格保存在 Ghost233/DSH-Workflow 的 GitHub Issues 中，使用 gh CLI 操作。

## 操作约定

- 每次需要认证的 gh 业务命令前，切换到 Ghost233，并通过用户接口验证实际登录身份为 Ghost233。验证失败时停止 GitHub 操作。
- 显式指定仓库 Ghost233/DSH-Workflow，避免将 issue 发布到依赖或子模块仓库。
- 创建前查询相关 issue，检查是否已有同一规格。创建使用 gh issue create；多行正文先保存为 UTF-8 文件，再用 --body-file 传入。
- 读取使用 gh issue view，并同时读取正文、标签和评论；列出使用 gh issue list，按状态和标签过滤。
- 更新使用 gh issue edit；评论使用 gh issue comment；关闭使用 gh issue close。多行文本均使用 --body-file，保留实际换行。
- skill 要求“发布到 issue 跟踪器”时，创建 GitHub issue；要求“获取相关工单”时，读取对应 issue 及评论。
- issue 编号与 PR 编号共用空间；处理既有编号前确认其类型。

## Pull Request 请求入口

把 PR 作为请求入口：no。

## 寻路操作

- 地图是带 wayfinder:map 标签的 GitHub issue；已存在的本地地图作为历史记录保留。
- 工单使用 GitHub sub-issues 连接地图。功能不可用时，在地图正文链接子项，在子工单正文标注所属地图。
- 工单标签使用 wayfinder:research、wayfinder:prototype、wayfinder:grilling 或 wayfinder:task；认领时分配给主导开发者。
- 阻塞优先使用 GitHub 原生 issue 依赖。blocked_by 端点中的 issue_id 使用阻塞项的数字 database id，不使用 issue number 或 node_id。功能不可用时，在正文链接阻塞项。
- 前沿是开放、无开放阻塞项、无人占用的地图子工单，按地图顺序选择。
- 解决时先以评论记录决定，再关闭工单，并向地图追加带名称链接的决定摘要。

## 本地文档副本

正式 Spec 可在 docs/specs/<主题>/spec.md 保留副本，并记录对应 GitHub issue 链接。GitHub issue 是跟踪状态来源，本地文档不代替执行状态。
