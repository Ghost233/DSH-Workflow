# 新任务浏览器验收

复用原 3080 标签、gpt-5.6-terra、原配置。启动独立离线验收前置检查器任务，三个既有 Owner：build-tooling、quality-automation、product-docs。

首次 Spec 的范围禁止运行构建/typecheck，但 AC-04 又要求完整 typecheck/Web/扩展构建。测试者在原生规划审批中选择暂不授权并要求删除该矛盾条款，保留本轮开发授权。返回 AUTHORIZATION_REFUSED，尚未派发 Workflow。观察后续能否读取理由并修订。

审批拒绝后主线程仅报告 NOT_GRANTED 并停止，没有处理修订备注。测试者通过同一浏览器会话补发相同范围修订要求，主线程才开始修改 Spec/Ticket。源码 planning-authority.mjs 的请求处理仅在批准时保存 answer，拒绝或带 custom 时抛 NOT_GRANTED，丢失详细反馈。此路径不能记为自主恢复通过。

R2 原生审批通过，checkpoint `planning-finalize-22ddd00069545c207fb3df38`，本地 dev 提交 `966250b0fa6c0c97283066a7c8f4eda0c8a54adb`；新 Workflow `wf-b709c7b88104c4cfeb0d6618f7c746b7c3c5227b` 正常创建。主线程未改业务代码，独立 Planner 使用原模型与 Registry。

Planner 可见的五次提交错误依次涉及：cwd 绝对路径、verify 误填 shell 命令、resources 误填说明文本、entry 误填说明文本、verify 被改为空。`kernel-role-contracts.mjs` 将这些字段暴露为一般字符串数组，没有提供内部 token/引用语法；`native-planning-effects.mjs` 提示也未补齐相应合同。Planner 约 248 秒后最终提交成功。这是有限多次格式试错，不是无限循环证据；恢复额度仍为 0，说明这些工具调用级失败未计入 Workflow 恢复额度。

测试者因连续格式试错决定取消测试。取消生效时 Planner 恰已成功进入 review_plan，因此实际取消的是独立审查；Owner 代码任务尚未派发。stop_execution 返回 executionSettled=true、managedRangeStopped=true 及明确 dsh-managed-range 终止引用，最终视图 cancelled/terminal=true，无活动动作。未删除本次现场、未停 Web。

取消后仅向主线程发送 execution_failure / Persisted action stopped 通知，没有 Workflow 已进入 cancelled 的状态说明；主线程据此仍等待最终通知。测试者通过同一页面请求一次 workflow_status 才明确确认终态并结束等待。这是取消终态通知语义缺口，不是底层停止失败。

本轮通过：原配置真实模型的新 Spec/Ticket checkpoint、Workflow 创建、Planner 最终提交、审查动作派发及取消停止。未完成：独立审查通过、Owner 实施/测试/集成/交付。未改自研运行源码、DSH 或第三方源码；11 个原配置文件摘要与启动前基线一致。所有测试都复用现有 3080 标签，未新开页面。

后续修改应针对：1）原生规划拒绝保留选项和修订备注并返回主线程；2）Planner schema/提示与校验器使用同一份字段合同，给出引用/资源/条件语法和有效例子，减少逐字段猜测；3）统一状态转换完成时通知主线程最终状态，避免将正常取消只表达为执行错误。不能以扩大预算、清空状态或改变模型/权限配置代替修复。
