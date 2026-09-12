# 第 6 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-06-rm11wnx9`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T10:33:33.213105+00:00",
  "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
  "files": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "e3b283fcd8d2586f5ae9da7223e3720da1567bea80a9ef1f67801615945a4f22",
    "owner-workflow-plugin/src/operation.mjs": "7e4b4c065cb5c193b2ab83966d4c214bebd3adcd4d7d3496948c9b4ce856b6a3",
    "owner-workflow-plugin/src/memory.mjs": "b7f04c732870432d1289ed1276a0769bffeccf5c8e62da13611ce823c036d631",
    "owner-workflow-plugin/src/workflow-conversation.mjs": "7d0bab4e9aafc24db9a587c24c2dce18ec8eac925bb9a7cfbaaa65c927345757",
    "owner-workflow-plugin/src/owner-submission.mjs": "784122aab6dde4e9a44170ecdc72b37fbdaaf6d9ffeec8d1dced670b390252cb",
    "owner-workflow-plugin/src/skills.mjs": "7520c41c9219dd93666ac2bbbe8390bc748bf317ad8f6c38f3f0b4b10772b959",
    "owner-workflow-plugin/src/external-runner.mjs": "5926b4e15819df617e301d390d21088e20ab06663a7207261444886457705343",
    "owner-workflow-plugin/src/dashboard.mjs": "6046206027436567ad71880b80edd63dec76bc6c273b54fb25b4ce2660c676fb",
    "owner-workflow-plugin/src/owner-boundary.mjs": "307599a1e6dba3f2214fcee610d74f7552fcea4facbcbbe16e22a95c80adcace",
    "owner-workflow-plugin/src/verification.mjs": "ece159d95577c6891a8fc0fa3a930e8abae2c3ef811b430b5997974328a88264",
    "owner-workflow-plugin/src/plan-revision.mjs": "14d87958cbfcaaec0b98b9af2433bccc7b678680db6eddc9d760a78b9cf19af5",
    "owner-workflow-plugin/src/dashboard-page.mjs": "457340df7fed006f189914a40b7a28e456c975b90ed6cae26374dc92f22c2582",
    "owner-workflow-plugin/src/workflow-state.mjs": "441102865e2b756046d7dbb126f829019878aee06b0bc084359fafa80525613d",
    "owner-workflow-plugin/src/runtime.mjs": "13ccf052ef9fbd6e6e7d585311773feaacfacc5d2e76c4a73665fd9d0e6ce561",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "18bf5137cc24a94d407cfca4bc4941bcc97deacf85be56942c7fd10280889124",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/test/launcher.test.mjs": "b6550c3e19347bba3e9e71b7db8feb07d8cfbcc171852f653b6086ed0ddfe882",
    "owner-workflow-plugin/test/owner-boundary.test.mjs": "3e2c4b9d5146893d995f308b470942e3f4bf752d48b6cf02d172da822bb6e593",
    "owner-workflow-plugin/test/runner.test.mjs": "811dba5847bc7270e18cbb76d9e48938b381e6d4a6bed211ef1b32cb321ef7b7",
    "owner-workflow-plugin/test/plugin.test.mjs": "10b7ee884e38f37fa59b9d598b217195d785be3164efb1684438b9179148fd81",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/operation-approval.test.mjs": "c6f43055ca7400d3587bd5f89da1731c8d831d76dd8e7897b0c9503b0ae1c96b",
    "owner-workflow-plugin/test/workflow-state.test.mjs": "db7e3535929a7679f1afafc18b010adc9b29d40782e2f2ece917af4d47fd38d1",
    "owner-workflow-plugin/test/dashboard-host.test.mjs": "10a51bc733d40bfd2982eb23e8f01acbbbf031a427e0b3efcd44bf1f34664f71",
    "owner-workflow-plugin/test/model.test.mjs": "cef54ba55188cd9c7af5497521dc6c831caa840edbf5adabbc8cd988e7d5ecea",
    "owner-workflow-plugin/test/control.test.mjs": "dcc2920d6618c8b2f8b25eb939a5d29c7acc7c5d97a2ef77e7c007cc3242e4be",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "853d910759990d25fd2cdc8c46323ba8827dc98ca2bc33fc9d5e9f757fc32aa0",
    "owner-workflow-plugin/test/git.test.mjs": "368e9d09f65acc7b607fc47f17fd5410a89c06c7ce9b6642167d86239cfa2d39",
    "owner-workflow-plugin/test/security.test.mjs": "18b8b094969c96683530b4eb9080e1ee2a646abb382785f59eae82280430b128",
    "owner-workflow-plugin/test/plan-revision.test.mjs": "2aa977df41038437c80ad7e73cefedecde3571ed932dd39d591cac7bb76f02e7",
    "owner-workflow-plugin/test/supervisor.test.mjs": "9a457f02c02e055bcd7e798bdef20b94de366e167b200b5e3fbf89f1a31a95b3",
    "owner-workflow-plugin/test/harness-integration.test.mjs": "0d9e66536f666c55f5a746719ef7c83eceb606e8441d52e27139f38cbc7249f3",
    "owner-workflow-plugin/test/memory.test.mjs": "26c9d22e5b3b22d0819a20bc93c1213f3059b14b5c07d604617d46cba2c132f9",
    "owner-workflow-plugin/test/owner-host-command.test.mjs": "ada28b7259d5efeb65e1d9117cf2c739cf9e742a701739579fcbda4fcb9d85ce",
    "owner-workflow-plugin/test/resilience.test.mjs": "f85a49cb6060a7f2668a1c75328e2fcb74f4ffe65db736592910d92b4597cf3f",
    "owner-workflow-plugin/test/orchestrator-documents-native.test.mjs": "bec05360125775564769887f032b7d056e159496baef2964676dca27556a0637",
    "owner-workflow-plugin/test/operation-runtime.test.mjs": "837008d5d134df6ea62b6e871f5655a3349d85f90d85a30eb46bf80c0b35f8ee",
    "owner-workflow-plugin/test/owner-submission.test.mjs": "210fbb6b97468fc2f6c4946c408d29470295dc95bcec1f97f8b83065551696a0",
    "owner-workflow-plugin/test/verification.test.mjs": "6d3ff68a902cd626af8c6ed111a6265e28e5d49bf5283ac0e1b68a99b72781ba",
    "owner-workflow-plugin/test/client-bundle.test.mjs": "83139ed47019ab0f046fe3dad041bf3fe6e6a7af05f40b4226e23416703636b2",
    "owner-workflow-plugin/index.js": "bd456c462f3a5ddf4fb0b77652cd3528ee64237c587024db0dd76a68800d867e"
  },
  "repos": {
    ".": {
      "head": "154914064f5ceb2f8eb413865e10a54e8ffbc663\n",
      "branch": "main\n",
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/124ceb79a610b47a9a7a3be6b3536a09575a98a1\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/145932e9003280cc00e35aad27a454c7de631dae\n57957d4e3613e12c94dbabf53d71f8a38e1adc67 refs/codex/snapshots/3b7681c524894932211b3d5c8b856f0e8ce39ee8\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/522872f6f5d368613af38d2e850d7a47c09886a6\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/8968d9303acd61a9d94fa49bedf4414766ef8894\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9957e186462ead56c4d7c086172b3921ead7b9ef\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9e58f2c8f0a635f2ba9bc1cb1e53e71baf490999\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/bc7ad8378ff8254e5a02f34236c34b834e09b8dd\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/ca05fdb36608106818494992534623b5e5c46ff6\n2486ff43af4afc7e0a78e0efcaac16144d1717a3 refs/codex/snapshots/ce7a59b6cd6cc8ae829dc186ea6ca794baf87114\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/d6203a184745fc8fea16694ed91f9566c79c2ed6\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/e21a79e9773ad39feffe4f24d23cfb8851572d49\na0074edf0165be11217c387bdbecd5a68d95c13e refs/codex/turn-diffs/captures/1789036240036/f6870419-89d4-4f92-919c-618e3e60a7d9/base\na0074edf0165be11217c387bdbecd5a68d95c13e refs/codex/turn-diffs/checkpoints/1b6907baba28859fbba259bcecaef77c5ac146000793515606e4ded7be9a97aa/95bdebfb68b5c5b83a4022facf5048c0fc9b6fc2927a48ae8a4c0ece32dc9784/1789034596438/4eb3103b-c936-40bd-b46c-c8bced14410c\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/heads/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/heads/main\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/HEAD\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/remotes/origin/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/main\n"
    },
    "deepseek-harness": {
      "head": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\n",
      "branch": "master\n",
      "status": " M packages/host/apiproxy/src/fetch/client.ts\n M packages/host/apiproxy/tests/client-handler.spec.ts\n",
      "refs": "12c4dd1c53ead80b856d801db711be0eeb2c5fab refs/dsh/translation-pairing/snapshots/12c4dd1c53ead80b856d801db711be0eeb2c5fab\n1fdeba0f9cd4648a60ae75b9997fbebdc4e965e4 refs/dsh/translation-pairing/snapshots/1fdeba0f9cd4648a60ae75b9997fbebdc4e965e4\n3583662dbaf72ea78bddb6a2b7d6b18360f3f3e1 refs/dsh/translation-pairing/snapshots/3583662dbaf72ea78bddb6a2b7d6b18360f3f3e1\n3bfa46dbf8982e367845d90e9cd2a478b527fdd2 refs/dsh/translation-pairing/snapshots/3bfa46dbf8982e367845d90e9cd2a478b527fdd2\n3e5c959fe65f2077c293378e5a4d7f8369d6e217 refs/dsh/translation-pairing/snapshots/3e5c959fe65f2077c293378e5a4d7f8369d6e217\n4d7af74a835fdfb796b2faf244e8c41f3170c886 refs/dsh/translation-pairing/snapshots/4d7af74a835fdfb796b2faf244e8c41f3170c886\n60102fea104b99e7ffb09c74283c2c8e2d4f9946 refs/dsh/translation-pairing/snapshots/60102fea104b99e7ffb09c74283c2c8e2d4f9946\n60e78397e080ff7f0df8ce2055d044135839eb62 refs/dsh/translation-pairing/snapshots/60e78397e080ff7f0df8ce2055d044135839eb62\n634c726cdb6d8f6f5712b52c6f97cf6645da3482 refs/dsh/translation-pairing/snapshots/634c726cdb6d8f6f5712b52c6f97cf6645da3482\n6f572f895028bcabbaf48f02fa8b9c3e55e6376c refs/dsh/translation-pairing/snapshots/6f572f895028bcabbaf48f02fa8b9c3e55e6376c\n8188bb63b5974e973650033354a1fa48ab9f0970 refs/dsh/translation-pairing/snapshots/8188bb63b5974e973650033354a1fa48ab9f0970\n9084f529d7e193271f9cb797a07df394754315e2 refs/dsh/translation-pairing/snapshots/9084f529d7e193271f9cb797a07df394754315e2\nb3817de5a585ffe808ccff4e48928174eaf00437 refs/dsh/translation-pairing/snapshots/b3817de5a585ffe808ccff4e48928174eaf00437\nb3a12c0f488a561c5818930d1567b5e80d648a8f refs/dsh/translation-pairing/snapshots/b3a12c0f488a561c5818930d1567b5e80d648a8f\nb5e7aa9e1242f56019f6919a47dd1845386c1d10 refs/dsh/translation-pairing/snapshots/b5e7aa9e1242f56019f6919a47dd1845386c1d10\nbd48b2b3aa4f96c9a9cc064061992e5089ed7e78 refs/dsh/translation-pairing/snapshots/bd48b2b3aa4f96c9a9cc064061992e5089ed7e78\nbd53d10b7cc488d3f1f185689df5f43af1b3218f refs/dsh/translation-pairing/snapshots/bd53d10b7cc488d3f1f185689df5f43af1b3218f\ne38c1307c9ffb5ed37fce8d9e499189cdf386885 refs/dsh/translation-pairing/snapshots/e38c1307c9ffb5ed37fce8d9e499189cdf386885\nf394615cfaaba362ce15903101c089d9f759157a refs/dsh/translation-pairing/snapshots/f394615cfaaba362ce15903101c089d9f759157a\nb150a551b8d465e31e418e1b2eaf5e79bbb7d28e refs/heads/master\ndd6322d604e00eec1ba5e0c8541159906a21094a refs/remotes/origin/HEAD\ndd6322d604e00eec1ba5e0c8541159906a21094a refs/remotes/origin/master\n99f6f02fecdb7dff40c3fbc9470f5907c29f74ca refs/tags/dsh-v0.1.0-rc.7\n141eb6fef83422698aef7a981029e843e8161534 refs/tags/dsh-v0.1.0-rc.8\n528c682e061696f5a160f363f236ecbf53cbd006 refs/tags/dsh-v0.1.1-rc.1\nb150a551b8d465e31e418e1b2eaf5e79bbb7d28e refs/tags/dsh-v0.1.1-rc.2\ncd5ef8148158c3a752a658978873241fdf8e2bbc refs/tags/dsh-v0.1.2-alpha.1\n0a53fb55bea101816fa226bb964ae2bed71c343b refs/tags/dsh-v0.1.2-alpha.2\ndd6322d604e00eec1ba5e0c8541159906a21094a refs/tags/dsh-v0.1.2-alpha.3\n"
    },
    "dsh-synapse": {
      "head": "97f8c432de875d97bf7a5e4d675f8010f7b34556\n",
      "branch": "",
      "status": "",
      "refs": "a323f76b0c47ffad59194d8ac7efacb3aa6bdfba refs/heads/main\n56935dc1862e7791b212f6eb2dd26404def5a575 refs/remotes/origin/HEAD\n56935dc1862e7791b212f6eb2dd26404def5a575 refs/remotes/origin/main\nc239738c9b1c63e1f0996dbe7e3480186cded42d refs/tags/v0.4.0\nb8eae914a2b1e165eb39d63312319b4d44dee524 refs/tags/v0.4.1\n"
    },
    "owner-workflow-plugin/vendor/dsh-approve-for-me": {
      "head": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\n",
      "branch": "main\n",
      "status": "",
      "refs": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b refs/heads/main\n0e50918ff9dfd49b6cadf86093baa325a3bc16bf refs/remotes/origin/HEAD\nf3a45b67e99a0e83ef0816c96b4e6c5e8289887e refs/remotes/origin/compat/dsh-0.1.1-rc.1\n93e6f35ca68d54bb5a1b746fb02b55f29d003b03 refs/remotes/origin/compat/dsh-0.1.1-rc.2\n1a88a630b20eb57ccf7e0e4a78d5f7532f7ff5cc refs/remotes/origin/compat/rc7\n0e50918ff9dfd49b6cadf86093baa325a3bc16bf refs/remotes/origin/main\nf1b08abdfccb35d475b62d090fc536e6b11aa14f refs/remotes/origin/maintenance/beta2-quality\n"
    }
  }
}
````

