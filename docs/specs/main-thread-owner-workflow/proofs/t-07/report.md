# T07：规划文档与执行版本事务技术验证

**开发完成（技术验证交付）**。实际临时Git项目支持选用“来源记录＋固定提交输入＋ref CAS＋受保护index同步＋不可变规划快照＋最后激活”的可恢复事务路线。B01可据此进入生产实现；本原型不是生产Runtime，也不代表CA01或AC03/12/17/18/27/28验收完成。

## 已证明的行为

- 直接消费T05真实文件协议，记录主线程写前/写后摘要及授权来源；写前必须匹配预期Git基线，写后必须匹配固定Spec/Ticket内容及声明。提交仅包含显式文档清单，实际Git对象中的文档blob也核对固定摘要。
- 正常checkpoint后，现有preflightWorkflow重新具备干净代码基线资格；不关闭requireCleanBase。复用现有Runtime生成gitignore例外，原始Git状态及该元数据保留，未把其他代码改动加入例外。
- 私有index生成候选tree；commit输入（父、tree、message、身份和日期）先持久化，后生成精确OID。原本地dev分支通过CAS前进，真实index只在原始状态仍匹配时同步；重放不重复提交。
- 六个实际SIGKILL边界为before-commit、after-commit（ref已前进而index尚未同步）、before/after-snapshot、before/after-activation。新进程读取真实HEAD/index/journal继续；未完成激活的阶段没有新模拟active版本。
- 已有暂存、无关代码、同文件编辑、错误分支/HEAD、缺来源/授权、旧协议、过期或不通过的Review声明均明确拒绝。ref前失败保留原HEAD；ref后失败保留已完成提交、index和用户编辑，释放本进程已知的Git锁，不做回滚或强制同步。
- 未知锁不删除。恢复已知锁需匹配私有artifact的inode/dev/摘要及已死亡PID；复制相同字节的外部锁仍拒绝并保留。
- 冷启动同父竞争与**已有V1父版本上的R2竞争**均只有一个进程成功。旧快照保留；旧版本回执只归历史。已激活重放核对版本、父、snapshot、checkpoint、authorization五项完整关联；错误关联与损坏快照不被自动修补。

## 固定候选与原始证据

| 候选 | 正式范围 | 结果 |
| --- | --- | --- |
| [候选1](../../rounds/round-80/candidate.json) | 36项事务＋30项T05回归 | [66通过](../../rounds/round-80/test-results.json)，零失败/跳过/超时/漂移 |
| [候选2](../../rounds/round-80/candidate-2.json) | 锁身份修复后的5个直接受影响场景 | [5通过](../../rounds/round-80/test-results-2.json)，零漂移 |
| [候选3](../../rounds/round-80/candidate-3.json) | 仅新增已有父版本竞争验证，代码与候选2相同 | [1通过](../../rounds/round-80/test-results-3.json)，零漂移 |

不将不同候选计数合成一次全量运行。首轮开发20通过/9失败暴露空父版本归一问题；第二次22/9暴露初始化函数误校验有效activation为初态；定向第三次4/1还暴露与Runtime生成元数据规则不一致；这些原始日志全部保留。后续定向7/7及上述正式验证关闭相关问题。独立审查确认自有锁清理、完整activation关联及外部同字节锁问题均已修复，见[审查](../../rounds/round-80/review.md)。

实际状态记录包含完整引用/内容、journal、OID、HEAD/index摘要及快照，见[正常路径](../../rounds/round-80/artifacts/normal.json)、[ref后SIGKILL](../../rounds/round-80/artifacts/after-commit.json)、[已有父版本竞争](../../rounds/round-80/artifacts-3/active-parent-revisions.json)。源码与worker、fixture、测试副本均由候选指纹绑定。测试临时项目完成后清理；当前用户仓库未提交、未推送，原改动保留。

## 生产实施边界

这里验证的是临时Git多资源**可恢复**协议，不宣称真正跨文件原子事务、断电安全或任意指令位置SIGKILL恢复；没有覆盖所有临时锁创建/日志写入之间的微小窗口。生产实现必须复用并验证真实Runtime的持久化和并发原语，不照搬此原型锁为生产保障。

原型每个文档每轮消费一次写入receipt；主线程连续多次编辑的原生read/edit CAS及来源链需要B01实现。授权、Registry/DAG/Review标识在此是固定的模拟声明，真实授权来源、Registry及独立Review回执必须由生产入口核验；模拟activation/receipt分类不冒充真实Runner派发或Owner结果结算。

B01剩余交付：原生文档来源/CAS链和checkpoint入口；真实不可变规划snapshot及Spec/Ticket→单Owner执行包映射；绑定父版本/Registry/Review/授权的生产激活和旧回执失效；新路径与legacy审批兼容及端到端验收。T17停止隔离、T18恢复预算跨版本继承仍独立，不被本技术验证吞并。
