# T-21独立只读审查

审查者：t21_contract_review，worker / gpt-5.6-terra / xhigh。开发阶段独立判断现有API可用边界，固定候选后只读检查正式证据与合同；未改文件、未重跑测试。

**结论：T-21可开发完成，T-22前置可解除到保守实施范围；未发现要求新增Harness工单的P1/P2。** 主线程采纳结论并将放行条件写回规格12.2、T-22工单与进度。非幂等的底层followup否定盲目重送，不否定查询旧结果/未知暂停的适配能力。

正式两个入口exit0、0超时、父子stderr均空，1613候选无漂移。session显式ID/lazy无文件/首次append物化/SIGKILL后独立进程resume成立；prompt四场景都完成观察检查。running原始readFrom无turn/end，load才合成interrupted；completed同ID重投出现第二个user/message和turn以及一次新适配器调用。因此合同禁止重送、不伪造T-13终态、未知暂停、不声称跨进程session所有权，边界正确。

## 必须保留的放行条件

T-22只接本次已验证的JSONL compression:none、独占受控单prompt session。readFrom只返回有效前缀，可能隐藏torn fragment，不能单独据此接受completed。现有supportsRawArtifacts/readRaw可用于原始完整JSONL检查，listSnapshots可提供前后revision稳定观察；T-22自身须实现并测试这些检查，任何缺失、格式/完整性异常、revision变化或所有权不明都暂停。

依据：session-persistence/src/index.ts:99-120（raw）、:202-221（物理前缀）、:227-240（snapshot revision）；JSONL后端真实实现raw读取，session探针也实际调用。listSnapshots稳定读取组合不是本轮新增的已验收原子事务，而是T-22的实现/验证要求，不能把两个相同revision当作跨进程lease。

不得泛化到zstd或其他后端：zstd raw读取可能省略torn final frame，因此没有专项完整性证据时必须暂停。若遗漏此配置限制会构成P2合同精度问题；主线程已明确回填，无需新增后端实现任务。

本次无真实供应商请求、任意崩溃点自动续跑或业务语义验收。pending未自动唤醒、open turn修复、无日志等均保留技术暂停。T-23与T-15继续阻塞；本轮不实施生产修复。