## 冻结候选

````json
{
  "at": "2026-09-10T10:48:16.251427+00:00",
  "scope": "T-03 / AC-15: obligation-scoped verified progress",
  "hashes": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "74644b3a7705211e3a3c840b141c3c8cae16e525e93fa2778154c92785c476e2",
    "owner-workflow-plugin/src/operation.mjs": "7e4b4c065cb5c193b2ab83966d4c214bebd3adcd4d7d3496948c9b4ce856b6a3",
    "owner-workflow-plugin/src/memory.mjs": "b7f04c732870432d1289ed1276a0769bffeccf5c8e62da13611ce823c036d631",
    "owner-workflow-plugin/src/workflow-conversation.mjs": "7d0bab4e9aafc24db9a587c24c2dce18ec8eac925bb9a7cfbaaa65c927345757",
    "owner-workflow-plugin/src/owner-submission.mjs": "784122aab6dde4e9a44170ecdc72b37fbdaaf6d9ffeec8d1dced670b390252cb",
    "owner-workflow-plugin/src/skills.mjs": "7520c41c9219dd93666ac2bbbe8390bc748bf317ad8f6c38f3f0b4b10772b959",
    "owner-workflow-plugin/src/external-runner.mjs": "5926b4e15819df617e301d390d21088e20ab06663a7207261444886457705343",
    "owner-workflow-plugin/src/dashboard.mjs": "6046206027436567ad71880b80edd63dec76bc6c273b54fb25b4ce2660c676fb",
    "owner-workflow-plugin/src/owner-boundary.mjs": "307599a1e6dba3f2214fcee610d74f7552fcea4facbcbbe16e22a95c80adcace",
    "owner-workflow-plugin/src/verification.mjs": "ece159d95577c6891a8fc0fa3a930e8abae2c3ef811b430b5997974328a88264",
    "owner-workflow-plugin/src/plan-revision.mjs": "14d87958cbfcaaec0b98b9af2433bccc7b678680db6eddc9d760a78b9cf19af5",
    "owner-workflow-plugin/src/dashboard-page.mjs": "457340df7fed006f189914a40b7a28e456c975b90ed6cae26374dc92f22c2582",
    "owner-workflow-plugin/src/workflow-state.mjs": "441102865e2b756046d7dbb126f829019878aee06b0bc084359fafa80525613d",
    "owner-workflow-plugin/src/runtime.mjs": "d81a9f3a2ecf06bcce243c9808d60c61bec1ba6c56f030d30e8429994c9b12e1",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "18bf5137cc24a94d407cfca4bc4941bcc97deacf85be56942c7fd10280889124",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/test/launcher.test.mjs": "b6550c3e19347bba3e9e71b7db8feb07d8cfbcc171852f653b6086ed0ddfe882",
    "owner-workflow-plugin/test/owner-boundary.test.mjs": "3e2c4b9d5146893d995f308b470942e3f4bf752d48b6cf02d172da822bb6e593",
    "owner-workflow-plugin/test/runner.test.mjs": "811dba5847bc7270e18cbb76d9e48938b381e6d4a6bed211ef1b32cb321ef7b7",
    "owner-workflow-plugin/test/plugin.test.mjs": "10b7ee884e38f37fa59b9d598b217195d785be3164efb1684438b9179148fd81",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/operation-approval.test.mjs": "c6f43055ca7400d3587bd5f89da1731c8d831d76dd8e7897b0c9503b0ae1c96b",
    "owner-workflow-plugin/test/workflow-state.test.mjs": "db7e3535929a7679f1afafc18b010adc9b29d40782e2f2ece917af4d47fd38d1",
    "owner-workflow-plugin/test/dashboard-host.test.mjs": "10a51bc733d40bfd2982eb23e8f01acbbbf031a427e0b3efcd44bf1f34664f71",
    "owner-workflow-plugin/test/model.test.mjs": "cef54ba55188cd9c7af5497521dc6c831caa840edbf5adabbc8cd988e7d5ecea",
    "owner-workflow-plugin/test/control.test.mjs": "42bdaab2f576ca0cbeaa2b1214d720a5d15909699888e867c527865a7742cf2c",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "0cd9323e12d12983ae685f86e33d18d47b5685bdccd3640011ad4908b49df350",
    "owner-workflow-plugin/test/git.test.mjs": "368e9d09f65acc7b607fc47f17fd5410a89c06c7ce9b6642167d86239cfa2d39",
    "owner-workflow-plugin/test/security.test.mjs": "18b8b094969c96683530b4eb9080e1ee2a646abb382785f59eae82280430b128",
    "owner-workflow-plugin/test/plan-revision.test.mjs": "2aa977df41038437c80ad7e73cefedecde3571ed932dd39d591cac7bb76f02e7",
    "owner-workflow-plugin/test/supervisor.test.mjs": "9a457f02c02e055bcd7e798bdef20b94de366e167b200b5e3fbf89f1a31a95b3",
    "owner-workflow-plugin/test/harness-integration.test.mjs": "0d9e66536f666c55f5a746719ef7c83eceb606e8441d52e27139f38cbc7249f3",
    "owner-workflow-plugin/test/memory.test.mjs": "26c9d22e5b3b22d0819a20bc93c1213f3059b14b5c07d604617d46cba2c132f9",
    "owner-workflow-plugin/test/owner-host-command.test.mjs": "ada28b7259d5efeb65e1d9117cf2c739cf9e742a701739579fcbda4fcb9d85ce",
    "owner-workflow-plugin/test/resilience.test.mjs": "f85a49cb6060a7f2668a1c75328e2fcb74f4ffe65db736592910d92b4597cf3f",
    "owner-workflow-plugin/test/orchestrator-documents-native.test.mjs": "bec05360125775564769887f032b7d056e159496baef2964676dca27556a0637",
    "owner-workflow-plugin/test/operation-runtime.test.mjs": "837008d5d134df6ea62b6e871f5655a3349d85f90d85a30eb46bf80c0b35f8ee",
    "owner-workflow-plugin/test/owner-submission.test.mjs": "210fbb6b97468fc2f6c4946c408d29470295dc95bcec1f97f8b83065551696a0",
    "owner-workflow-plugin/test/verification.test.mjs": "6d3ff68a902cd626af8c6ed111a6265e28e5d49bf5283ac0e1b68a99b72781ba",
    "owner-workflow-plugin/test/client-bundle.test.mjs": "83139ed47019ab0f046fe3dad041bf3fe6e6a7af05f40b4226e23416703636b2",
    "owner-workflow-plugin/index.js": "bd456c462f3a5ddf4fb0b77652cd3528ee64237c587024db0dd76a68800d867e",
    "deepseek-harness/vendor/cordis/lib/index.js": "1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5",
    "deepseek-harness/packages/core/system-prompt/lib/index.js": "7f7307f6fa8c28d60a2e628d2c94c1a08c2a7bdb6f00602323556e1962fa4811",
    "deepseek-harness/packages/core/tools/lib/index.js": "47de95d14493dbd22d1a3ade14890fc99d7232db4e363f2190c9063b030dd029",
    "deepseek-harness/packages/fs/fs-local/lib/index.js": "9f31b7d19bee8ca0a51f0ef2fd6d4dc0c9bd0b10cc8378ea75a90beb134d32bb",
    "deepseek-harness/packages/fs/fs-observation-policy/lib/index.js": "e36b54cdb5c6fa01ccfa29f0433753e810ec1ac29a6a22be349d66b77eb64b03",
    "deepseek-harness/packages/fs/tool-fs/lib/index.js": "7ddcf5c2a267076f5154b220aa73a165cbc7257db8dd6a8644bd5ac86842b878"
  }
}
````

## 本轮精确差分

````diff
--- before/owner-workflow-plugin/src/convergence.mjs
+++ candidate/owner-workflow-plugin/src/convergence.mjs
@@ -1,7 +1,7 @@
 import { createHash } from 'node:crypto'

 export const CONVERGENCE_CONTRACT = 'DSH_WORKFLOW_CONVERGENCE_V1'
