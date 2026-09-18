# Synapse 移除后的真实浏览器复验

- 日期：2026-09-14。
- 使用原有 `http://127.0.0.1:3080/` 标签，未新建标签。
- 正常无参数启动入口：`./start-owner-workflow.sh`。
- 宿主实例：`7d43cdd3-2a98-47ad-977d-2f84df187e4a`；Owner、SoL、自研审批均 ready。
- 原标签刷新成功，Planner 历史可读，页面 Synapse 元素数为 0。
- 本轮框架回归 421/421 通过，候选前后一致，详见 `report.json` 与 `tests.log`。这不是整体验收通过。
- 点击 Planner 的父会话 `Coinhub 完整 Owner 验收工作流` 后进入空白新会话页；工作区展开无原主会话，搜索 Coinhub 无匹配，另提示内容搜索暂不可用。
- 独立只读诊断确认原主会话持久文件及父子关联仍存在，主会话被 workspace 的 archivedSessionIds 隐藏。上游 ui-workspace 文档明确没有取消归档控件；navigation 的 clearArchivedCurrent 会在选中归档会话时清除选择，吻合空白页症状。未确认归档发起者或时间，不能归因于这次重启。
- 未修改用户配置、Key、模型、权限或 ~/.dsh 存储；未清空历史、重建工作流或消耗新的恢复额度。真实业务验收尚未恢复执行。
