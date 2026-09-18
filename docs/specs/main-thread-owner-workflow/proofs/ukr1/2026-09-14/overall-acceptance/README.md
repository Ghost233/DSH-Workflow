# 整体验收报告（2026-09-14）

结论：未通过，未完成业务端到端验收。本次没有修改插件源码、DSH 源码或用户配置，没有重写 DAG、生成业务重试或清空历史。

## 本轮实际执行

- 运行 `node scripts/run-kernel-acceptance.mjs`：411 项，沙箱内 387 通过、24 失败。16 个失败段直接包含 sandbox_apply: Operation not permitted；其余不能仅凭首次运行判定原因。
- 经自动审批允许，仅将同一套隔离测试在 Codex 外层沙箱外复验；保留测试使用的 DSH 原生沙箱，未启动用户 profile。复验 410 通过、1 失败，零跳过、零取消。唯一失败是 native-kernel-effects 的外部依赖不可写测试在项目磁盘创建 other-base 时 ENOSPC。
- Owner 与审批插件的客户端构建检查均通过。
- 前后生产源码摘要相同：32341e5ac2f2（完整摘要在 native-acceptance.json）。用户 settings.yaml、cordis.patch.yml、.credentials.yaml 哈希相同；control-state.json 哈希相同。
- 自动验收入口列出 32 个 AC 与 24 个 KAC，未逐项绑定完整生产候选证据；不能将 410 个回归用例当作 56 项完整合同已验收。

## 真实服务与磁盘阻塞

3080 无监听；已有浏览器页面显示历史记录，不能证明后端当前可用。只尝试了无参数 ./start-owner-workflow.sh；原生启动器写 ~/.dsh/profiles/web/cordis.yml 时 EPERM。权限升级启动被自动审批拒绝：认为写入此路径违反用户禁止修改 ~/.dsh 配置的要求。未绕过拒绝、未使用替代配置目录。后端未成功启动，未新增浏览器标签。

/Volumes/LargeStorage 容量约 1.1TiB、100%，观察时仅余约 32MiB。保存仓库报告和原生测试创建目录均真实报 ENOSPC。仓库 overall-acceptance/sandbox-run/report.json 的 0 字节文件是失败复制产物，不能用作证据。本完整报告因此保存在 /private/tmp。未删除候选、quarantine、依赖缓存或用户文件。

## 原工作流仍未完成

同一 Workflow wf-90bbced7a68641494bb651e73f3c22d6ba4b3354，DAG v3，16 项任务中 1 完成、2 失败、13 等待依赖；恢复 16/16。浏览器最新候选的 lockfile 修复成立，但正式 npm ci 在 300 秒期限终止，smoke 没有执行。foundation 固定测试曾 4/4 通过，独立审查仍发现缺少可复用、版本化 unary/stream 场景生产者。后续旅程、最终 typecheck/Web/extension 构建未完成。旧隔离执行及未确认的私有执行证据继续保留。

## 继续所需

先释放项目磁盘空间（需要确定允许清理的具体范围），再由用户按原入口启动，或明确允许原生启动器生成 profiles/web/cordis.yml；不修改 key/provider/model/权限策略。之后处理浏览器依赖准备和 foundation 缺项，使用有明确变更依据的原生恢复推进同一工作流，最终执行业务验证与交付。此报告不宣称这些后续步骤已完成。

## 继续验收：磁盘恢复后的复验

用户回复继续后，项目磁盘可用空间约287GiB。原生集成测试 native-kernel-effects.test.mjs 12/12通过，上轮唯一ENOSPC失败项已实际重验通过。源码摘要仍与前轮411项整组验收完全相同；这是同一源码下410项通过加失败项所在文件复验通过，不伪称重新跑了一次411/411。完整报告已从临时目录补存到当前仓库。

启动请求再次被自动审批拒绝，理由是“继续”不足以明确授权写入先前禁止修改的 ~/.dsh/profiles/web/cordis.yml。本次启动命令未执行。用户配置和control-state哈希仍不变；真实业务验收仍未完成，需要明确允许该原生生成文件，或由用户自行使用原启动入口启动。

## 正常启动恢复

用户明确要求按正常入口启动后，启动审批通过。./start-owner-workflow.sh 已成功启动原3080服务；Owner、SoL、Synapse、自研审批均ready。复用原浏览器标签刷新后，原Coinhub工作区和原会话均可见。用户settings/patch/credentials哈希保持一致。原DAG v3、恢复16/16及集成head保持；本次未新增业务retry，业务端到端验收仍未完成。详见normal-start.json。
