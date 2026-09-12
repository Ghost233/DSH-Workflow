# R95 实现复核

## 结论

没有发现阻止T28标记开发完成的问题。判断身份、原始回执、当前版本、槽位和主线程投影都由Runtime重新核对，模型普通文本不具有权威。

## 复核要点

- 专用角色只有决定提交工具，不获得DAG、Registry、代码写入或审批能力。
- session ID从Workflow/request/version/digest确定性派生；创建结果不确定时只技术暂停，不以同ID重发prompt。
- 工具call/result/turn/step/terminal序号与回执Owner/request均绑定；普通assistant JSON没有提交权。
- 活跃会话同时进入Runtime容量计数和Supervisor外部预留投影；旧action ID在没有外部预留时保持不变。
- timeout和父取消都等原始session terminal后结算，后续请求不再被容量误阻。
- 业务承诺变化的outbox动作是 `user_decision`；通知绑定冲突时关闭处理。

## 保留边界

没有将B-03的公共实现、消费者解锁或联合资源生命周期并入T28。因此T28完成不表示AC-05/07/13/29或CA-01整体验收通过。
