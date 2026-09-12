# R64：恢复候选非通过后的实际重建

T15。主线程独占runtime/测试/合同/进度写入，子代理只读审查。为handoff-recovery的local_subgraph_rewrite提供真实后继Planner+Review：旧候选/已结算Review保留直到新候选与预算原子落盘；新逻辑operation固定前一候选及Review回执，同A/root计费，不伪造原成功Planner失败。失败后保留旧候选，后继ordinal受预算约束。

T18尚未实现时批准恢复候选必须在写入前拒绝，以免A→C破坏executionVersion；这是保护，不计为T18交付。手工discard、其他收敛策略/咨询计费仍待后续。正式新rebuild套件、candidate-review、handoff、control。