-export const CONVERGENCE_RUNTIME_VERSION = 'evidence-lease-v2'
+export const CONVERGENCE_RUNTIME_VERSION = 'evidence-lease-v3'

 export const AUTONOMOUS_STRATEGIES = Object.freeze([
   'local_subgraph_rewrite',
@@ -234,52 +234,74 @@
   return []
 }

+function stableVerificationResult(result) {
+  return {
+    passed: result?.passed === true,
+    exitCode: Number.isSafeInteger(result?.exitCode) ? result.exitCode : null,
+    timedOut: result?.timedOut === true,
+    contentDigest: nonEmptyText(result?.contentDigest) ?? null,
+  }
+}
+
 function taskEvidence(task) {
   return {
     taskId: task?.taskId ?? task?.id,
-    status: task?.status,
-    cursor: task?.cursor ?? null,
-    checkState: task?.checkState ?? null,
-    fixedCommitSha: task?.fixedCommitSha ?? null,
-    verificationResults: Object.fromEntries(Object.entries(task?.verificationResults ?? {}).map(([id, result]) => [id, {
-      passed: result?.passed === true,
-      exitCode: result?.exitCode ?? null,
-      timedOut: result?.timedOut === true,
-      contentDigest: result?.contentDigest ?? null,
-    }])),
-  }
-}
-
-function stableRuntimeEvidence(value) {
-  if (Array.isArray(value)) return value.map(stableRuntimeEvidence)
-  if (value !== null && typeof value === 'object') {
-    return Object.fromEntries(Object.entries(value)
-      .filter(([key]) => !['generatedAt', 'updatedAt', 'startedAt', 'heartbeatAt', 'lastHeartbeatAt'].includes(key))
-      .map(([key, child]) => [key, stableRuntimeEvidence(child)]))
-  }
-  return value
-}
-
-function planningOwnerEvidence(state) {
-  return (state?.planningAgent?.ownerConsultations ?? [])
-    .map(item => ({
-      ownerId: String(item?.ownerId ?? ''),
-      scopeFit: String(item?.scopeFit ?? ''),
-      unavailable: item?.unavailable === true,
-      facts: (item?.facts ?? []).map(normalizedText).filter(Boolean).sort(),
-      constraints: (item?.constraints ?? []).map(normalizedText).filter(Boolean).sort(),
+    fixedCommitSha: nonEmptyText(task?.fixedCommitSha) ?? null,
+    verificationResults: Object.fromEntries(Object.entries(task?.verificationResults ?? {})
+      .sort(([left], [right]) => left.localeCompare(right))
+      .map(([id, result]) => [id, stableVerificationResult(result)])),
+  }
+}
+
+function taskIdsForVerifiedFile(file) {
+  return [...new Set([
+    file?.taskId,
+    ...(Array.isArray(file?.candidateTaskIds) ? file.candidateTaskIds : []),
+  ].map(nonEmptyText).filter(Boolean))].sort()
+}
+
+function verifiedFileEvidence(runtimeFacts) {
+  return (Array.isArray(runtimeFacts?.verifiedFiles) ? runtimeFacts.verifiedFiles : [])
+    .map(file => ({
+      taskIds: taskIdsForVerifiedFile(file),
+      path: nonEmptyText(file?.path),
+      kind: file?.kind,
+      sha256: nonEmptyText(file?.sha256)?.toLowerCase(),
     }))
-    .filter(item => item.ownerId !== '')
-    .sort((left, right) => left.ownerId.localeCompare(right.ownerId))
-}
-
+    .filter(file => file.kind === 'file'
+      && file.path !== undefined
+      && /^[a-f0-9]{64}$/u.test(file.sha256 ?? '')
+      && file.taskIds.length > 0)
+    .sort((left, right) => canonical(left).localeCompare(canonical(right)))
+}
+
+function planningWorktreeFileEvidence(runtimeFacts) {
+  return (Array.isArray(runtimeFacts?.worktrees) ? runtimeFacts.worktrees : [])
+    .flatMap(worktree => (Array.isArray(worktree?.files) ? worktree.files : []).map(file => ({
+      taskIds: taskIdsForVerifiedFile(file),
+      path: nonEmptyText(file?.path),
+      kind: file?.kind,
+      sha256: nonEmptyText(file?.sha256)?.toLowerCase(),
+    })))
+    .filter(file => file.kind === 'file'
+      && file.path !== undefined
+      && /^[a-f0-9]{64}$/u.test(file.sha256 ?? ''))
+    .sort((left, right) => canonical(left).localeCompare(canonical(right)))
+}
+
+/**
+ * A diagnostic projection only.  It intentionally excludes candidate/HEAD
+ * bookkeeping, sessions, timestamps, and all consultation prose.  Callers
+ * must still use per-obligation Runtime evidence below to decide progress.
+ */
 export function workflowEvidenceDigest(state, runtimeFacts) {
   return digest({
-    workflowHead: state?.workflowHead ?? null,
-    activePlanRevision: state?.activePlanRevision ?? null,
     tasks: (state?.tasks ?? []).map(taskEvidence).sort((left, right) => String(left.taskId).localeCompare(String(right.taskId))),
-    planningOwnerEvidence: planningOwnerEvidence(state),
-    runtimeFacts: stableRuntimeEvidence(runtimeFacts ?? state?.planningRuntimeFacts ?? null),
+    // Recovery paths outside plan review still pass the Runtime's freshly
+    // inspected owner worktree facts.  Retain only ordinary-file hashes and
+    // task associations, never worktree paths, status prose, or timestamps.
+    verifiedFiles: [...verifiedFileEvidence(runtimeFacts), ...planningWorktreeFileEvidence(runtimeFacts)]
+      .sort((left, right) => canonical(left).localeCompare(canonical(right))),
   })
 }

@@ -341,10 +363,237 @@
 function runtimeClosureEvidence(runtimeEvidence, candidate) {
   return {
     planDigest: runtimeEvidence?.planDigest === candidate?.planDigest ? runtimeEvidence.planDigest : undefined,
-    planBindings: runtimeEvidence?.planBindings ?? [],
-    taskVerificationResults: runtimeEvidence?.taskVerificationResults ?? [],
-    executableTasks: runtimeEvidence?.executableTasks ?? [],
-    decisionRecords: runtimeEvidence?.decisionRecords ?? [],
+    planBindings: Array.isArray(runtimeEvidence?.planBindings) ? runtimeEvidence.planBindings : [],
+    taskVerificationResults: Array.isArray(runtimeEvidence?.taskVerificationResults) ? runtimeEvidence.taskVerificationResults : [],
+    executableTasks: Array.isArray(runtimeEvidence?.executableTasks) ? runtimeEvidence.executableTasks : [],
+    decisionRecords: Array.isArray(runtimeEvidence?.decisionRecords) ? runtimeEvidence.decisionRecords : [],
+  }
+}
+
+function progressRuntimeEvidence(runtimeEvidence, candidate) {
+  const closure = runtimeClosureEvidence(runtimeEvidence, candidate)
+  return {
+    ...closure,
+    verifiedFiles: closure.planDigest === undefined ? [] : verifiedFileEvidence(runtimeEvidence),
+  }
+}
+
+function obligationProofId(obligation, fact) {
+  return digest({
+    contract: CONVERGENCE_CONTRACT,
+    obligation: {
+      id: obligation.id,
+      source: obligation.source,
+      targetTaskIds: obligation.targetTaskIds,
+      closeWhen: obligation.closeWhen,
+    },
+    fact,
+  })
+}
+
+function proofRecord(obligation, fact) {
+  return {
+    id: obligationProofId(obligation, fact),
+    // This identity deliberately omits Reviewer-controlled obligation/source
+    // identifiers.  It prevents a model from recycling one physical Runtime
+    // fact under a fresh obligationId every round.
+    factId: digest({ contract: CONVERGENCE_CONTRACT, fact }),
+    ...fact,
+  }
+}
+
+/**
+ * Runtime facts can affect the next recovery action only when they name the
+ * open obligation's own target and release condition.  Candidate identity is
+ * a freshness gate, rather than a fact identifier: returning A/B candidates
+ * with the same binding, file digest, or result cannot mint new progress.
+ */
+function obligationProgressEvidence(obligation, candidate, runtimeEvidence) {
+  if (!hasClosureContract(obligation)) return []
+  const evidence = progressRuntimeEvidence(runtimeEvidence, candidate)
+  if (evidence.planDigest === undefined) return []
+  const condition = obligation.closeWhen
+  const facts = []
+  if (condition.kind === 'plan_verification_binding') {
+    if (evidence.planBindings.some(item => (
+      item?.taskId === condition.taskId && item?.verificationId === condition.verificationId
+    ))) {
+      facts.push({ kind: 'plan_verification_binding', taskId: condition.taskId, verificationId: condition.verificationId })
+    }
+  }
+  if (condition.kind === 'task_verification_result') {
+    for (const result of evidence.taskVerificationResults) {
+      if (result?.taskId !== condition.taskId
+        || result?.verificationId !== condition.verificationId
+        || result?.planDigest !== candidate.planDigest
+        || result?.current !== true
+        || result?.passed !== true
+        || result?.exitCode !== 0
+        || nonEmptyText(result?.contentDigest) === undefined) continue
+      facts.push({
+        kind: 'task_verification_result',
+        taskId: condition.taskId,
+        verificationId: condition.verificationId,
+        contentDigest: result.contentDigest,
+      })
+    }
+  }
+  // Structural facts are deliberately relevant only to the structural
+  // closeWhen.  A newly executable task cannot renew a verification issue.
+  if (condition.kind === 'plan_task_executable') {
+    if (evidence.executableTasks.some(item => item?.taskId === condition.taskId)) {
+      facts.push({ kind: 'plan_task_executable', taskId: condition.taskId })
+    }
+  }
+  if (condition.kind === 'decision_record') {
+    for (const record of evidence.decisionRecords) {
+      if (record?.obligationId !== obligation.id
+        || record?.planDigest !== candidate.planDigest
+        || record?.taskId !== condition.taskId
+        || record?.authority !== condition.authority
+        || record?.source?.id !== obligation.source.id
+        || record?.source?.version !== obligation.source.version
+        || record?.status !== 'recorded'
+        || record?.current !== true
+        || nonEmptyText(record?.decisionId) === undefined) continue
+      facts.push({
+        kind: 'decision_record',
+        taskId: condition.taskId,
+        authority: condition.authority,
+        decisionId: record.decisionId,
+      })
+    }
+  }
+  // A host has re-read and hashed this file after validating the current
+  // candidate.  The file may guide recovery, but it never closes an
+  // obligation without the existing explicit Reviewer closure request.
+  for (const file of evidence.verifiedFiles) {
+    if (!file.taskIds.includes(condition.taskId)) continue
+    facts.push({
+      kind: 'verified_file',
+      taskId: condition.taskId,
+      path: file.path,
+      sha256: file.sha256,
+    })
+  }
+  return [...new Map(facts.map(fact => {
+    const proof = proofRecord(obligation, fact)
+    return [proof.id, proof]
+  })).values()].sort((left, right) => left.id.localeCompare(right.id))
+}
+
+function runtimePhysicalEvidence(candidate, runtimeEvidence) {
+  const evidence = progressRuntimeEvidence(runtimeEvidence, candidate)
+  if (evidence.planDigest === undefined) return []
+  const facts = []
+  for (const binding of evidence.planBindings) {
+    const taskId = nonEmptyText(binding?.taskId)
+    const verificationId = nonEmptyText(binding?.verificationId)
+    if (taskId !== undefined && verificationId !== undefined) {
+      facts.push({ kind: 'plan_verification_binding', taskId, verificationId })
+    }
+  }
+  for (const result of evidence.taskVerificationResults) {
+    const taskId = nonEmptyText(result?.taskId)
+    const verificationId = nonEmptyText(result?.verificationId)
+    const contentDigest = nonEmptyText(result?.contentDigest)
+    if (taskId !== undefined
+      && verificationId !== undefined
+      && contentDigest !== undefined
+      && result?.planDigest === candidate.planDigest
+      && result?.current === true
+      && result?.passed === true
+      && result?.exitCode === 0) {
+      facts.push({ kind: 'task_verification_result', taskId, verificationId, contentDigest })
+    }
+  }
+  for (const task of evidence.executableTasks) {
+    const taskId = nonEmptyText(task?.taskId)
+    if (taskId !== undefined) facts.push({ kind: 'plan_task_executable', taskId })
+  }
+  for (const record of evidence.decisionRecords) {
+    const taskId = nonEmptyText(record?.taskId)
+    const decisionId = nonEmptyText(record?.decisionId)
+    if (taskId !== undefined
+      && decisionId !== undefined
+      && ['orchestrator', 'user'].includes(record?.authority)
+      && record?.planDigest === candidate.planDigest
+      && record?.status === 'recorded'
+      && record?.current === true) {
+      facts.push({ kind: 'decision_record', taskId, authority: record.authority, decisionId })
+    }
+  }
+  for (const file of evidence.verifiedFiles) {
+    for (const taskId of file.taskIds) {
+      facts.push({ kind: 'verified_file', taskId, path: file.path, sha256: file.sha256 })
+    }
+  }
+  return [...new Map(facts.map(fact => {
+    const id = digest({ contract: CONVERGENCE_CONTRACT, fact })
+    return [id, { id, ...fact }]
+  })).values()].sort((left, right) => left.id.localeCompare(right.id))
+}
+
+function isPlainRecord(value) {
+  return value !== null && typeof value === 'object' && !Array.isArray(value)
+}
+
+function seenEvidenceLedger(value) {
+  if (!isPlainRecord(value)) return undefined
+  const ledger = new Map()
+  for (const [obligationId, records] of Object.entries(value)) {
+    if (!Array.isArray(records)) continue
+    const normalized = [...new Map(records.map(record => {
+      const id = typeof record === 'string' ? record : nonEmptyText(record?.id)
+      return id === undefined ? undefined : [id, typeof record === 'string' ? { id } : record]
+    }).filter(Boolean)).values()].sort((left, right) => left.id.localeCompare(right.id))
+    if (normalized.length > 0) ledger.set(obligationId, normalized)
+  }
+  return ledger
+}
+
+function serializeSeenEvidence(ledger) {
+  return Object.fromEntries([...ledger.entries()]
+    .filter(([, records]) => records.length > 0)
+    .sort(([left], [right]) => left.localeCompare(right))
+    .map(([obligationId, records]) => [obligationId, records.sort((left, right) => left.id.localeCompare(right.id))]))
+}
+
+function seenEvidenceFacts(value) {
+  if (!Array.isArray(value)) return undefined
+  return new Map(value.map(record => {
+    const id = typeof record === 'string' ? record : nonEmptyText(record?.id)
+    return id === undefined ? undefined : [id, typeof record === 'string' ? { id } : record]
+  }).filter(Boolean))
+}
+
+function serializeSeenEvidenceFacts(facts) {
+  return [...facts.values()].sort((left, right) => left.id.localeCompare(right.id))
+}
+
+function strategyRenewals(value) {
+  if (!Array.isArray(value)) return []
+  return [...new Map(value.map(item => {
+    const id = nonEmptyText(item?.id)
+    return id === undefined ? undefined : [id, {
+      id,
+      evidenceIds: [...new Set((Array.isArray(item?.evidenceIds) ? item.evidenceIds : [])
+        .map(nonEmptyText).filter(Boolean))].sort(),
+      status: item?.status === 'consumed' ? 'consumed' : 'available',
+      ...(nonEmptyText(item?.grantedAt) === undefined ? {} : { grantedAt: item.grantedAt }),
+      ...(nonEmptyText(item?.consumedAt) === undefined ? {} : { consumedAt: item.consumedAt }),
+    }]
+  }).filter(Boolean)).values()]
+}
+
+function renewalForEvidence(proofs, time) {
+  const evidenceIds = [...new Set(proofs.map(proof => proof.id))].sort()
+  if (evidenceIds.length === 0) return undefined
+  return {
+    id: digest(['local_strategy_renewal', evidenceIds]),
+    evidenceIds,
+    status: 'available',
+    grantedAt: time,
   }
 }

@@ -485,19 +734,81 @@
   const inheritedAcrossCycle = baseline !== undefined && !sameCycle
   const priorObligations = baseline?.obligations ?? []
   const priorOpen = priorObligations.filter(item => item.status === 'open')
-  const evidenceChanged = baseline !== undefined && baseline.evidenceDigest !== evidenceDigest
+  const introduced = current.filter(item => !priorObligations.some(previousItem => sameObligation(previousItem, item)))
+  const conflicts = identityConflicts(priorObligations, current)
+  const conflictingIds = new Set(conflicts.map(item => item.id))
+  const unconflictedIntroduced = introduced.filter(item => !conflictingIds.has(item.id))
+  // `evidenceDigest` remains useful diagnostics for operators, but it is not
+  // authority to renew recovery.  It includes no sufficient obligation
+  // mapping, and callers may legitimately refresh it for a new session or
+  // candidate without learning a new Runtime fact.
+  const priorSeenEvidence = seenEvidenceLedger(baseline?.seenEvidence)
+  const priorSeenFacts = seenEvidenceFacts(baseline?.seenEvidenceFacts)
+  const hasDurableSeenEvidence = baseline !== undefined
+    && priorSeenEvidence !== undefined
+    && priorSeenFacts !== undefined
+  const seenEvidence = priorSeenEvidence ?? new Map()
+  const seenFacts = priorSeenFacts ?? new Map()
+  const physicalEvidence = runtimePhysicalEvidence(candidate, runtimeEvidence)
+  // Resolved requirements cannot fund another recovery.  Conflicted review
+  // records cannot do so either: their Reviewer-controlled identity is not a
+  // trusted way to relabel a physical fact.
+  const currentOpen = current.filter(item => (
+    !conflictingIds.has(item.id)
+    && !priorObligations.some(previousItem => previousItem.status === 'resolved' && sameObligation(previousItem, item))
+  ))
+  const evidenceSubjects = uniqueObligations([...priorOpen, ...currentOpen])
+  const observedEvidence = new Map(evidenceSubjects.map(obligation => [
+    obligation.id,
+    obligationProgressEvidence(obligation, candidate, runtimeEvidence),
+  ]))
+  const newEvidenceByObligation = new Map()
+  // Compare only with the prior durable snapshot.  One genuinely new Runtime
+  // fact may be relevant to multiple already-declared independent obligations
+  // in this same reconciliation; the renewal below still groups them once.
+  const knownFactIds = new Set(seenFacts.keys())
+  for (const obligation of [...evidenceSubjects].sort((left, right) => left.id.localeCompare(right.id))) {
+    const known = new Set((seenEvidence.get(obligation.id) ?? []).map(item => item.id))
+    const fresh = []
+    if (baseline !== undefined && hasDurableSeenEvidence) {
+      for (const proof of observedEvidence.get(obligation.id) ?? []) {
+        if (known.has(proof.id) || knownFactIds.has(proof.factId)) continue
+        fresh.push(proof)
+      }
+    }
+    newEvidenceByObligation.set(obligation.id, fresh)
+  }
+  // Persist every observed proof, including an unsupported new record.  The
+  // same proof cannot become new later merely because the Reviewer retries it
+  // under another obligation ID or source version.
+  for (const obligation of evidenceSubjects) {
+    const retained = seenEvidence.get(obligation.id) ?? []
+    const merged = new Map(retained.map(item => [item.id, item]))
+    for (const proof of observedEvidence.get(obligation.id) ?? []) {
+      merged.set(proof.id, proof)
+      const { id, factId, ...fact } = proof
+      if (!seenFacts.has(factId)) seenFacts.set(factId, { id: factId, ...fact })
+    }
+    if (merged.size > 0) seenEvidence.set(obligation.id, [...merged.values()])
+  }
+  // Record all candidate-validated Runtime facts, including one currently
+  // relevant only to a resolved requirement.  A later Reviewer cannot relabel
+  // that physical fact as a fresh issue and obtain another renewal.
+  for (const fact of physicalEvidence) {
+    if (!seenFacts.has(fact.id)) seenFacts.set(fact.id, fact)
+  }
+  const newEvidence = [...newEvidenceByObligation.values()].flat()
+  const evidenceChanged = newEvidence.length > 0
   const closures = new Map(priorOpen.map(item => [item.id, verifiedClosure(item, review, candidate, runtimeEvidence, time)]))
   const resolved = priorOpen.filter(item => closures.get(item.id)?.resolution !== undefined)
   const closureBlockers = priorOpen
     .filter(item => closures.get(item.id)?.resolution === undefined)
     .map(item => ({ id: item.id, reason: closures.get(item.id)?.reason ?? 'closure_evidence_missing' }))
-  const introduced = current.filter(item => !priorObligations.some(previousItem => sameObligation(previousItem, item)))
-  const conflicts = identityConflicts(priorObligations, current)
-  const conflictingIds = new Set(conflicts.map(item => item.id))
-  const unconflictedIntroduced = introduced.filter(item => !conflictingIds.has(item.id))
-  const admittedNew = baseline === undefined || evidenceChanged ? unconflictedIntroduced : []
+  const admittedNew = baseline === undefined
+    ? unconflictedIntroduced
+    : unconflictedIntroduced.filter(item => (newEvidenceByObligation.get(item.id) ?? []).length > 0)
   const unsupportedNewObligations = [
-    ...(baseline === undefined || evidenceChanged ? [] : unconflictedIntroduced),
+    ...(baseline === undefined ? [] : unconflictedIntroduced.filter(item => !admittedNew.includes(item))),
     ...current.filter(item => conflictingIds.has(item.id)),
   ]
   const obligations = baseline === undefined
@@ -525,17 +836,32 @@
       : evidenceChanged
         ? 'new_evidence'
         : 'none'
-  const resetStrategies = baseline === undefined || evidenceChanged || resolved.length > 0
-  const usedStrategies = resetStrategies
+  // Evidence can fund one later local retry, but never clears the finite
+  // strategy ledger.  Workflow-wide attempt budgeting is deliberately owned
+  // by Runtime (T-09), so this contract neither reads nor resets it.
+  const usedStrategies = baseline === undefined
     ? []
     : [...new Set([...(baseline.usedStrategies ?? []), ...(candidate.strategy === undefined ? [] : [candidate.strategy])])]
+  const renewalRecords = strategyRenewals(baseline?.localStrategyRenewals)
+  const renewal = baseline === undefined ? undefined : renewalForEvidence(newEvidence, time)
+  if (renewal !== undefined && !renewalRecords.some(item => item.id === renewal.id)) renewalRecords.push(renewal)
   const authorityRequired = reviewRequiresUserAuthority(review)
   const preferred = preferredStrategies(review, openObligations, unsupportedNewObligations)
-  const nextStrategy = passed
+  let consumedRenewal
+  let nextStrategy = passed
     ? 'awaiting_approval'
     : authorityRequired
       ? 'request_user_authority'
       : nextUnusedStrategy(preferred, usedStrategies)
+  if (nextStrategy === 'autonomous_incident' && !passed && !authorityRequired) {
+    const available = renewalRecords.find(item => item.status === 'available')
+    if (available !== undefined && preferred.includes('local_subgraph_rewrite')) {
+      available.status = 'consumed'
+      available.consumedAt = time
+      consumedRenewal = available
+      nextStrategy = 'local_subgraph_rewrite'
+    }
+  }
   const event = {
     at: time,
     candidatePlanDigest: candidate.planDigest,
@@ -543,12 +869,16 @@
     strategy: candidate.strategy ?? 'initial',
     progress,
     evidenceChanged,
+    newEvidenceObligationIds: [...new Set(evidenceSubjects
+      .filter(item => (newEvidenceByObligation.get(item.id) ?? []).length > 0)
+      .map(item => item.id))],
     inheritedAcrossCycle,
     resolvedObligationIds: resolved.map(item => item.id),
     openObligationIds: openObligations.map(item => item.id),
     unsupportedNewObligationIds: unsupportedNewObligations.map(item => item.id),
     closureBlockers,
     identityConflicts: conflicts,
+    ...(consumedRenewal === undefined ? {} : { consumedLocalStrategyRenewal: consumedRenewal.id }),
     nextStrategy,
   }
   return {
@@ -557,6 +887,9 @@
     cycleId: candidate.cycleId,
     inheritedAcrossCycle,
     evidenceDigest,
+    seenEvidence: serializeSeenEvidence(seenEvidence),
+    seenEvidenceFacts: serializeSeenEvidenceFacts(seenFacts),
+    localStrategyRenewals: renewalRecords,
     obligations,
     unsupportedNewObligations,
     closureBlockers,
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -2714,6 +2714,7 @@
     taskVerificationResults: [],
     executableTasks: [],
     decisionRecords: [],
+    verifiedFiles: [],
   }
   const candidate = currentPlanReviewCandidate(state, plan, candidatePlanDigest)
   // Invalid, stale, or substituted plans are deliberately evidence-empty.
@@ -2742,6 +2743,18 @@
     return evidence
   }
   evidence.decisionRecords = currentDecisionRecordEvidence(latest, latestCandidate)
+  // Progress facts must be read from the host now, never from persisted
+  // consultation prose or an earlier planningRuntimeFacts snapshot. Only
+  // content-hashed regular files associated with this candidate's tasks
+  // qualify; discovery failures and session/worktree labels are not facts.
+  const discovery = await ownerWorktreePlanningFacts(runtime, { ...latest, plan: latestCandidate.plan }, signal)
+  const candidateTaskIds = new Set(latestCandidate.plan.tasks.map(task => task.id))
+  evidence.verifiedFiles = discovery.worktrees.flatMap(worktree => worktree.files.flatMap(file =>
+    file.kind === 'file' && /^[a-f0-9]{64}$/u.test(file.sha256 ?? '')
+      ? file.candidateTaskIds.filter(taskId => candidateTaskIds.has(taskId)).map(taskId => ({
+          taskId, path: file.path, kind: file.kind, sha256: file.sha256,
+        }))
+      : []))
   if (latestCandidate?.kind !== 'active') return evidence
   for (const task of latestCandidate.plan.tasks) {
     const taskState = latest.tasks?.find(item => item.taskId === task.id)
@@ -7593,25 +7606,27 @@
         const current = await readState(runtime, root, workflowId)
         let resumedPlan = false
         const resumedTasks = []
-        if (current.planConvergence?.contract === CONVERGENCE_CONTRACT
+        const reviewCandidate = current.pendingPlanRevision ?? (current.plan === undefined ? undefined : {
+          plan: current.plan, planDigest: current.planDigest,
+        })
+        const probed = current.planConvergence?.contract === CONVERGENCE_CONTRACT
           && current.planConvergence.nextStrategy === 'autonomous_incident'
-          && current.planConvergence.evidenceDigest !== evidenceDigest) {
-          current.planConvergence = {
-            ...current.planConvergence,
-            evidenceDigest,
-            progress: 'new_evidence',
-            usedStrategies: [],
-            activeStrategy: 'diagnose',
-            nextStrategy: 'diagnose',
-            updatedAt: now(),
-            history: [...(current.planConvergence.history ?? []), {
-              at: now(),
-              strategy: 'convergence_probe',
-              progress: 'new_evidence',
-              evidenceChanged: true,
-              nextStrategy: 'diagnose',
-            }].slice(-50),
-          }
+          && reviewCandidate !== undefined
+          ? reconcileReviewConvergence({
+              previous: current.planConvergence,
+              candidate: {
+                cycleId: current.planConvergence.cycleId,
+                planDigest: reviewCandidate.planDigest,
+                planStructureDigest: planStructureDigest(reviewCandidate.plan),
+              },
+              review: { status: 'needs_revision', issues: [] },
+              evidenceDigest,
+              time: now(),
+              runtimeEvidence: await runtime.planReviewEvidence(current, reviewCandidate.plan, reviewCandidate.planDigest, signal),
+            })
+          : undefined
+        if (probed?.progress === 'new_evidence' && probed.nextStrategy !== 'autonomous_incident') {
+          current.planConvergence = probed
           current.autonomousIncident = undefined
           if (current.pendingPlanRevision !== undefined || current.intentPlanRevisionCycle !== undefined) {
             current.intentPlanRevisionCycle ??= {
@@ -7623,13 +7638,13 @@
             current.intentPlanRevisionCycle.phase = current.pendingPlanRevision === undefined
               ? 'rebuild_pending'
               : 'strategy_pending'
-            current.intentPlanRevisionCycle.strategy = 'diagnose'
+            current.intentPlanRevisionCycle.strategy = probed.nextStrategy
             current.intentPlanRevisionCycle.updatedAt = now()
           } else {
             current.planningAgent = {
               ...(current.planningAgent ?? {}),
               phase: 'revision_retry_pending',
-              convergenceStrategy: 'diagnose',
+              convergenceStrategy: probed.nextStrategy,
               updatedAt: now(),
             }
           }
@@ -7674,6 +7689,14 @@
           resumedTasks.push(task.taskId)
         }
         if (!resumedPlan && resumedTasks.length === 0) {
+          // Older ledgers have no fact history. Persist their conservative
+          // baseline even when the probe does not resume work, otherwise
+          // every later probe would keep seeding and never observe progress.
+          if (probed !== undefined && (current.planConvergence.seenEvidence === undefined
+            || current.planConvergence.seenEvidenceFacts === undefined)) {
+            current.planConvergence = probed
+            await saveState(runtime, current)
+          }
           return {
             contract: 'DSH_AUTONOMOUS_CONVERGENCE_PROBE_V1',
             workflowId,
--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -6809,3 +6809,113 @@
     await rm(root, { recursive: true, force: true })
   }
 })
+
+for (const alternating of [false, true]) test(`R06 真实 Review 会诊${alternating ? '交替' : '固定'}描述在相同事实下耗尽策略`, async () => {
+  const { root, statePath, runtime, state, agent } = await closureReceiptFixture()
+  try {
+    const issue = { ...reviewClosureContract('r06-missing-result', 'task_verification_result'),
+      closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+      severity: 'high', title: '缺少真实验证结果', detail: '必须执行验证', suggestion: '取得当前结果' }
+    runtime.runChild = async () => ({ contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: '等待结果', issues: [issue] })
+    const strategies = []
+    for (let round = 0; round < 12; round += 1) {
+      const saved = JSON.parse(await readFile(statePath, 'utf8'))
+      saved.planningAgent = { ...saved.planningAgent, sessionId: `session-${round}`, ownerConsultations: [{ ownerId: state.plan.owners[0].id,
+        facts: [alternating && round % 2 ? '仍须检查固定命令的实际结果' : '固定命令尚缺实际运行证据'], constraints: [] }] }
+      saved.workflowHead = `unrelated-head-${round}`
+      await writeFile(statePath, JSON.stringify(saved))
+      const result = await runtime.reviewPlan(agent, state.id)
+      strategies.push(result.convergence.nextStrategy)
+      assert.equal(result.convergence.progress, 'none')
+      assert.equal(result.convergence.obligations[0].status, 'open')
+    }
+    assert.ok(strategies.includes('autonomous_incident'), JSON.stringify(strategies))
+    assert.equal(strategies.at(-1), 'autonomous_incident')
+  } finally {
+    await runtime.dispose()
+    await rm(root, { recursive: true, force: true })
+  }
+})
+
+test('R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期', async () => {
+  const { root, statePath, runtime, state, agent } = await closureReceiptFixture()
+  try {
+    const issue = { ...reviewClosureContract('r06-binding', 'plan_verification_binding'),
+      closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'restored' },
+      severity: 'high', title: '补齐验证入口', detail: '缺少 restored 绑定', suggestion: '补齐固定命令' }
+    runtime.runChild = async () => ({ contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: '等待绑定', issues: [issue] })
+    await runtime.reviewPlan(agent, state.id)
+    const saved = JSON.parse(await readFile(statePath, 'utf8'))
+    saved.plan.verifications.push({ id: 'restored', run: ['node', '--test', 'restored.test.mjs'], cwd: '.' })
+    saved.plan.tasks[0].verify.push('restored')
+    saved.planDigest = createHash('sha256').update(JSON.stringify(saved.plan)).digest('hex')
+    await writeFile(statePath, JSON.stringify(saved))
+    const restored = await runtime.reviewPlan(agent, state.id)
+    assert.equal(restored.convergence.progress, 'new_evidence')
+    assert.equal(restored.convergence.obligations[0].status, 'open', '事实进展不代替显式关闭')
+    assert.equal((await runtime.reviewPlan(agent, state.id)).convergence.progress, 'none')
+    const renamed = JSON.parse(await readFile(statePath, 'utf8'))
+    renamed.plan.summary = '仅候选描述更新'
+    renamed.planDigest = createHash('sha256').update(JSON.stringify(renamed.plan)).digest('hex')
+    await writeFile(statePath, JSON.stringify(renamed))
+    assert.equal((await runtime.reviewPlan(agent, state.id)).convergence.progress, 'none')
+  } finally {
+    await runtime.dispose()
+    await rm(root, { recursive: true, force: true })
+  }
+})
+
+test('R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实', async () => {
+  const { root, statePath, runtime, state } = await closureReceiptFixture()
+  try {
+    state.ownerRuns = { [`T1:${state.plan.owners[0].id}`]: { taskId: 'T1', ownerId: state.plan.owners[0].id, worktree: state.workflowWorktree } }
+    state.planningRuntimeFacts = { worktrees: [{ files: [{ path: 'fake', sha256: 'f'.repeat(64), candidateTaskIds: ['T1'] }] }] }
+    await writeFile(statePath, JSON.stringify(state))
+    assert.deepEqual((await runtime.planReviewEvidence(state, state.plan, state.planDigest)).verifiedFiles, [])
+    await writeFile(join(state.workflowWorktree, 'README.md'), 'actual host content\n')
+    const evidence = await runtime.planReviewEvidence(state, state.plan, state.planDigest)
+    assert.deepEqual(evidence.verifiedFiles, [{ taskId: 'T1', path: 'README.md', kind: 'file', sha256: createHash('sha256').update('actual host content\n').digest('hex') }])
+    const changed = structuredClone(state)
+    changed.plan.summary = '新候选'
+    changed.planDigest = createHash('sha256').update(JSON.stringify(changed.plan)).digest('hex')
+    await writeFile(statePath, JSON.stringify(changed))
+    assert.deepEqual((await runtime.planReviewEvidence(state, state.plan, state.planDigest)).verifiedFiles, [])
+  } finally {
+    await runtime.dispose()
+    await rm(root, { recursive: true, force: true })
+  }
+})
+
+test('R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次', async () => {
+  const { root, statePath, runtime, state, agent } = await closureReceiptFixture()
+  try {
+    const issue = { ...reviewClosureContract('r06-probe', 'task_verification_result'),
+      closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+      severity: 'high', title: '缺少验证结果', detail: '缺少真实证据', suggestion: '运行验证' }
+    runtime.runChild = async () => ({ contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_revision', summary: '等待结果', issues: [issue] })
+    for (let i = 0; i < 8; i += 1) await runtime.reviewPlan(agent, state.id)
+    const exhausted = JSON.parse(await readFile(statePath, 'utf8'))
+    assert.equal(exhausted.planConvergence.nextStrategy, 'autonomous_incident')
+    exhausted.planConvergence.evidenceDigest = 'old-diagnostic-digest'
+    delete exhausted.planConvergence.seenEvidence
+    delete exhausted.planConvergence.seenEvidenceFacts
+    await writeFile(statePath, JSON.stringify(exhausted))
+    assert.equal((await runtime.probeAutonomousConvergence(agent, state.id)).resumed, false)
+    const unchanged = JSON.parse(await readFile(statePath, 'utf8'))
+    assert.deepEqual(unchanged.planConvergence.usedStrategies, exhausted.planConvergence.usedStrategies)
+    assert.ok(unchanged.planConvergence.seenEvidence, '旧账本首次探针必须保存基线，后续才能识别进展')
+    assert.ok(unchanged.planConvergence.seenEvidenceFacts)
+    unchanged.ownerRuns = { [`T1:${state.plan.owners[0].id}`]: { taskId: 'T1', ownerId: state.plan.owners[0].id, worktree: state.workflowWorktree } }
+    await writeFile(statePath, JSON.stringify(unchanged))
+    await writeFile(join(state.workflowWorktree, 'README.md'), 'relevant new host content\n')
+    assert.equal((await runtime.probeAutonomousConvergence(agent, state.id)).resumedPlan, true)
+    const renewed = JSON.parse(await readFile(statePath, 'utf8'))
+    assert.deepEqual(renewed.planConvergence.usedStrategies, exhausted.planConvergence.usedStrategies)
+    assert.equal(renewed.planConvergence.nextStrategy, 'local_subgraph_rewrite')
+    await runtime.reviewPlan(agent, state.id)
+    assert.equal((await runtime.probeAutonomousConvergence(agent, state.id)).resumed, false)
+  } finally {
+    await runtime.dispose()
+    await rm(root, { recursive: true, force: true })
+  }
+})
--- before/owner-workflow-plugin/test/convergence.test.mjs
+++ candidate/owner-workflow-plugin/test/convergence.test.mjs
@@ -161,14 +161,163 @@
   const second = reconcileReviewConvergence({
     previous: first,
     candidate: candidate({ strategy: 'diagnose', planDigest: 'b'.repeat(64) }),
-    review: review('needs_discovery', '依赖来源需要核验'),
+    review: {
+      status: 'needs_discovery',
+      summary: '依赖来源需要核验',
+      issues: [{
+        obligationId: 'ac16-registry-binding',
+        sourceId: 'AC-16',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'registry' },
+        severity: 'high',
+        title: '依赖来源需要核验',
+        detail: 'T1 需要 registry 固定验证绑定。',
+        suggestion: '补齐 registry 绑定。',
+      }],
+    },
     evidenceDigest: 'evidence-b',
     time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: {
+      planDigest: 'b'.repeat(64),
+      planBindings: [{ taskId: 'T1', verificationId: 'registry' }],
+    },
   })
   assert.equal(second.progress, 'new_evidence')
   assert.equal(second.unsupportedNewObligations.length, 0)
-  assert.equal(second.usedStrategies.length, 0)
+  assert.deepEqual(second.usedStrategies, ['diagnose'])
   assert.equal(second.obligations.filter(item => item.status === 'open').length, 2)
+})
+
+test('交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略', () => {
+  let state = reconcileReviewConvergence({
+    candidate: candidate(),
+    review: review('needs_revision', '会诊 A：固定事实未变'),
+    evidenceDigest: 'diagnostic-initial',
+    time: '2026-01-01T00:00:00.000Z',
+    runtimeEvidence: { planDigest: 'a'.repeat(64), sessionId: 'session-initial', workflowHead: 'head-initial' },
+  })
+  for (let round = 0; round < 30; round += 1) {
+    const planDigest = round % 2 === 0 ? 'b'.repeat(64) : 'a'.repeat(64)
+    state = reconcileReviewConvergence({
+      previous: state,
+      candidate: candidate({
+        planDigest,
+        strategy: state.nextStrategy === 'autonomous_incident' ? undefined : state.nextStrategy,
+        consultationSessionId: `session-${round}`,
+        workflowHead: `unrelated-head-${round}`,
+      }),
+      review: review('needs_revision', round % 2 === 0 ? '会诊 A：同一结论' : '会诊 B：同义改写'),
+      evidenceDigest: `diagnostic-${round}-${Date.UTC(2026, 0, 1, 0, 0, round)}`,
+      time: `2026-01-01T00:00:${String(round).padStart(2, '0')}.000Z`,
+      runtimeEvidence: { planDigest, sessionId: `session-${round}`, workflowHead: `unrelated-head-${round}` },
+    })
+    assert.equal(state.progress, 'none')
+    assert.deepEqual(state.seenEvidenceFacts, [])
+  }
+  assert.deepEqual([...state.usedStrategies].sort(), [
+    'alternate_implementation', 'arbitrate', 'diagnose', 'local_subgraph_rewrite', 'owner_council',
+  ])
+  assert.equal(state.nextStrategy, 'autonomous_incident')
+})
+
+test('当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期', () => {
+  const initial = reconcileReviewConvergence({
+    candidate: candidate(),
+    review: review('needs_revision', '需要恢复 unit 固定绑定'),
+    evidenceDigest: 'diagnostic-a',
+    time: '2026-01-01T00:00:00.000Z',
+  })
+  const restoredCandidate = candidate({ planDigest: 'b'.repeat(64), strategy: initial.nextStrategy })
+  const restoredEvidence = {
+    planDigest: restoredCandidate.planDigest,
+    planBindings: [{ taskId: 'T1', verificationId: 'unit' }],
+  }
+  const restored = reconcileReviewConvergence({
+    previous: initial,
+    candidate: restoredCandidate,
+    review: review('needs_revision', 'Runtime 已恢复当前绑定，但 Reviewer 未请求关闭'),
+    evidenceDigest: 'diagnostic-b',
+    time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: restoredEvidence,
+  })
+  assert.equal(restored.progress, 'new_evidence')
+  assert.equal(restored.obligations[0].status, 'open')
+  assert.deepEqual(restored.usedStrategies, ['local_subgraph_rewrite'])
+  assert.equal(restored.seenEvidence[restored.obligations[0].id].length, 1)
+  assert.equal(restored.seenEvidenceFacts.length, 1)
+
+  const replayed = reconcileReviewConvergence({
+    previous: restored,
+    candidate: candidate({ planDigest: restoredCandidate.planDigest, strategy: restored.nextStrategy, consultationSessionId: 'new-session' }),
+    review: review('needs_revision', '另一位 Reviewer 重述恢复绑定'),
+    evidenceDigest: 'diagnostic-c',
+    time: '2026-01-01T00:02:00.000Z',
+    runtimeEvidence: { ...restoredEvidence, sessionId: 'new-session', workflowHead: 'unrelated-head' },
+  })
+  assert.equal(replayed.progress, 'none')
+  assert.equal(replayed.obligations[0].status, 'open')
+  assert.equal(replayed.seenEvidenceFacts.length, 1)
+  assert.deepEqual(replayed.usedStrategies, ['local_subgraph_rewrite', 'diagnose'])
+})
+
+test('已解决义务的新文件和反复更换 obligationId 都不能回收策略租约', () => {
+  const resolvedIssue = {
+    obligationId: 'resolved-unit', sourceId: 'AC-15', sourceVersion: 'R4', targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high', title: '已解决的 unit 绑定', detail: 'T1 绑定 unit。', suggestion: '无。',
+  }
+  const stillOpen = {
+    obligationId: 'still-open-t2', sourceId: 'AC-15', sourceVersion: 'R4', targetTaskIds: ['T2'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T2', verificationId: 'unit' },
+    severity: 'high', title: 'T2 仍未解决', detail: 'T2 绑定 unit。', suggestion: '无。',
+  }
+  const initial = reconcileReviewConvergence({
+    candidate: candidate(),
+    review: { status: 'needs_revision', summary: '两项义务', issues: [resolvedIssue, stillOpen] },
+    evidenceDigest: 'diagnostic-a', time: '2026-01-01T00:00:00.000Z',
+  })
+  const afterClosure = reconcileReviewConvergence({
+    previous: initial,
+    candidate: candidate({ strategy: initial.nextStrategy }),
+    review: {
+      status: 'needs_revision', summary: '只关闭 T1', issues: [resolvedIssue, stillOpen],
+      obligationClosures: [{ obligationId: 'resolved-unit', kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit', planDigest: 'a'.repeat(64) }],
+    },
+    evidenceDigest: 'diagnostic-b', time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
+  })
+  const resolvedOnlyFile = { taskId: 'T1', path: 'src/already-resolved.js', kind: 'file', sha256: 'c'.repeat(64) }
+  let state = reconcileReviewConvergence({
+    previous: afterClosure,
+    candidate: candidate({ strategy: afterClosure.nextStrategy }),
+    review: { status: 'needs_revision', summary: 'T2 仍然阻塞', issues: [stillOpen] },
+    evidenceDigest: 'diagnostic-c', time: '2026-01-01T00:02:00.000Z',
+    runtimeEvidence: { planDigest: 'a'.repeat(64), verifiedFiles: [resolvedOnlyFile] },
+  })
+  assert.equal(state.progress, 'none')
+  assert.equal(state.seenEvidenceFacts.some(item => item.path === resolvedOnlyFile.path), true)
+  for (let round = 0; round < 5; round += 1) {
+    const recycled = {
+      ...stillOpen,
+      obligationId: `recycled-${round}`,
+      sourceId: `reviewer-${round}`,
+      sourceVersion: `R4-${round}`,
+      title: `换 ID 的同一文件事实 ${round}`,
+    }
+    state = reconcileReviewConvergence({
+      previous: state,
+      candidate: candidate({ strategy: state.nextStrategy === 'autonomous_incident' ? undefined : state.nextStrategy }),
+      review: { status: 'needs_revision', summary: recycled.title, issues: [recycled] },
+      evidenceDigest: `diagnostic-recycled-${round}`,
+      time: `2026-01-01T00:03:0${round}.000Z`,
+      runtimeEvidence: { planDigest: 'a'.repeat(64), verifiedFiles: [resolvedOnlyFile] },
+    })
+    assert.equal(state.progress, 'none')
+    assert.equal(state.unsupportedNewObligations.length, 1)
+  }
+  assert.equal(state.localStrategyRenewals.length, 1)
+  assert.equal(state.localStrategyRenewals[0].status, 'consumed')
 })

 test('只有真正的外部授权问题才请求用户', () => {
@@ -202,29 +351,58 @@
   }), 'diagnose')
 })

-test('Workflow 证据摘要只随可核验任务或 Runtime facts 变化', () => {
+test('Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希', () => {
   const base = {
     workflowHead: 'a',
-    tasks: [{ taskId: 'T1', status: 'running', verificationResults: {} }],
-  }
-  const first = workflowEvidenceDigest(base, { generatedAt: '2026-01-01T00:00:00.000Z', files: [] })
-  const textOnly = workflowEvidenceDigest(
-    { ...base, error: '换一种总结' },
-    { generatedAt: '2026-01-01T00:10:00.000Z', files: [] },
+    activePlanRevision: 1,
+    tasks: [{
+      taskId: 'T1',
+      status: 'running',
+      cursor: 'cursor-a',
+      fixedCommitSha: 'commit-a',
+      verificationResults: {
+        unit: {
+          passed: true,
+          exitCode: 0,
+          contentDigest: 'content-a',
+          sessionId: 'session-a',
+          startedAt: '2026-01-01T00:00:00.000Z',
+        },
+      },
+    }],
+  }
+  const facts = {
+    generatedAt: '2026-01-01T00:00:00.000Z',
+    worktrees: [{
+      worktree: '/temporary/session-a', ownerId: 'quality', runs: [{ status: 'running' }],
+      files: [{ candidateTaskIds: ['T1'], path: 'src/work.js', kind: 'file', sha256: 'a'.repeat(64) }],
+    }],
+  }
+  const first = workflowEvidenceDigest(base, facts)
+  const bookkeepingOnly = workflowEvidenceDigest(
+    {
+      ...base,
+      workflowHead: 'unrelated-head',
+      activePlanRevision: 2,
+      error: '换一种总结',
+      planningAgent: { ownerConsultations: [{ facts: ['会诊文字变化'], constraints: ['另一会话'] }] },
+      tasks: [{ ...base.tasks[0], status: 'completed', cursor: 'cursor-b', verificationResults: {
+        unit: { ...base.tasks[0].verificationResults.unit, sessionId: 'session-b', startedAt: '2026-01-01T00:10:00.000Z' },
+      } }],
+    },
+    { ...facts, generatedAt: '2026-01-01T00:10:00.000Z', worktrees: [{ ...facts.worktrees[0], worktree: '/temporary/session-b', runs: [{ status: 'completed' }] }] },
   )
-  const progressed = workflowEvidenceDigest({
+  assert.equal(first, bookkeepingOnly)
+  const contentChanged = workflowEvidenceDigest(base, {
+    ...facts,
+    worktrees: [{ ...facts.worktrees[0], files: [{ candidateTaskIds: ['T1'], path: 'src/work.js', kind: 'file', sha256: 'b'.repeat(64) }] }],
+  })
+  assert.notEqual(first, contentChanged)
+  const verificationChanged = workflowEvidenceDigest({
     ...base,
-    tasks: [{ taskId: 'T1', status: 'completed', cursor: 'b', verificationResults: {} }],
-  }, { files: [] })
-  assert.equal(first, textOnly)
-  assert.notEqual(first, progressed)
-  const ownerEvidence = workflowEvidenceDigest({
-    ...base,
-    planningAgent: {
-      ownerConsultations: [{ ownerId: 'quality', scopeFit: 'full', facts: ['发现真实测试入口'], constraints: [] }],
-    },
-  }, { files: [] })
-  assert.notEqual(first, ownerEvidence)
+    tasks: [{ ...base.tasks[0], verificationResults: { unit: { ...base.tasks[0].verificationResults.unit, contentDigest: 'content-b' } } }],
+  }, facts)
+  assert.notEqual(first, verificationChanged)
 })

 test('稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并', () => {
@@ -301,7 +479,7 @@
   }), /同一.*义务|obligationId.*合同/u)
 })

