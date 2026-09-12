# 第29轮 F-20

主线程独占session测试及文档，仅修正pending组合用例reason期望为reservation_invalid，添加导入顺序说明。实际生产admissionConfig旧版本先拒绝，所有已有预算/无发送/无结算断言保留，生产与合同未改。正式固定1619候选，运行受影响session17，180秒，保留真实Owner沙箱；不重复无关restart5。第28轮失败日志保留。已明确一行原因，直接正式验证，不重复开发运行。
