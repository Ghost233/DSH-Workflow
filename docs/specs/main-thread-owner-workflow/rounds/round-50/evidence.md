# R50：关闭 incident 无效重排

范围：R49 P2；主线程独占 runtime.mjs 和 runtime-recovery-budget.test.mjs。保护协议下实际 Owner record 仍为 autonomous_incident 时，探针保留现场且返回 resumed=false；真实用户授权仍优先。不擅自重置策略或预算。新增受控持久态反例明确不冒充真实重试耗尽证明。正式范围同R49四套；不扩大到全仓。
