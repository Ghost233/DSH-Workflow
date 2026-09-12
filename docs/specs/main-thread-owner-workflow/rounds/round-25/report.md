# 第25轮交付

已补齐T-22会话创建并持久绑定后、followup前的真实SIGKILL重启证据。新进程保持原执行身份与reserved预算，返回raw_artifact_missing技术暂停，没有创建/恢复/发送Owner或调用模型。

本轮确认真实JSONL后端在首次append前不物化日志。首次定向因旧测试capture强制要求raw存在而失败，已保留[原始失败](development-first-failure.log)。只修改测试证据采集：真实create返回header计算物理目标，父进程kill后及重放后直接验证ENOENT。artifact中的null为缺失标记，kill.json明确rawArtifactPresent=false；其他场景仍要求真实日志。没有提前flush造出日志，也没有放宽产品恢复规则。

修后定向1/1，正式restart5/5+session11/11=16/16，零失败/跳过/超时/警告，无正式补验。1619候选无漂移，生产/合同未改。[测试结果](test-results.json)、[独立审查](independent-review.md)无新增P1/P2。[原始复核](restart-artifact-audit.json)确认4次真实SIGKILL、不同PID、原始状态/日志或缺失标记不变、零agent/model调用，5个正式容器均已清理。

本故障点不等于create后尚未绑定、绑定写入中断或所有旧lease组合已验证。T-22仍开发中，T-23/T-15阻塞。下一轮先对照T-22验收映射收敛剩余局部正常/故障项，明确哪些已有证据、哪些必须补齐；全入口接线仍由T-15承接，不能无限把其范围加入T-22。

开发25轮、技术验证3轮、独立局部验收3次、集中验收0次。本轮结束，待讨论；正式后源码/断言/合同未修改。无提交/推送/fetch，四仓HEAD未变，用户修改保留。main对本地跟踪引用0/0，deepseek-harness仍behind1430，vendor仍behind4，dsh-synapse保持detached；没有实时远端核验。