-test('严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved', () => {
+test('严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同', () => {
   const contract = {
     sourceId: 'AC-16',
     sourceVersion: 'R4',
@@ -354,9 +532,39 @@
   })
   assert.deepEqual(
     secondId.obligations.map(item => [item.id, item.status]),
-    [['ac16-requirement-one', 'resolved'], ['ac16-requirement-two', 'open']],
+    [['ac16-requirement-one', 'resolved']],
   )
+  assert.equal(secondId.unsupportedNewObligations[0].id, 'ac16-requirement-two')
   assert.notEqual(secondId.nextStrategy, 'awaiting_approval')
+})
+
+test('不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项', () => {
+  const base = {
+    sourceId: 'AC-16', sourceVersion: 'R4', targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high', detail: '各项义务分别关闭。', suggestion: '保留独立 ID。',
+  }
+  const firstIssue = { ...base, obligationId: 'ac16-independent-one', title: '要求一' }
+  const secondIssue = { ...base, obligationId: 'ac16-independent-two', title: '要求二' }
+  const initial = reconcileReviewConvergence({
+    candidate: candidate(), review: { status: 'needs_revision', summary: '两项独立要求', issues: [firstIssue, secondIssue] },
+    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
+  })
+  const afterOneClosure = reconcileReviewConvergence({
+    previous: initial, candidate: candidate(),
+    review: {
+      status: 'needs_revision', summary: '只关闭第一项', issues: [firstIssue, secondIssue],
+      obligationClosures: [{
+        obligationId: firstIssue.obligationId, kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit', planDigest: 'a'.repeat(64),
+      }],
+    },
+    evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
+  })
+  assert.deepEqual(afterOneClosure.obligations.map(item => [item.id, item.status]), [
+    ['ac16-independent-one', 'resolved'],
+    ['ac16-independent-two', 'open'],
+  ])
 })

 test('已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告', () => {

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T10:48:16.251427+00:00",
  "results": [
    {
      "suite": "convergence",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/convergence.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:48:16.345052+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T10:48:16.438866+00:00",
      "counts": {
        "tests": 22,
        "pass": 22,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "control",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/control.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:48:16.439599+00:00",
      "timeoutSeconds": 180,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T10:49:26.553664+00:00",
      "counts": {
        "tests": 124,
        "pass": 116,
        "fail": 1,
        "cancelled": 0,
        "skipped": 7,
        "todo": 0
      }
    },
    {
      "suite": "security",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/security.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:49:26.556070+00:00",
      "timeoutSeconds": 180,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T10:49:46.262699+00:00",
      "counts": {
        "tests": 38,
        "pass": 23,
        "fail": 1,
        "cancelled": 0,
        "skipped": 14,
        "todo": 0
      }
    },
    {
      "suite": "plan-revision",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/plan-revision.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:49:46.264528+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T10:49:46.423353+00:00",
      "counts": {
        "tests": 7,
        "pass": 7,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "workflow-state",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/workflow-state.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:49:46.425693+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T10:49:46.551388+00:00",
      "counts": {
        "tests": 11,
        "pass": 11,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "runner",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/runner.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T10:49:46.552626+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T10:49:47.114142+00:00",
      "counts": {
        "tests": 8,
        "pass": 8,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    }
  ],
  "drift": []
}
````

## 结束核对

````json
{
  "at": "2026-09-10T10:52:17.562158+00:00",
  "repos": {
    ".": {
      "head": {
        "exitCode": 0,
        "stdout": "154914064f5ceb2f8eb413865e10a54e8ffbc663\n",
        "stderr": ""
      },
      "headUnchanged": true,
      "branch": {
        "exitCode": 0,
        "stdout": "main\n",
        "stderr": ""
      },
      "status": {
        "exitCode": 0,
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
        "stderr": ""
      },
      "refs": {
        "exitCode": 0,
        "stdout": "refs/heads/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/heads/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/HEAD 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/remotes/origin/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\n",
        "stderr": ""
      },
      "diffCheck": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    },
    "deepseek-harness": {
      "head": {
        "exitCode": 0,
        "stdout": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\n",
        "stderr": ""
      },
      "headUnchanged": true,
      "branch": {
        "exitCode": 0,
        "stdout": "master\n",
        "stderr": ""
      },
      "status": {
        "exitCode": 0,
        "stdout": " M packages/host/apiproxy/src/fetch/client.ts\n M packages/host/apiproxy/tests/client-handler.spec.ts\n",
        "stderr": ""
      },
      "refs": {
        "exitCode": 0,
        "stdout": "refs/heads/master b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\nrefs/remotes/origin/HEAD dd6322d604e00eec1ba5e0c8541159906a21094a\nrefs/remotes/origin/master dd6322d604e00eec1ba5e0c8541159906a21094a\n",
        "stderr": ""
      },
      "diffCheck": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    },
    "dsh-synapse": {
      "head": {
        "exitCode": 0,
        "stdout": "97f8c432de875d97bf7a5e4d675f8010f7b34556\n",
        "stderr": ""
      },
      "headUnchanged": true,
      "branch": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      },
      "status": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      },
      "refs": {
        "exitCode": 0,
        "stdout": "refs/heads/main a323f76b0c47ffad59194d8ac7efacb3aa6bdfba\nrefs/remotes/origin/HEAD 56935dc1862e7791b212f6eb2dd26404def5a575\nrefs/remotes/origin/main 56935dc1862e7791b212f6eb2dd26404def5a575\n",
        "stderr": ""
      },
      "diffCheck": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    },
    "owner-workflow-plugin/vendor/dsh-approve-for-me": {
      "head": {
        "exitCode": 0,
        "stdout": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\n",
        "stderr": ""
      },
      "headUnchanged": true,
      "branch": {
        "exitCode": 0,
        "stdout": "main\n",
        "stderr": ""
      },
      "status": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      },
      "refs": {
        "exitCode": 0,
        "stdout": "refs/heads/main a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\nrefs/remotes/origin/HEAD 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/compat/dsh-0.1.1-rc.1 f3a45b67e99a0e83ef0816c96b4e6c5e8289887e\nrefs/remotes/origin/compat/dsh-0.1.1-rc.2 93e6f35ca68d54bb5a1b746fb02b55f29d003b03\nrefs/remotes/origin/compat/rc7 1a88a630b20eb57ccf7e0e4a78d5f7532f7ff5cc\nrefs/remotes/origin/main 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/maintenance/beta2-quality f1b08abdfccb35d475b62d090fc536e6b11aa14f\n",
        "stderr": ""
      },
      "diffCheck": {
        "exitCode": 0,
        "stdout": "",
        "stderr": ""
      }
    }
  },
  "candidateDrift": [],
  "baselinePathsNowMissing": [],
  "mainTrackingComparison": {
    "exitCode": 0,
    "stdout": "0\t0\n",
    "stderr": ""
  },
  "networkFetchPerformed": false,
  "gitWritesPerformed": false
}
````

## 本轮输入合同指纹

````json
{
  "docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md": "156b87d3937f56e826538c2503dfc5ead4678c6ed65c40eef0fa728e8704717d",
  "docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md": "9e140359f63c1942d887f1988a1ec888a919677d5a298856f7fcb1a81774d100",
  "/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/SKILL.md": "c940890eb77a54c71725d2f2b5a9080ffa1bdd4fd3b4f5e32e415710af8719aa",
  "/Users/admin/.codex/plugins/cache/ghost-agent-market/ghost-agent-skills/0.3.5+codex.20260908032011/skills/ghost-matt-implement/references/testing.md": "d752f64fa58e756d33a533ad53973074725f83c14d9d0c37de66daef125268a4"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-06-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-03 / AC-15: obligation-scoped verified progress','hashes':hashes()}
(e/'candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
b=json.loads((e/'baseline.json').read_text()); diffs=[]
for f in b['files']:
 before=(e/'before'/f).read_text();after=(r/f).read_text()
 diffs.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+f,tofile='candidate/'+f))
(e/'round.diff').write_text(''.join(diffs))
results=[]
for suite in ['convergence','control','security','plan-revision','workflow-state','runner']:
 cmd=[node,'--test','--test-force-exit',f'owner-workflow-plugin/test/{suite}.test.mjs']
 row={'suite':suite,'command':cmd,'cwd':str(r),'start':timestamp(),'timeoutSeconds':180 if suite in ['control','security','runner'] else 60}
 p=subprocess.Popen(cmd,cwd=r,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
 try:
  output,_=p.communicate(timeout=row['timeoutSeconds']);row.update(exitCode=p.returncode,timedOut=False)
 except subprocess.TimeoutExpired:
  os.killpg(p.pid,signal.SIGKILL);output,_=p.communicate();row.update(exitCode=p.returncode,timedOut=True)
 row['end']=timestamp();(e/f'formal-{suite}.log').write_text(output)
 counts={}
 for line in output.splitlines():
  for key in ['tests','pass','fail','cancelled','skipped','todo']:
   # Node's default pretty reporter uses a leading information symbol, TAP uses #.
   parts=line.split()
   if len(parts)==3 and parts[1]==key and parts[2].isdigit():counts[key]=int(parts[2])
 row['counts']=counts;results.append(row)
 print(json.dumps(row,ensure_ascii=False),flush=True)
 (e/'test-results.json').write_text(json.dumps({'candidate':c['at'],'results':results},ensure_ascii=False,indent=2))
drift=[f for f,h in c['hashes'].items() if hashes().get(f)!=h]
(e/'test-results.json').write_text(json.dumps({'candidate':c['at'],'results':results,'drift':drift},ensure_ascii=False,indent=2));print('drift='+str(drift),flush=True)

````

## dev-control-r06-01.log

````text
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (1958.835916ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (1860.360959ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (861.434959ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (419.127084ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (1714.539041ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6941.526041

````

## dev-convergence-r06-01.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.66825ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (5.940375ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.374667ms)
✔ 只有真正的外部授权问题才请求用户 (0.181041ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.905666ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.268334ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.461334ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.277208ms)
✖ 严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved (1.108708ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.260917ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.308416ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.193333ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.108459ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.392875ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.278166ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.193875ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.695916ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.046584ms)
ℹ tests 18
ℹ suites 0
ℹ pass 17
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 67.285583

✖ failing tests:

test at owner-workflow-plugin/test/convergence.test.mjs:351:1
✖ 严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved (1.108708ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      [
        'ac16-requirement-one',
        'resolved'
      ],
  -   [
  -     'ac16-requirement-two',
  -     'open'
  -   ]
    ]
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/convergence.test.mjs:402:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ [ 'ac16-requirement-one', 'resolved' ] ],
    expected: [ [ 'ac16-requirement-one', 'resolved' ], [ 'ac16-requirement-two', 'open' ] ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

````

## dev-convergence-r06-02.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.848667ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (7.0775ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.650625ms)
✖ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (3.282666ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.310666ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.581542ms)
✔ 只有真正的外部授权问题才请求用户 (0.051625ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.879ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.2505ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.159166ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.257ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.302625ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.459375ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.148291ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.330125ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.189334ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.070042ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.08675ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.174083ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.149584ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.413875ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.039375ms)
ℹ tests 22
ℹ suites 0
ℹ pass 21
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 68.173459

✖ failing tests:

test at owner-workflow-plugin/test/convergence.test.mjs:192:1
✖ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (3.282666ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  -   'local_subgraph_rewrite',
      'diagnose',
      'owner_council',
  +   'local_subgraph_rewrite',
      'arbitrate',
      'alternate_implementation'
    ]
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/convergence.test.mjs:218:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ 'diagnose', 'owner_council', 'local_subgraph_rewrite', 'arbitrate', 'alternate_implementation' ],
    expected: [ 'local_subgraph_rewrite', 'diagnose', 'owner_council', 'arbitrate', 'alternate_implementation' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

````

## dev-convergence-r06-03.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.817833ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (6.427375ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.455084ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (1.998ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.320333ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.673583ms)
✔ 只有真正的外部授权问题才请求用户 (0.062ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.49825ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.383458ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.232166ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.335167ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.298084ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.422333ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.130625ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.249542ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.168542ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.057792ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.070958ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.172042ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.135792ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.328458ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.027666ms)
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 86.050417

````

## dev-convergence-r06-04-syntax.log

````text

````

## dev-host-files-01.log

````text
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (1019.808167ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1292.929041

````

## dev-legacy-probe-01.log

````text
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (1917.725917ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2068.025167

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (176.037458ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (668.719541ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (396.546ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (443.162083ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (465.624916ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (387.539583ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (208.069709ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (293.174ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (212.36175ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (406.921084ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (386.3215ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (382.932458ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.383083ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (444.707083ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (390.95075ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.635917ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (531.055334ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (535.483041ms)
✖ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (202.193542ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (557.149334ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (390.694375ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (397.286334ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (376.044375ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (476.647416ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (410.423209ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (458.5225ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (281.120667ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (247.9565ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.610166ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1328.732584ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (304.313458ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (335.341625ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (322.446916ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (353.138041ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (202.426166ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (285.10125ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (301.671709ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (279.15325ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (279.958334ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (281.990708ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (234.5565ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (282.859959ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (677.162916ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (564.770667ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (220.415125ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (371.650209ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (147.020125ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (151.838208ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (191.890209ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (0.779625ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.056292ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.039292ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (417.331583ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (449.051ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (495.061125ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (149.544084ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (472.18225ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (557.847792ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (1060.896541ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (459.88625ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (679.740333ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.092125ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.02075ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.012917ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.012417ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.01225ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.012209ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (302.581542ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (754.414167ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (477.005958ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (474.090542ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (503.213292ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.444708ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (1.036041ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.314166ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (506.941125ms)
✔ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (550.353791ms)
✔ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (669.172917ms)
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (541.541375ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1868.458375ms)
✔ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (488.7005ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (405.694417ms)
✔ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (395.36975ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1191.646667ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (743.424208ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (538.151791ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (371.084417ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1642.497375ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (20.799ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (21.704667ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.06675ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (5140.760208ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1849.944875ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (959.592875ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1334.201625ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (511.365042ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (656.468666ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (535.046208ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (560.475833ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (422.831958ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (766.6505ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (1029.198958ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (322.783875ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (169.669708ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (136.623208ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (135.711625ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (328.432ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (138.098334ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (133.025375ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (148.319ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (499.715ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.492334ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (826.473375ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (884.241083ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (944.608042ms)
✔ R05 用户确认期间义务版本变化时不记录过期决定 (594.490167ms)
✔ R05 结构展开依据经 Runtime 消费，只关闭结构义务而保留业务验证 (826.462833ms)
✔ R05 pending 候选决定不能借用 active 回执，旧快照不能消费已变化候选 (972.220292ms)
✔ R05 同候选的新决定替代旧回执，取消替代不影响旧决定 (1254.217ms)
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (2639.452875ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (3681.69925ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (2494.355458ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (887.242041ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (3695.569292ms)
ℹ tests 124
ℹ suites 0
ℹ pass 116
ℹ fail 1
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 70081.026667

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:1180:1
✖ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (202.193542ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:1213:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.678917ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (6.419709ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.448292ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.167292ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.357417ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.631583ms)
✔ 只有真正的外部授权问题才请求用户 (0.057458ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.053333ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.290541ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.1715ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.27125ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.257541ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.353583ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.101292ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.213916ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.16325ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.058917ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.071459ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.169042ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.140041ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.464167ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.043459ms)
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.317166

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (1.761125ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (1.629041ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.092583ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (4.198292ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.612375ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (1.851167ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (1.22725ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 107.848834

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (2.959625ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.636208ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (37.642917ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (111.090875ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (81.630792ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (73.517458ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (53.796542ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (58.111208ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 514.82975

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (247.403542ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (681.253041ms)
✖ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (668.826875ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (1206.276792ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (822.156042ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (794.553625ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (837.548708ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (774.534708ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (641.142292ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (729.912291ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (604.366666ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (566.190792ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (751.933166ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (1482.561209ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.242917ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (381.609416ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (996.053583ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.177708ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.182625ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.101ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.077459ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (534.473416ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (558.265625ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (496.190375ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (2647.267083ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.133ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.020459ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.015125ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.014417ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.018583ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (485.681083ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (682.709292ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.17175ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.05575ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.048958ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.022666ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (1306.304833ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (585.754667ms)
ℹ tests 38
ℹ suites 0
ℹ pass 23
ℹ fail 1
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 19656.384959

✖ failing tests:

test at owner-workflow-plugin/test/security.test.mjs:343:1
✖ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (668.826875ms)
  TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined
      at dirname (node:path:1442:5)
      at ownerWorktreePlanningFacts (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:682:30)
      at convergenceRuntimeEvidence (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:2750:27)
      at async assertCurrentAndClosed (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/security.test.mjs:421:21)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/security.test.mjs:432:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    code: 'ERR_INVALID_ARG_TYPE'
  }

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (1.595541ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.3665ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.305125ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.119875ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.263667ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.457375ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.335375ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.23925ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.130375ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.169875ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (0.7785ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 83.859625

````

## 非原始stdout的观察记录 baseline-comparison.txt

````text
/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-05-0r3y30kx/formal-control.log
✔ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (186.871542ms)
/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-05-0r3y30kx/formal-security.log
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (1993.207875ms)
Prior R05 formal evidence was read; no additional baseline suite run in R06.

````

## 非原始stdout的观察记录 dev-commands.txt

````text
Root development checks; these are not frozen formal evidence.
Node: /Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node
Cwd: /Volumes/LargeStorage/code/DSH-Workflow
All use --test --test-force-exit owner-workflow-plugin/test/control.test.mjs with --test-name-pattern:
- dev-host-files-01.log: R06 文件进展 (outer timeout 60s), exit 0, 1 pass.
- dev-control-r06-01.log: R06 (outer timeout 90s), exit 0, 5 pass; draft convergence before final dedup changes.
- dev-legacy-probe-01.log: R06 Runner (outer timeout 60s), exit 0, 1 pass; legacy seeding addition.
Source runtime.mjs node --check and git diff --check exited 0 during development; no captured separate raw output.

````

## 非原始stdout的观察记录 review-final.txt

````text
Independent read-only reviewer (gpt-5.6-terra / xhigh), frozen round.diff review:
P1 implementation: runtime.mjs:2750 unconditionally discovers worktree files. F02 state without workflowWorktree throws at runtime.mjs:682, suppressing taskVerificationResults evidence. Formal security F02 fails.
P1 acceptance gate: control.test.mjs:1213 expects a digest-only contract-less legacy ledger to resume. T03 correctly returns false; stale assertion leaves formal control red.
187 pass, 2 fail, 21 skipped; no timeout or drift. Candidate file hashes matched candidate.json.
Root independently inspected raw logs, fixture and prior R05 success logs; agrees both failures and next-step remedies. Root classifies F08 P1 compatibility regression and F09 P2 test-contract maintenance (not a production behavior bug); both block declaring T03 complete.
Frozen round.diff SHA256: e101a59553f620d77d2d31f079ac96c4e3d40678cb6ce73d36dd75cadb6a9b2b

````
