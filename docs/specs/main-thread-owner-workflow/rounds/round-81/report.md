# R81：B01 原生规划文档来源

已将原有 B01 展开为 T24–T27：来源记录→checkpoint/快照→单 Owner 执行包→真实版本激活。原23张工单、R4全部AC及CA01保持。依赖检查27项无缺引用/环；T18现明确依赖T27的真实入口，T27不反向依赖T18。

## 本轮连接的实际步骤

主线程在 Owner 模式中调用真实 Harness write/edit，现有权限与原生观察/CAS仍生效；在写入前持久记录调用身份、路径、最终版本约束及原始内容摘要，原生成功观察后核验实际版本/字节并保存终态。连续 create→read→edit 已形成可核对的前后摘要记录，read本身不伪造写入来源。

重复callId不能覆盖记录或再次修改文件。原生成功但下游观察异常仍保留实际成功事实并标记证据不完整；CAS失败不凭isError推断文件未变；terminal持久化失败保留prepared和实际文件，不回滚或伪造完成。BOM使用真实字节摘要，不将解码后的内容冒充原始字节；不可逆情况保持incomplete。

代码：`owner-workflow-plugin/src/planning-write-journal.mjs`，通过既有 `registerOrchestratorDocumentGuards` 注册；没有修改 Harness。日志合同见[planning-write-journal-v1](../../contracts/planning-write-journal-v1.md)。

## 固定候选验证

候选为当前未提交文件，[candidate.json](candidate.json)绑定插件源码、相关测试/合同和实际导入的Harness构建内容。正式运行期间停止代码写入。[原始结果](test-results.json)：

| 套件 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| planning-write-journal-native | 7 | 0 | 0 |
| planning-references | 30 | 0 | 0 |
| orchestrator-documents | 6 | 0 | 0 |
| orchestrator-documents-native | 4 | 0 | 0 |

合计47通过，无取消/超时/零用例/候选漂移。默认工具沙箱运行，原生观察/文件权限保留。每套外层120秒，独立项继续采集，命令和原始日志均保留。

开发证据另列：native最终7通过，guard最终6通过；development-stale保留一次测试注入误包writeText、实际edit走editText导致的失败及更正后结果。代理报告另有两次早期探索未保存原始文件，不能算可复核正式证据。正式结果不依赖这些探索。

## 边界与下一交付

日志与文件修改不是一个原子事务；崩溃窗口可能只留下prepared/unknown，当前不自动恢复晋升。所有记录checkpointEligible均false，不隐含提交、实施或激活权限；T25仍必须核验实际授权、Git基线/暂存区、完整来源链、外部编辑、文档引用和当前字节。T24不代表B01或CA01已经完成。

下一项T25接通真实checkpoint与不可变snapshot，之后T26/T27接编排与激活；T17/T18/T19及B02–B06维持独立边界。本轮未提交、未推送；保留用户已有变更。各仓库本地hash和缓存远端引用见[Git证据](git-final-evidence.json)，未联网核对远端，不宣称无关子仓库已同步。

审查结论见[review.md](review.md)。
