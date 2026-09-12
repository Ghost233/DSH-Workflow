# 第 9 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-09-261mulm1`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T12:24:43.017839+00:00",
  "files": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "23f09fd7eff3eddf35c889affbc3c184ed2d766ae830124f5b826a6b804f93df",
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
    "owner-workflow-plugin/src/runtime.mjs": "3dfe5a1aa4baef8ac3a305914380d4be170c7a32936abdf84e6f9fbb099122ab",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "84adf7ae090e6f4fb8ba6250718e0eb16f5d14ce892665711c2abe77eb6954c1",
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
    "owner-workflow-plugin/test/model.test.mjs": "c3a0e130c65724120b9f11da965d24b68b1a557c18f79027ee090170b49e3da7",
    "owner-workflow-plugin/test/control.test.mjs": "89a09e18c6a462d449eb5cc6ca7836bfc1f8aa5ff82221b138b99044e96bc0b1",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "2f957a814eeac4f339e00e77a1716b759d57facd72c032368070e089e3b0734b",
    "owner-workflow-plugin/test/git.test.mjs": "368e9d09f65acc7b607fc47f17fd5410a89c06c7ce9b6642167d86239cfa2d39",
    "owner-workflow-plugin/test/security.test.mjs": "9083d9558a9e78162df324014a29d59c6ab5e8c65027eb2aab7ab04026401902",
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
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "refs/heads/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/heads/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/HEAD 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/remotes/origin/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\n"
    },
    "deepseek-harness": {
      "head": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\n",
      "branch": "master\n",
      "status": " M packages/host/apiproxy/src/fetch/client.ts\n M packages/host/apiproxy/tests/client-handler.spec.ts\n",
      "refs": "refs/heads/master b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\nrefs/remotes/origin/HEAD dd6322d604e00eec1ba5e0c8541159906a21094a\nrefs/remotes/origin/master dd6322d604e00eec1ba5e0c8541159906a21094a\n"
    },
    "dsh-synapse": {
      "head": "97f8c432de875d97bf7a5e4d675f8010f7b34556\n",
      "branch": "",
      "status": "",
      "refs": "refs/heads/main a323f76b0c47ffad59194d8ac7efacb3aa6bdfba\nrefs/remotes/origin/HEAD 56935dc1862e7791b212f6eb2dd26404def5a575\nrefs/remotes/origin/main 56935dc1862e7791b212f6eb2dd26404def5a575\n"
    },
    "owner-workflow-plugin/vendor/dsh-approve-for-me": {
      "head": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\n",
      "branch": "main\n",
      "status": "",
      "refs": "refs/heads/main a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\nrefs/remotes/origin/HEAD 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/compat/dsh-0.1.1-rc.1 f3a45b67e99a0e83ef0816c96b4e6c5e8289887e\nrefs/remotes/origin/compat/dsh-0.1.1-rc.2 93e6f35ca68d54bb5a1b746fb02b55f29d003b03\nrefs/remotes/origin/compat/rc7 1a88a630b20eb57ccf7e0e4a78d5f7532f7ff5cc\nrefs/remotes/origin/main 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/maintenance/beta2-quality f1b08abdfccb35d475b62d090fc536e6b11aa14f\n"
    }
  }
}
````

## 冻结候选

````json
{
  "at": "2026-09-10T12:42:43.400752+00:00",
  "scope": "T-04 / AC-14: F10/F11 question projection and execution feedback",
  "hashes": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "23f09fd7eff3eddf35c889affbc3c184ed2d766ae830124f5b826a6b804f93df",
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
    "owner-workflow-plugin/src/runtime.mjs": "82e2d086dfbfdcdcf55e3bf69d4ea6e5a6e38f09eb61864ef6852001443fe66d",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "490afb59d6c92ddcf4f08d5abdb3e097ad78da6ba28963f0012b9f4b6943e8a2",
    "owner-workflow-plugin/src/model.mjs": "84adf7ae090e6f4fb8ba6250718e0eb16f5d14ce892665711c2abe77eb6954c1",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/test/launcher.test.mjs": "b6550c3e19347bba3e9e71b7db8feb07d8cfbcc171852f653b6086ed0ddfe882",
    "owner-workflow-plugin/test/owner-boundary.test.mjs": "3e2c4b9d5146893d995f308b470942e3f4bf752d48b6cf02d172da822bb6e593",
    "owner-workflow-plugin/test/runner.test.mjs": "811dba5847bc7270e18cbb76d9e48938b381e6d4a6bed211ef1b32cb321ef7b7",
    "owner-workflow-plugin/test/plugin.test.mjs": "67ea6b22b1fafa67a5ea6fedbe54c1d00cfe859ea68f458c60618f1b9f0016f0",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/operation-approval.test.mjs": "c6f43055ca7400d3587bd5f89da1731c8d831d76dd8e7897b0c9503b0ae1c96b",
    "owner-workflow-plugin/test/workflow-state.test.mjs": "db7e3535929a7679f1afafc18b010adc9b29d40782e2f2ece917af4d47fd38d1",
    "owner-workflow-plugin/test/dashboard-host.test.mjs": "10a51bc733d40bfd2982eb23e8f01acbbbf031a427e0b3efcd44bf1f34664f71",
    "owner-workflow-plugin/test/model.test.mjs": "c3a0e130c65724120b9f11da965d24b68b1a557c18f79027ee090170b49e3da7",
    "owner-workflow-plugin/test/control.test.mjs": "8654a5ce5f759827b6fc535e60ef4695eba45e1a38ebae45fb1d8b962b82bc5a",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "2f957a814eeac4f339e00e77a1716b759d57facd72c032368070e089e3b0734b",
    "owner-workflow-plugin/test/git.test.mjs": "368e9d09f65acc7b607fc47f17fd5410a89c06c7ce9b6642167d86239cfa2d39",
    "owner-workflow-plugin/test/security.test.mjs": "9083d9558a9e78162df324014a29d59c6ab5e8c65027eb2aab7ab04026401902",
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
    "owner-workflow-plugin/index.js": "e4b0cfc9d439b9dfe2c9cd27182a0d1b0b1232bfc7fb533397649a53906fb60d",
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
--- before/owner-workflow-plugin/index.js
+++ candidate/owner-workflow-plugin/index.js
@@ -1423,6 +1423,66 @@
   }
 }

+function ownerExecutionFeedbackDefinition(runtime) {
+  return {
+    name: 'owner_execution_feedback',
+    description: '仅供当前 active Owner 报告一次结构化执行偏差。Runtime 从当前任务、Owner、会话、尝试和计划版本派生绑定；该工具只请求后续决定或技术恢复，绝不授予外部权限。',
+    parameters: {
+      type: 'object',
+      additionalProperties: false,
+      properties: {
+        feedback: {
+          type: 'object',
+          additionalProperties: false,
+          properties: {
+            expected: { type: 'string', minLength: 1, description: '当前任务按已批准计划预期发生的事实。' },
+            actual: { type: 'string', minLength: 1, description: '实际观察到的偏差。' },
+            evidence: {
+              type: 'array', minItems: 1, maxItems: 16,
+              items: {
+                type: 'object', additionalProperties: false,
+                properties: {
+                  kind: { type: 'string', enum: ['command_result', 'service_response', 'repository_fact'] },
+                  detail: { type: 'string', minLength: 1 },
+                },
+                required: ['kind', 'detail'],
+              },
+            },
+            technical_facts: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', minLength: 1 }, description: '可复核的技术事实，不得以关键词代替事实。' },
+            business_commitment_delta: {
+              type: 'object', additionalProperties: false,
+              properties: {
+                current_commitment: { type: 'string', minLength: 1 },
+                proposed_commitment: { type: 'string', minLength: 1 },
+                consequence: { type: 'string', minLength: 1 },
+              },
+              required: ['current_commitment', 'proposed_commitment', 'consequence'],
+            },
+            external_permission_gap: {
+              type: 'object', additionalProperties: false,
+              properties: {
+                required_permission: { type: 'string', minLength: 1 },
+                target: { type: 'string', minLength: 1 },
+                blocked_action: { type: 'string', minLength: 1 },
+              },
+              required: ['required_permission', 'target', 'blocked_action'],
+            },
+          },
+          required: ['expected', 'actual', 'evidence', 'technical_facts'],
+        },
+      },
+      required: ['feedback'],
+    },
+    output: { schema: {}, render: renderValue },
+    async execute(args, exec) {
+      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
+        throw new Error('owner_execution_feedback 参数必须是对象')
+      }
+      return normalizeToolOutput(await runtime.recordOwnerExecutionDeviation(args.feedback, exec))
+    },
+  }
+}
+
 function ownerMemoryNoteDefinition(runtime) {
   return {
     name: 'owner_memory_note',
@@ -1555,6 +1615,7 @@

   ctx.tools.register(toolDefinition(ctx, runtime))
   ctx.tools.register(ownerSubmitDefinition(runtime))
+  ctx.tools.register(ownerExecutionFeedbackDefinition(runtime))
   ctx.tools.register(ownerMemoryNoteDefinition(runtime))
   ctx.tools.register(ownerHostExecDefinition(runtime))
   ctx.tools.register(requestSubgraphDefinition(runtime))
--- before/owner-workflow-plugin/src/agent-policy.mjs
+++ candidate/owner-workflow-plugin/src/agent-policy.mjs
@@ -36,6 +36,7 @@
   'owner_verify',
   'owner_repair',
   'owner_submit',
+  'owner_execution_feedback',
   'owner_memory_note',
   'owner_host_exec',
   'request_subgraph',
@@ -49,6 +50,15 @@
   'subagent_acp',
   'subagent_codex',
   'subagent_claude_code',
+])
+
+const OWNER_ONLY_TOOLS = new Set([
+  'owner_submit',
+  'owner_execution_feedback',
+  'owner_memory_note',
+  'owner_host_exec',
+  'request_subgraph',
+  'request_handoff',
 ])

 const SEARCH_BREAKER_ROLES = new Set(['owner', 'planner', 'plan-reviewer', 'reviewer', 'operator'])
@@ -173,6 +183,9 @@
     }
     return undefined
   }
+  if (OWNER_ONLY_TOOLS.has(toolName)) {
+    return `${toolName} 只能由当前 active Owner 子代理调用`
+  }
   if (role !== undefined) {
     if (isOrchestrationTool(toolName) && !childOrchestrationToolAllowed(role, toolName)) {
       return `${role} 子代理不能控制主 Workflow 或创建其他 Operation`
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -266,6 +266,194 @@
   return error instanceof Error ? error.message : String(error)
 }

+const EXECUTION_DEVIATION_CONTRACT = 'DSH_OWNER_EXECUTION_DEVIATION_V1'
+
+function plainObject(value) {
+  return value !== null && typeof value === 'object' && !Array.isArray(value)
+}
+
+function requiredExecutionFeedbackText(value, field) {
+  if (typeof value !== 'string' || value.trim() === '') {
+    throw new Error(`owner_execution_feedback.feedback.${field} 必须是非空字符串`)
+  }
+  return value.trim()
+}
+
+function exactExecutionFeedbackObject(value, allowed, field) {
+  if (!plainObject(value) || Object.keys(value).some(key => !allowed.includes(key))) {
+    throw new Error(`owner_execution_feedback.feedback.${field} 包含不受支持的字段`)
+  }
+  return value
+}
+
+/**
+ * Owner may report what happened, but never supplies its workflow binding,
+ * source identity, authority, or an already-approved permission.  Runtime
+ * derives those from the active attempt below.
+ */
+function normalizeOwnerExecutionFeedback(raw) {
+  const feedback = exactExecutionFeedbackObject(raw, [
+    'expected',
+    'actual',
+    'evidence',
+    'technical_facts',
+    'business_commitment_delta',
+    'external_permission_gap',
+  ], '')
+  const expected = requiredExecutionFeedbackText(feedback.expected, 'expected')
+  const actual = requiredExecutionFeedbackText(feedback.actual, 'actual')
+  if (!Array.isArray(feedback.evidence) || feedback.evidence.length === 0 || feedback.evidence.length > 16) {
+    throw new Error('owner_execution_feedback.feedback.evidence 必须是 1-16 项证据数组')
+  }
+  const evidence = feedback.evidence.map((item, index) => {
+    const source = exactExecutionFeedbackObject(item, ['kind', 'detail'], `evidence[${index}]`)
+    const kind = requiredExecutionFeedbackText(source.kind, `evidence[${index}].kind`)
+    if (!['command_result', 'service_response', 'repository_fact'].includes(kind)) {
+      throw new Error(`owner_execution_feedback.feedback.evidence[${index}].kind 不受支持`)
+    }
+    return { kind, detail: requiredExecutionFeedbackText(source.detail, `evidence[${index}].detail`) }
+  })
+  if (!Array.isArray(feedback.technical_facts) || feedback.technical_facts.length === 0 || feedback.technical_facts.length > 16) {
+    throw new Error('owner_execution_feedback.feedback.technical_facts 必须是 1-16 项技术事实数组')
+  }
+  const technicalFacts = [...new Set(feedback.technical_facts.map((item, index) => (
+    requiredExecutionFeedbackText(item, `technical_facts[${index}]`)
+  )))]
+  let businessCommitmentDelta
+  if (feedback.business_commitment_delta !== undefined) {
+    const rawDelta = exactExecutionFeedbackObject(
+      feedback.business_commitment_delta,
+      ['current_commitment', 'proposed_commitment', 'consequence'],
+      'business_commitment_delta',
+    )
+    const currentCommitment = requiredExecutionFeedbackText(rawDelta.current_commitment, 'business_commitment_delta.current_commitment')
+    const proposedCommitment = requiredExecutionFeedbackText(rawDelta.proposed_commitment, 'business_commitment_delta.proposed_commitment')
+    if (currentCommitment === proposedCommitment) {
+      throw new Error('owner_execution_feedback.feedback.business_commitment_delta 必须提供实际不同的当前与提议承诺')
+    }
+    businessCommitmentDelta = {
+      currentCommitment,
+      proposedCommitment,
+      consequence: requiredExecutionFeedbackText(rawDelta.consequence, 'business_commitment_delta.consequence'),
+    }
+  }
+  let externalPermissionGap
+  if (feedback.external_permission_gap !== undefined) {
+    const rawGap = exactExecutionFeedbackObject(
+      feedback.external_permission_gap,
+      ['required_permission', 'target', 'blocked_action'],
+      'external_permission_gap',
+    )
+    externalPermissionGap = {
+      requiredPermission: requiredExecutionFeedbackText(rawGap.required_permission, 'external_permission_gap.required_permission'),
+      target: requiredExecutionFeedbackText(rawGap.target, 'external_permission_gap.target'),
+      blockedAction: requiredExecutionFeedbackText(rawGap.blocked_action, 'external_permission_gap.blocked_action'),
+    }
+  }
+  return {
+    expected,
+    actual,
+    evidence,
+    technicalFacts,
+    ...(businessCommitmentDelta === undefined ? {} : { businessCommitmentDelta }),
+    ...(externalPermissionGap === undefined ? {} : { externalPermissionGap }),
+  }
+}
+
+function ownerExecutionDeviationContext(state, taskId, ownerId) {
+  const task = state?.plan?.tasks?.find(item => item?.id === taskId)
+  const record = state?.ownerRuns?.[ownerRunKey(taskId, ownerId)]
+  const deviation = record?.executionDeviation
+  if (task?.ownerId !== ownerId || !plainObject(record) || !plainObject(deviation)) return undefined
+  const owner = state.plan.owners.find(item => item?.id === ownerId)
+  if (owner === undefined) return undefined
+  const authority = ownerRegistryAuthority(owner)
+  const sourceId = `owner-execution/${state.id}/${taskId}/${record.attempt}`
+  if (deviation.contract !== EXECUTION_DEVIATION_CONTRACT
+    || deviation.status !== 'admitted'
+    || deviation.workflowId !== state.id
+    || deviation.planDigest !== state.planDigest
+    || deviation.taskId !== taskId
+    || deviation.ownerId !== ownerId
+    || record.ownerId !== ownerId
+    || record.stageId !== taskId
+    || deviation.attempt !== record.attempt
+    || deviation.sessionId !== record.sessionId
+    || record.planDigest !== state.planDigest
+    || canonicalDigestValue(deviation.authority) !== canonicalDigestValue(authority)
+    || deviation.classificationBasis?.source?.id !== sourceId
+    || deviation.classificationBasis?.source?.version !== state.planDigest) return undefined
+  return { classificationBasis: structuredClone(deviation.classificationBasis) }
+}
+
+function queueExecutionDeviationDecision(state, taskId, ownerId) {
+  const deviation = state.ownerRuns?.[ownerRunKey(taskId, ownerId)]?.executionDeviation
+  const basis = deviation?.classificationBasis
+  if (basis?.externalPermissionGap === undefined && basis?.businessCommitmentDelta === undefined) return undefined
+  const notificationId = `ed-${createHash('sha256')
+    .update(`${state.id}:${state.planDigest}:${taskId}:${ownerId}:${deviation.deviationId}`)
+    .digest('hex')
+    .slice(0, 24)}`
+  state.mainOutbox ??= {}
+  state.mainOutbox[notificationId] ??= {
+    notificationId,
+    kind: 'main',
+    reason: 'execution_authority_required',
+    workflowId: state.id,
+    planDigest: state.planDigest,
+    taskId,
+    ownerId,
+    deviationId: deviation.deviationId,
+    classificationBasis: structuredClone(basis),
+    status: 'pending',
+    createdAt: now(),
+    summary: basis.externalPermissionGap === undefined
+      ? `任务 ${taskId} 的执行将改变业务承诺，等待用户决定。`
+      : `任务 ${taskId} 缺少 ${basis.externalPermissionGap.target} 的 ${basis.externalPermissionGap.requiredPermission}，等待用户决定。`,
+  }
+  return state.mainOutbox[notificationId]
+}
+
+function currentExecutionDeviationAuthorityGate(state, taskId, ownerId) {
+  const context = ownerExecutionDeviationContext(state, taskId, ownerId)
+  if (context === undefined) return undefined
+  const classified = classifyFailure('Runtime 接纳的 Owner 执行偏差等待分类', context)
+  if (classified.class !== 'external_authority') return undefined
+  return {
+    deviation: state.ownerRuns?.[ownerRunKey(taskId, ownerId)]?.executionDeviation,
+    classificationBasis: classified.classificationBasis,
+  }
+}
+
+function executionDeviationAuthorityGateSummary(gate) {
+  const gap = gate.classificationBasis?.externalPermissionGap
+  const delta = gate.classificationBasis?.businessCommitmentDelta
+  const facts = []
+  if (gap !== undefined) {
+    facts.push(`权限缺口：${gap.target} 缺少 ${gap.requiredPermission}，阻断 ${gap.blockedAction}`)
+  }
+  if (delta !== undefined) {
+    facts.push(`业务承诺差异：从“${delta.currentCommitment}”改为“${delta.proposedCommitment}”，后果：${delta.consequence}`)
+  }
+  return `Runtime 已接纳当前执行尝试的${facts.join('；')}；只能等待用户决定，不能继续提交或执行。`
+}
+
+function executionDeviationFeedbackNextAction(deviation) {
+  const basis = deviation?.classificationBasis
+  if (basis?.externalPermissionGap !== undefined || basis?.businessCommitmentDelta !== undefined) {
+    return '停止当前实现工作；调用 owner_submit 提交 blocked（若固定验证已实际失败则提交 failed）。Runtime 会为当前任务请求用户决定，不会授予权限。'
+  }
+  return '继续在当前任务内处理技术事实；该反馈不会产生用户授权。'
+}
+
+function publicOwnerExecutionDeviation(deviation, { duplicate = false } = {}) {
+  return {
+    ...structuredClone(deviation),
+    ...(duplicate ? { duplicate: true } : {}),
+    nextAction: executionDeviationFeedbackNextAction(deviation),
+  }
+}
+
 // V2 计划以 task 表示最小交付单元；长期记忆沿用 stage 上下文时，统一补齐展示名称。
 function memoryUnitForTask(task) {
   return {
@@ -5644,9 +5832,9 @@
             && item.closeWhen.authority === 'user')
           .map(item => ({ obligationId: item.id, source: item.source, targetTaskIds: item.targetTaskIds,
             classificationBasis: item.classificationBasis, title: item.title }))
-        const mixed = (state.planConvergence?.obligations ?? []).some(item => item.status === 'open'
-          && item.closeWhen?.kind === 'decision_record' && item.closeWhen.authority === 'orchestrator')
-        const questions = !mixed && (state.planReview?.decisionQuestions ?? []).length > 0
+        // Managed questions are a projection of frozen user obligations. A
+        // Reviewer free-text question cannot substitute a different decision.
+        const questions = !managed && (state.planReview?.decisionQuestions ?? []).length > 0
           ? [...state.planReview.decisionQuestions]
           : decisionItems.map(item => {
               const basis = item.classificationBasis
@@ -8183,7 +8371,48 @@
     async submitOwnerResult(rawReport, exec) {
       const sessionId = sessionIdOf(exec)
       const active = sessionId === undefined ? undefined : runtime.activeOwners.get(sessionId)
-      const result = await runOwnerSubmission(runtime, rawReport, exec)
+      let authorityGate
+      if (active?.executionDeviationId !== undefined) {
+        authorityGate = await runtime.withWorkflowLock(active.workflowId, async () => {
+          if (active.lease === undefined) throw new Error('owner_submit 缺少当前 Owner lease')
+          await runtime.assertOwnerLease(active.lease)
+          const state = await readState(runtime, active.workflowRoot, active.workflowId)
+          if (state.root !== active.workflowRoot) {
+            throw new Error('owner_submit 的 Workflow 绑定已失效')
+          }
+          const record = state.ownerRuns?.[ownerRunKey(active.stageId, active.owner.id)]
+          const context = ownerExecutionDeviationContext(state, active.stageId, active.owner.id)
+          if (context === undefined
+            || record?.executionDeviation?.deviationId !== active.executionDeviationId
+            || record.executionDeviation.sessionId !== sessionId
+            || record.executionDeviation.attempt !== active.attempt
+            || record.executionDeviation.planDigest !== active.planDigest) {
+            throw new Error('owner_submit 的已接纳执行偏差绑定已失效；不能把未决旧依据当作完成提交')
+          }
+          return currentExecutionDeviationAuthorityGate(state, active.stageId, active.owner.id)
+        })
+      }
+      // Do not rely on the Owner to turn its own permission/business report
+      // into a blocked submission.  The admission record is authoritative for
+      // this current attempt, so a later completed report cannot reach fixed
+      // verification, commit, or merge.
+      const executedVerificationFailure = Object.values(active?.verificationResults ?? {}).some(result => (
+        result?.passed === false && Number.isInteger(result?.exitCode)
+        && (result?.enforcement === 'full'
+          || (result?.enforcement === 'approved-host' && result?.approvalOutcome === 'allowed-once'))
+      ))
+      const report = authorityGate === undefined || !plainObject(rawReport)
+        ? rawReport
+        : {
+            ...rawReport,
+            // owner-submission correctly rejects a blocked report after an
+            // already-executed fixed verification failure.  A failed receipt
+            // preserves that technical fact while the Runtime-admitted
+            // authority basis still controls recovery classification.
+            status: executedVerificationFailure ? 'failed' : 'blocked',
+            summary: executionDeviationAuthorityGateSummary(authorityGate),
+          }
+      const result = await runOwnerSubmission(runtime, report, exec)
       if (active !== undefined) {
         const phase = result.status === 'completed' ? 'submitted' : result.status
         await runtime.recordOwnerHeartbeat(active, phase).catch(() => undefined)
@@ -10636,9 +10865,18 @@
         const taskPlan = state.plan?.tasks?.find(task => task.id === reservation.taskId)
         const policy = taskPolicy(taskPlan, blocked ? 'onBlocked' : 'onFailure')
         const attempt = Number(reservation.attempts ?? 0)
-        const classified = policy?.action === 'handoff_replan'
-          ? { class: 'contract_dag', message }
-          : classifyFailure(message)
+        const classifiedFromEvidence = classifyFailure(
+          message,
+          ownerExecutionDeviationContext(state, reservation.taskId, reservation.ownerId),
+        )
+        // A current Runtime-admitted business/permission ground outranks a
+        // technical handoff policy.  The policy may choose a technical repair,
+        // but cannot silently replace a bounded user decision.
+        const classified = classifiedFromEvidence.class === 'external_authority'
+          ? classifiedFromEvidence
+          : policy?.action === 'handoff_replan'
+            ? { class: 'contract_dag', message }
+            : classifiedFromEvidence
         const task = state.tasks?.find(item => item.taskId === reservation.taskId)
         const previousRecovery = task?.autonomousRecovery ?? ownerRecord?.autonomousRecovery
         const evidenceDigest = workflowEvidenceDigest(state, state.planningRuntimeFacts)
@@ -10670,7 +10908,8 @@
         }
         const failedBoundVerification = Object.values(task?.verificationResults ?? {})
           .some(result => result?.passed === false)
-        if ((blocked || failedBoundVerification) && pendingHandoff !== undefined) {
+        if (classified.class !== 'external_authority'
+          && (blocked || failedBoundVerification) && pendingHandoff !== undefined) {
           if (pendingHandoff.status === 'acknowledged') {
             pendingHandoff.status = 'pending'
             pendingHandoff.reopenedAt = now()
@@ -10760,16 +10999,25 @@
           if (!blocked) {
           state.ownerRuns[ownerKey] = {
             ...ownerRecord,
-            status: 'failed',
+            status: requiresMainDecision ? 'blocked' : 'failed',
             taskId: reservation.taskId,
             stageId: reservation.taskId,
             ownerId: reservation.ownerId,
+            phase: requiresMainDecision ? 'awaiting_user_authority' : ownerRecord?.phase,
             error: message,
             autonomousRecovery,
           }
           }
-          state.status = 'blocked'
-          state.error = message
+          if (requiresMainDecision) {
+            queueExecutionDeviationDecision(state, reservation.taskId, reservation.ownerId)
+            // A user decision blocks this task only.  Scheduler capacity remains
+            // available for independent ready tasks in the current V2 graph.
+            state.status = 'running'
+            state.error = undefined
+          } else {
+            state.status = 'blocked'
+            state.error = message
+          }
           appendSupervisorEvent(state, 'supervisor.reservation-failed', {
             taskId: reservation.taskId,
             ownerId: reservation.ownerId,
@@ -11973,13 +12221,16 @@
                   }
                 }
                 current.ownerRuns ??= {}
+                const { executionDeviation: _previousDeviation, ...previousRun } = latestRecord ?? {}
                 current.ownerRuns[key] = {
-                  ...latestRecord,
+                  ...previousRun,
                   status: 'starting',
                   ownerId,
                   stageId,
                   branch: claimedBranch,
                   worktree: claimedWorktree,
+                  planDigest: current.planDigest,
+                  attempt: Number(latestRecord?.attempt ?? 0) + 1,
                   startedAt: now(),
                 }
                 // 临时工作记忆是同一 task 的可恢复上下文；它只存在于 Runtime 状态，
@@ -12090,11 +12341,41 @@
           await runtime.withWorkflowLock(workflowId, async () => {
             const latest = await readState(runtime, root, workflowId)
             latest.ownerRuns ??= {}
+            const executionContext = ownerExecutionDeviationContext(latest, stageId, ownerId)
+            const classified = classifyFailure(errorText(error), executionContext)
+            const recoveryStrategy = selectFailureRecovery({
+              failureClass: classified.class,
+              usedStrategies: latest.ownerRuns[key]?.autonomousRecovery?.usedStrategies ?? [],
+            })
+            const requiresMainDecision = !blocked && recoveryStrategy === 'request_user_authority'
+            const autonomousRecovery = {
+              contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
+              failureClass: classified.class,
+              strategy: recoveryStrategy,
+              message: errorText(error),
+              evidenceDigest: workflowEvidenceDigest(latest, latest.planningRuntimeFacts),
+              usedStrategies: [...new Set([
+                ...(latest.ownerRuns[key]?.autonomousRecovery?.usedStrategies ?? []),
+                recoveryStrategy,
+              ])],
+              fingerprint: failureFingerprint({
+                workflowId,
+                planDigest: latest.planDigest,
+                taskId: stageId,
+                ownerId,
+                failureClass: classified.class,
+                message: errorText(error),
+                strategy: recoveryStrategy,
+              }),
+              updatedAt: now(),
+            }
             latest.ownerRuns[key] = {
               ...latest.ownerRuns[key],
-              status: blocked ? 'blocked' : 'failed',
+              status: blocked || requiresMainDecision ? 'blocked' : 'failed',
+              phase: requiresMainDecision ? 'awaiting_user_authority' : latest.ownerRuns[key]?.phase,
               error: errorText(error),
               handoffs,
+              autonomousRecovery,
               ...(partialResult === undefined ? {} : { result: partialResult, partialCommitSha: partialResult.commitSha }),
               branch: entry?.branch ?? claimedBranch,
               worktree: entry?.worktree ?? claimedWorktree,
@@ -12105,11 +12386,18 @@
               taskState.executorId = null
               taskState.cursor = null
               taskState.unchangedPolls = 0
-              taskState.reason = blocked ? 'decision_required' : 'task_failed'
-              taskState.action = blocked ? 'await_user' : 'repair_task'
+              taskState.reason = blocked || requiresMainDecision ? 'decision_required' : 'task_failed'
+              taskState.action = blocked || requiresMainDecision ? 'await_user' : 'repair_task'
+              taskState.autonomousRecovery = autonomousRecovery
             }
-            latest.status = blocked ? 'blocked' : 'failed'
-            latest.error = errorText(error)
+            if (requiresMainDecision) {
+              queueExecutionDeviationDecision(latest, stageId, ownerId)
+              latest.status = 'running'
+              latest.error = undefined
+            } else {
+              latest.status = blocked ? 'blocked' : 'failed'
+              latest.error = errorText(error)
+            }
             await runtime.assertOwnerLease(acquiredLease.lease)
             await saveState(runtime, latest, acquiredLease.lease)
             await appendLog(runtime, root, workflowId, blocked ? 'workflow.blocked' : 'workflow.failed', {
@@ -12600,7 +12888,7 @@
           const message = record.error ?? record.reason ?? state.error ?? `Owner ${ownerId} 重复失败`
           const repeatedTaskState = state.tasks?.find(item => item.taskId === stageId)
           const previousRecovery = repeatedTaskState?.autonomousRecovery ?? record.autonomousRecovery
-          const classified = classifyFailure(message)
+          const classified = classifyFailure(message, ownerExecutionDeviationContext(state, stageId, ownerId))
           const evidenceDigest = workflowEvidenceDigest(state, state.planningRuntimeFacts)
           const evidenceChanged = previousRecovery?.evidenceDigest !== undefined
             && previousRecovery.evidenceDigest !== evidenceDigest
@@ -12647,8 +12935,14 @@
             repeatedTaskState.action = requiresAuthority ? 'await_user' : incident ? 'retry_runtime' : null
             repeatedTaskState.autonomousRecovery = autonomousRecovery
           }
-          state.status = requiresAuthority || incident ? 'blocked' : 'running'
-          state.error = requiresAuthority || incident ? message : undefined
+          if (requiresAuthority) {
+            queueExecutionDeviationDecision(state, stageId, ownerId)
+            state.status = 'running'
+            state.error = undefined
+          } else {
+            state.status = incident ? 'blocked' : 'running'
+            state.error = incident ? message : undefined
+          }
           await saveState(runtime, state)
           await appendLog(runtime, root, workflowId, requiresAuthority
             ? 'owner.authority-required'
@@ -12705,13 +12999,22 @@
           throw new Error(`Owner ${ownerId} 的上一短期子线程仍在运行，不能恢复同一 Owner`)
         }
         const recoveredAt = now()
-        const classified = classifyFailure(record.error ?? record.reason ?? state.error ?? record.status)
+        const executionDeviation = ownerExecutionDeviationContext(state, stageId, ownerId)
+        const classified = classifyFailure(
+          record.error ?? record.reason ?? state.error ?? record.status,
+          executionDeviation,
+        )
         const previousRecovery = record.autonomousRecovery
         const evidenceDigest = workflowEvidenceDigest(state, state.planningRuntimeFacts)
         const evidenceChanged = previousRecovery?.evidenceDigest !== undefined
           && previousRecovery.evidenceDigest !== evidenceDigest
         const usedStrategies = evidenceChanged ? [] : previousRecovery?.usedStrategies ?? []
-        const strategy = previousRecovery?.strategy ?? selectFailureRecovery({
+        // A still-current user gate cannot be downgraded by later technical
+        // text.  Once its source/plan/attempt binding is stale, it cannot
+        // carry authority into a new recovery attempt.
+        const preservedAuthorityGate = previousRecovery?.strategy === 'request_user_authority'
+          && executionDeviation !== undefined
+        const strategy = (preservedAuthorityGate ? previousRecovery?.strategy : undefined) ?? selectFailureRecovery({
           failureClass: classified.class,
           usedStrategies,
           evidenceChanged,
@@ -12750,8 +13053,14 @@
             taskState.action = strategy === 'request_user_authority' ? 'await_user' : 'retry_runtime'
             taskState.autonomousRecovery = autonomousRecovery
           }
-          state.status = 'blocked'
-          state.error = autonomousRecovery.message
+          if (strategy === 'request_user_authority') {
+            queueExecutionDeviationDecision(state, stageId, ownerId)
+            state.status = 'running'
+            state.error = undefined
+          } else {
+            state.status = 'blocked'
+            state.error = autonomousRecovery.message
+          }
           await saveState(runtime, state)
           pausedAutonomousRecovery = {
             contract: 'DSH_OWNER_AUTONOMOUS_RECOVERY_PAUSED_V1',
@@ -13730,6 +14039,9 @@
         state,
         stage,
         entry,
+        attempt: state.ownerRuns?.[ownerRunKey(stage.id, entry.owner.id)]?.attempt,
+        planDigest: state.planDigest,
+        authority: ownerRegistryAuthority(entry.owner),
       }
       const memorySnapshot = await loadMemorySnapshot(entry.worktree, {
         ownerIds: ownerMemoryLineage(state.plan, entry.owner),
@@ -14660,6 +14972,105 @@
     async assertCompletedOwnerRecord(state, stageId, ownerId, record, signal) {
       return runtime.assertPersistedOwnerRecord(state, stageId, ownerId, record, signal, { allowCompleted: true })
     },
+    async recordOwnerExecutionDeviation(rawFeedback, exec) {
+      const sessionId = sessionIdOf(exec)
+      const active = sessionId === undefined ? undefined : runtime.activeOwners.get(sessionId)
+      if (active === undefined) throw new Error('owner_execution_feedback 只能由当前正在运行的 Owner 子代理调用')
+      if (active.submitting === true || active.submission !== undefined) {
+        throw new Error('Owner 已进入提交关卡，不能再记录执行偏差')
+      }
+      const feedback = normalizeOwnerExecutionFeedback(rawFeedback)
+      return runtime.withWorkflowLock(active.workflowId, async () => {
+        if (active.lease === undefined) throw new Error('owner_execution_feedback 缺少当前 Owner lease')
+        await runtime.assertOwnerLease(active.lease)
+        const state = await readState(runtime, active.workflowRoot, active.workflowId)
+        if (state.root !== active.workflowRoot || state.plan?.contract !== PLAN_V2_CONTRACT || state.status !== 'running') {
+          throw new Error('owner_execution_feedback 的 Workflow 已不再是当前可执行 V2 现场')
+        }
+        const task = state.plan.tasks.find(item => item.id === active.stageId)
+        const taskState = state.tasks?.find(item => item.taskId === active.stageId)
+        const key = ownerRunKey(active.stageId, active.owner.id)
+        const record = state.ownerRuns?.[key]
+        const owner = state.plan.owners.find(item => item.id === active.owner.id)
+        if (task?.ownerId !== active.owner.id || owner === undefined
+          || taskState?.status !== 'running' || record?.status !== 'running'
+          || record.sessionId !== sessionId || !Number.isSafeInteger(record.attempt) || record.attempt < 1) {
+          throw new Error('owner_execution_feedback 的任务、Owner、会话或当前执行尝试绑定已失效')
+        }
+        if (active.attempt !== record.attempt || active.planDigest !== state.planDigest
+          || canonicalDigestValue(active.authority) !== canonicalDigestValue(ownerRegistryAuthority(owner))) {
+          throw new Error('owner_execution_feedback 的 active Owner 绑定已失效')
+        }
+        const source = {
+          id: `owner-execution/${state.id}/${task.id}/${record.attempt}`,
+          version: state.planDigest,
+        }
+        const classificationBasis = {
+          source,
+          technicalFacts: feedback.technicalFacts,
+          ...(feedback.businessCommitmentDelta === undefined ? {} : { businessCommitmentDelta: feedback.businessCommitmentDelta }),
+          ...(feedback.externalPermissionGap === undefined ? {} : { externalPermissionGap: feedback.externalPermissionGap }),
+        }
+        const deviationId = `ed-${createHash('sha256')
+          .update(canonicalDigestValue({
+            workflowId: state.id,
+            planDigest: state.planDigest,
+            taskId: task.id,
+            ownerId: owner.id,
+            attempt: record.attempt,
+            sessionId,
+            source,
+            feedback,
+          }))
+          .digest('hex')
+          .slice(0, 24)}`
+        const next = {
+          contract: EXECUTION_DEVIATION_CONTRACT,
+          deviationId,
+          status: 'admitted',
+          workflowId: state.id,
+          planDigest: state.planDigest,
+          taskId: task.id,
+          ownerId: owner.id,
+          attempt: record.attempt,
+          sessionId,
+          authority: ownerRegistryAuthority(owner),
+          source,
+          expected: feedback.expected,
+          actual: feedback.actual,
+          evidence: feedback.evidence,
+          classificationBasis,
+          admittedAt: now(),
+        }
+        const existing = record.executionDeviation
+        if (existing !== undefined) {
+          if (existing.deviationId !== deviationId
+            || existing.workflowId !== next.workflowId
+            || existing.planDigest !== next.planDigest
+            || existing.taskId !== next.taskId
+            || existing.ownerId !== next.ownerId
+            || existing.attempt !== next.attempt
+            || existing.sessionId !== next.sessionId) {
+            throw new Error('当前 Owner 执行尝试已经接纳一条偏差反馈，不能覆盖或追加不同依据')
+          }
+          active.executionDeviationId = existing.deviationId
+          return publicOwnerExecutionDeviation(existing, { duplicate: true })
+        }
+        state.ownerRuns[key] = { ...record, executionDeviation: next }
+        taskState.executionDeviationId = deviationId
+        await saveState(runtime, state, active.lease)
+        active.executionDeviationId = deviationId
+        await appendLog(runtime, active.workflowRoot, active.workflowId, 'owner.execution-deviation-admitted', {
+          taskId: task.id,
+          ownerId: owner.id,
+          attempt: record.attempt,
+          deviationId,
+          source,
+          summary: `Runtime 已接纳 Owner 执行偏差；后续失败恢复只会使用当前绑定依据。`,
+        })
+        return publicOwnerExecutionDeviation(next)
+      })
+    },
     async recordOwnerMemoryNote(note, exec) {
       const sessionId = sessionIdOf(exec)
       const active = runtime.activeOwners.get(sessionId)
--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -4297,7 +4297,7 @@
       reviewed.workflow.planDigest,
       reviewed.review,
     )
-    assert.equal(requested.decisionQuestions[0], '本轮是否允许连接真实外部服务？')
+    assert.equal(requested.decisionQuestions[0], '明确外部服务范围：从“仅执行已确认的现有方案”改为“采用待确认的方案 A”；改变当前候选向调用方提供的行为，需要明确选择。')
     const saved = await waitForWorkflowState(
       join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
       current => current.planningDiscussion?.status === 'delivered',
@@ -4305,7 +4305,7 @@
     )
     assert.equal(saved.planningAgent.phase, 'awaiting_main_discussion')
     assert.equal(saved.pendingDecisionBundle.status, 'pending')
-    assert.deepEqual(saved.pendingDecisionBundle.questions, ['本轮是否允许连接真实外部服务？'])
+    assert.deepEqual(saved.pendingDecisionBundle.questions, requested.decisionQuestions)
     assert.equal(followups.length, 1)
     const update = JSON.parse(followups[0].content[0].text)
     assert.equal(update.type, 'planning_discussion_ready')
@@ -7072,3 +7072,268 @@
     await rm(root, { recursive: true, force: true })
   }
 })
+
+
+for (const mode of ['permission', 'business', 'mixed-decision', 'mixed-verification']) test(`R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：${mode}`, async () => {
+  const { root, statePath, runtime, state, agent } = await closureReceiptFixture()
+  try {
+    const userIssue = { ...reviewClosureContract('r09-user', 'decision_record'), severity: 'high', title: '账本访问选择', detail: '具体权限缺口已有来源。', suggestion: '明确权限。' }
+    delete userIssue.classificationBasis.businessCommitmentDelta
+    userIssue.classificationBasis.externalPermissionGap = { requiredPermission: 'read:ledger', target: 'remote-ledger', blockedAction: '读取指定账本' }
+    if (mode === 'business') {
+      delete userIssue.classificationBasis.externalPermissionGap
+      userIssue.classificationBasis.businessCommitmentDelta = { currentCommitment: '保留三十天', proposedCommitment: '保留七天', consequence: '第八天起的数据无法读取' }
+    }
+    const issues = [userIssue]
+    if (mode.startsWith('mixed')) issues.push({
+      ...reviewClosureContract('r09-technical', mode === 'mixed-decision' ? 'decision_record' : 'plan_verification_binding', 'T1', 'orchestrator'),
+      ...(mode === 'mixed-verification' ? { closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' } } : {}),
+      severity: 'high', title: 'token 清理', detail: '根据既有合同处理资源。', suggestion: '完善技术验证。',
+    })
+    let review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '需要明确权限或承诺', issues, decisionQuestions: ['用户取消连接时如何释放 token 缓冲？'] }
+    runtime.runChild = async () => review
+    runtime.schedulePlanningDiscussion = async () => ({ scheduled: false })
+    await runtime.reviewPlan(agent, state.id)
+    await assert.rejects(runtime.requestPlanReviewDiscussion(agent, state.id, 'f'.repeat(64), review), /过期/)
+    const first = await runtime.requestPlanReviewDiscussion(agent, state.id, state.planDigest, review)
+    assert.equal(first.decisionQuestions.length, 1)
+    assert.doesNotMatch(first.decisionQuestions[0], /token/)
+    assert.match(first.decisionQuestions[0], mode === 'business' ? /三十天.*七天.*第八天/ : /remote-ledger.*read:ledger.*读取指定账本/)
+    assert.deepEqual(first.decisionItems.map(item => item.obligationId), ['r09-user'])
+    // A later display rewrite must not replace the first classified commitment.
+    if (mode === 'business') {
+      userIssue.classificationBasis.businessCommitmentDelta.proposedCommitment = '保留一天'
+      review = { ...review, decisionQuestions: ['新的无关问题'] }
+      await runtime.reviewPlan(agent, state.id)
+      const again = await runtime.requestPlanReviewDiscussion(agent, state.id, state.planDigest, review)
+      assert.match(again.decisionQuestions[0], /七天/)
+      assert.doesNotMatch(again.decisionQuestions[0], /一天|无关/)
+    }
+    const saved = JSON.parse(await readFile(statePath, 'utf8'))
+    assert.equal(saved.planApproved, false)
+    assert.deepEqual(saved.pendingDecisionBundle.targetTaskIds, ['T1'])
+  } finally { await runtime.dispose(); await rm(root, { recursive: true, force: true }) }
+})
+
+
+async function executionFeedbackFixture() {
+  const fixture = await closureReceiptFixture()
+  const { runtime, root, state, statePath } = fixture
+  const registry = await applyRegistryOperation(state.workflowWorktree, await loadRegistry(state.workflowWorktree), addOwnerOperation('independent'))
+  state.registryDigest = registryContentDigest(registry)
+  const independent = registry.owners.find(owner => owner.id === 'independent')
+  state.plan = normalizePlanV2({ ...state.plan, registryDigest: state.registryDigest,
+    owners: [...state.plan.owners, independent],
+    tasks: [...state.plan.tasks, { ...state.plan.tasks[0], id: 'T2', ownerId: 'independent', write: ['src/independent/value.mjs'], decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: ['independent'], unknowns: [] } }],
+  })
+  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
+  state.planApproved = true
+  state.planReview = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '当前计划通过', issues: [] }
+  state.planReviewDigest = state.planDigest
+  state.status = 'running'
+  state.attempt = 1
+  state.tasks = createTaskState(state.plan)
+  const owner = state.plan.owners[0]
+  const sessionId = 'r09-active-owner'
+  const key = `T1:${owner.id}`
+  state.tasks[0].status = 'running'
+  state.tasks[0].executorId = sessionId
+  state.ownerRuns[key] = { status: 'running', taskId: 'T1', stageId: 'T1', ownerId: owner.id, sessionId,
+    attempt: 1, planDigest: state.planDigest, startedAt: '2026-09-10T12:10:00.000Z', worktree: state.workflowWorktree, branch: state.workflowBranch }
+  state.supervisorOutbox = { [key]: { status: 'running', taskId: 'T1', ownerId: owner.id, attempts: 1 } }
+  await writeFile(statePath, JSON.stringify(state), 'utf8')
+  const acquired = await runtime.acquireOwnerLease(root, owner.id, state.id, 'T1')
+  const active = { workflowRoot: state.root, workflowId: state.id, stageId: 'T1', owner, sessionId,
+    worktree: state.workflowWorktree, lease: acquired.lease, state, stage: state.plan.tasks[0], attempt: 1, planDigest: state.planDigest,
+    authority: { id: owner.id, name: owner.name, description: owner.description, scope: [...owner.scope], exclude: [...owner.exclude] } }
+  runtime.activeOwners.set(sessionId, active)
+  return { ...fixture, key, active, exec: { agent: { id: sessionId }, signal: undefined },
+    async cleanup() { runtime.activeOwners.delete(sessionId); await runtime.releaseOwnerLease(acquired.lease); await runtime.dispose(); await rm(root, { recursive: true, force: true }) } }
+}
+
+function executionFeedback(mode = 'permission') {
+  return { expected: '按现有合同读取指定账本', actual: '该执行环境无法读取指定账本',
+    evidence: [{ kind: 'service_response', detail: 'remote-ledger 请求返回缺少 read:ledger 范围；本记录保留响应观察' }],
+    technical_facts: ['当前任务需要读取指定账本；权限未在本轮任务中获得。'],
+    ...(mode === 'permission' ? { external_permission_gap: { required_permission: 'read:ledger', target: 'remote-ledger', blocked_action: '读取指定账本' } } : {}),
+    ...(mode === 'business' ? { business_commitment_delta: { current_commitment: '保留三十天', proposed_commitment: '保留七天', consequence: '第八天数据不可读取' } } : {}),
+  }
+}
+
+
+for (const mode of ['technical', 'permission', 'business']) test(`R09 Owner 反馈经实际失败入口分类且保留独立任务：${mode}`, async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    const input = executionFeedback(mode)
+    if (mode === 'technical') { input.actual = '用户取消连接时 token 清理顺序错误'; input.evidence = [{ kind: 'repository_fact', detail: '清理函数在取消回调之前执行' }] }
+    await f.runtime.recordOwnerExecutionDeviation(input, f.exec)
+    const admitted = JSON.parse(await readFile(f.statePath, 'utf8'))
+    const deviation = admitted.ownerRuns[f.key].executionDeviation
+    assert.equal(deviation.workflowId, f.state.id)
+    assert.equal(deviation.taskId, 'T1')
+    assert.equal(deviation.ownerId, f.active.owner.id)
+    assert.equal(deviation.sessionId, f.active.sessionId)
+    assert.equal(deviation.planDigest, f.state.planDigest)
+    const independent = structuredClone(admitted.tasks.find(task => task.taskId === 'T2'))
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error(input.actual))
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.deepEqual(saved.tasks.find(task => task.taskId === 'T2'), independent)
+    const affected = saved.tasks.find(task => task.taskId === 'T1')
+    if (mode === 'technical') {
+      assert.equal(affected.status, 'pending')
+      assert.notEqual(affected.action, 'await_user')
+      assert.notEqual(affected.autonomousRecovery.strategy, 'request_user_authority')
+      assert.equal(Object.keys(saved.mainOutbox ?? {}).length, 0)
+    } else {
+      assert.equal(affected.status, 'stopped')
+      assert.equal(affected.action, 'await_user')
+      assert.equal(affected.autonomousRecovery.strategy, 'request_user_authority')
+      assert.equal(saved.status, 'running', '独立任务不能因局部待决而全局停止')
+      const notification = Object.values(saved.mainOutbox ?? {}).find(item => item.taskId === 'T1')
+      assert.ok(notification)
+      const deliveries = []
+      f.agent.followup = message => deliveries.push(message)
+      await f.runtime.deliverMainOutbox(f.agent, f.state.id, notification.notificationId)
+      assert.equal(deliveries.length, 1)
+      const delivered = JSON.parse(deliveries[0].content[0].text)
+      assert.equal(delivered.deviationId, deviation.deviationId)
+      assert.equal(delivered.taskId, 'T1')
+      assert.deepEqual(delivered.classificationBasis, deviation.classificationBasis)
+      const manifest = await f.runtime.ensureControlBridge(f.agent, saved)
+      const next = await request(manifest, 'supervisor-next')
+      assert.equal(next.action, 'create')
+      assert.deepEqual(next.tasks.map(task => task.taskId), ['T2'])
+    }
+    assert.equal(saved.planApproved, true, '反馈不能改变已有计划审批记录')
+    assert.equal(saved.obligationDecisions, undefined, '报告不是用户同意的决定回执')
+  } finally { await f.cleanup() }
+})
+
+test('R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选', async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    const before = await readFile(f.statePath, 'utf8')
+    for (const feedback of [
+      { ...executionFeedback(), owner_id: 'independent' },
+      { ...executionFeedback(), technical_facts: [] },
+      { ...executionFeedback(), evidence: [] },
+      { ...executionFeedback('business'), business_commitment_delta: { current_commitment: '相同承诺', proposed_commitment: '相同承诺', consequence: '没有变化' } },
+    ]) await assert.rejects(f.runtime.recordOwnerExecutionDeviation(feedback, f.exec))
+    await assert.rejects(f.runtime.recordOwnerExecutionDeviation(executionFeedback(), { agent: { id: 'foreign-owner' } }))
+    assert.equal(await readFile(f.statePath, 'utf8'), before)
+    const changed = JSON.parse(before)
+    changed.planDigest = 'f'.repeat(64)
+    await writeFile(f.statePath, JSON.stringify(changed))
+    const staleBefore = await readFile(f.statePath, 'utf8')
+    await assert.rejects(f.runtime.recordOwnerExecutionDeviation(executionFeedback(), f.exec), /失效|版本|digest|当前|绑定/)
+    assert.equal(await readFile(f.statePath, 'utf8'), staleBefore)
+  } finally { await f.cleanup() }
+})
+
+for (const mutation of ['session', 'attempt', 'plan', 'owner']) test(`R09 已接纳反馈消费前重新校验当前来源：${mutation}`, async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    await f.runtime.recordOwnerExecutionDeviation(executionFeedback(), f.exec)
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    if (mutation === 'session') saved.ownerRuns[f.key].sessionId = 'replacement-session'
+    if (mutation === 'attempt') saved.ownerRuns[f.key].attempt += 1
+    if (mutation === 'plan') saved.planDigest = 'f'.repeat(64)
+    if (mutation === 'owner') saved.plan.owners[0].scope.push('changed/**')
+    await writeFile(f.statePath, JSON.stringify(saved))
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error('连接失败'))
+    const outcome = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.notEqual(outcome.tasks[0].autonomousRecovery.strategy, 'request_user_authority')
+    assert.equal(Object.keys(outcome.mainOutbox ?? {}).length, 0)
+  } finally { await f.cleanup() }
+})
+
+
+test('R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权', async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    const input = executionFeedback()
+    await f.runtime.recordOwnerExecutionDeviation(input, f.exec)
+    const first = JSON.parse(await readFile(f.statePath, 'utf8')).ownerRuns[f.key].executionDeviation
+    await f.runtime.recordOwnerExecutionDeviation(input, f.exec)
+    const duplicate = JSON.parse(await readFile(f.statePath, 'utf8')).ownerRuns[f.key].executionDeviation
+    assert.deepEqual(duplicate, first)
+    await assert.rejects(f.runtime.recordOwnerExecutionDeviation(executionFeedback('technical'), f.exec), /冲突|覆盖|已有|改变|降/)
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error('新的普通技术描述'))
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.equal(saved.tasks[0].action, 'await_user')
+    assert.equal(saved.ownerRuns[f.key].executionDeviation.deviationId, first.deviationId)
+  } finally { await f.cleanup() }
+})
+
+
+test('R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁', async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    await f.runtime.recordOwnerExecutionDeviation(executionFeedback(), f.exec)
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error('缺少访问范围'))
+    f.runtime.activeOwners.delete(f.active.sessionId)
+    await f.runtime.releaseOwnerLease(f.active.lease)
+    let starts = 0
+    f.runtime.runExternalOwner = async () => { starts += 1; throw new Error('R09_NEW_ATTEMPT_STARTED') }
+    const waiting = await f.runtime.recoverOwner(f.agent, f.state.id, 'T1', f.active.owner.id)
+    assert.equal(waiting.strategy, 'request_user_authority')
+    assert.equal(starts, 0)
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    saved.ownerRuns[f.key].attempt += 1
+    saved.ownerRuns[f.key].sessionId = 'new-attempt-session'
+    saved.ownerRuns[f.key].status = 'failed'
+    saved.ownerRuns[f.key].error = '新执行的普通失败'
+    await writeFile(f.statePath, JSON.stringify(saved))
+    await assert.rejects(f.runtime.recoverOwner(f.agent, f.state.id, 'T1', f.active.owner.id), /R09_NEW_ATTEMPT_STARTED/)
+    assert.equal(starts, 1)
+    const recovered = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.notEqual(recovered.ownerRuns[f.key].autonomousRecovery.strategy, 'request_user_authority')
+    assert.equal(recovered.tasks.find(task => task.taskId === 'T2').status, 'pending')
+  } finally { await f.cleanup() }
+})
+
+
+test('R09 已确认权限缺口优先于技术 handoff 策略', async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    const configured = JSON.parse(await readFile(f.statePath, 'utf8'))
+    configured.plan.tasks[0].onFailure = { action: 'handoff_replan' }
+    configured.plan = normalizePlanV2(configured.plan)
+    configured.planDigest = createHash('sha256').update(JSON.stringify(configured.plan)).digest('hex')
+    configured.planReviewDigest = configured.planDigest
+    configured.ownerRuns[f.key].planDigest = configured.planDigest
+    f.active.planDigest = configured.planDigest
+    await writeFile(f.statePath, JSON.stringify(configured))
+    await f.runtime.recordOwnerExecutionDeviation(executionFeedback(), f.exec)
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error('技术 handoff 策略同时适用'))
+    const outcome = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.equal(outcome.tasks[0].autonomousRecovery.strategy, 'request_user_authority')
+    assert.equal(outcome.tasks[0].action, 'await_user')
+    assert.equal(outcome.status, 'running')
+  } finally { await f.cleanup() }
+})
+
+
+for (const mode of ['permission', 'business']) test(`R09 已报告用户待决后不能通过 completed 提交越过门禁：${mode}`, async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    await f.runtime.recordOwnerExecutionDeviation(executionFeedback(mode), f.exec)
+    let inspected = 0
+    let committed = 0
+    f.runtime.inspectOwnerAttempt = async () => { inspected += 1; throw new Error('不应进入成功提交检查') }
+    f.runtime.commitOwnerAttempt = async () => { committed += 1; throw new Error('不应提交代码') }
+    // A previous technical verification failure must not hide a separately
+    // sourced user decision or trap submission in the technical repair loop.
+    f.active.verificationResults = { unit: { verificationId: 'unit', passed: false, exitCode: 1, enforcement: 'full' } }
+    const result = await f.runtime.submitOwnerResult({ contract: 'DSH_OWNER_RESULT_V1', status: 'completed', summary: '声称所有工作完成', changes: [], tests: [], handoffs: [], memory_updates: [] }, f.exec)
+    assert.notEqual(result.status, 'completed')
+    assert.equal(result.accepted, true)
+    assert.equal(inspected, 0)
+    assert.equal(committed, 0)
+    assert.notEqual(f.active.submission.report.status, 'completed')
+    await f.runtime.failSupervisorReservation(f.agent, f.state.id, f.key, new Error(result.summary))
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.equal(saved.tasks[0].action, 'await_user')
+    assert.equal(saved.tasks[1].status, 'pending')
+  } finally { await f.cleanup() }
+})
--- before/owner-workflow-plugin/test/plugin.test.mjs
+++ candidate/owner-workflow-plugin/test/plugin.test.mjs
@@ -65,6 +65,12 @@
   assert.ok(tools.some(tool => tool.name === 'workflow_plan_submit'))
   assert.ok(tools.some(tool => tool.name === 'workflow_plan_review_submit'))
   assert.ok(tools.some(tool => tool.name === 'workflow_obligation_decide'))
+  const executionFeedback = tools.find(tool => tool.name === 'owner_execution_feedback')
+  assert.ok(executionFeedback, '执行反馈必须有实际注册入口')
+  assert.deepEqual(executionFeedback.parameters.required, ['feedback'])
+  for (const name of ['workflow_id', 'owner_id', 'task_id', 'session_id', 'authority', 'approved']) {
+    assert.equal(Object.hasOwn(executionFeedback.parameters.properties, name), false, name)
+  }
   assert.ok(tools.some(tool => tool.name === 'workflow_plan_revision_extend'))
   assert.ok(tools.some(tool => tool.name === 'workflow_status'))
   assert.ok(tools.some(tool => tool.name === 'workflow_git_inspect'))
@@ -680,3 +686,13 @@
   assert.match(rolePrompt, /不能把 "workspace-write" 当作参数/u)
   assert.doesNotMatch(skill.content, /\bstage\b|\bstages\b|owner_add/u)
 })
+
+
+test('R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner', () => {
+  for (const role of ['planner', 'plan-reviewer', 'reviewer', 'operator']) {
+    assert.ok(toolExecutionDenial({ role, modeEnabled: true, toolName: 'owner_execution_feedback', toolArguments: {} }), role)
+  }
+  assert.ok(toolExecutionDenial({ modeEnabled: true, toolName: 'owner_execution_feedback', toolArguments: {} }))
+  assert.ok(toolExecutionDenial({ role: 'owner', modeEnabled: true, toolName: 'owner_execution_feedback', toolArguments: {} }))
+  assert.equal(toolExecutionDenial({ activeOwner: { owner: { id: 'api' } }, role: 'owner', modeEnabled: true, toolName: 'owner_execution_feedback', toolArguments: {} }), undefined)
+})

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T12:42:43.400752+00:00",
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
      "start": "2026-09-10T12:42:43.509556+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:42:43.597531+00:00",
      "counts": {
        "tests": 24,
        "pass": 24,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "model",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/model.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T12:42:43.598237+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:42:43.727670+00:00",
      "counts": {
        "tests": 51,
        "pass": 51,
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
      "start": "2026-09-10T12:42:43.728735+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:43:55.415550+00:00",
      "counts": {
        "tests": 146,
        "pass": 139,
        "fail": 0,
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
      "start": "2026-09-10T12:43:55.416656+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.262005+00:00",
      "counts": {
        "tests": 39,
        "pass": 25,
        "fail": 0,
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
      "start": "2026-09-10T12:44:08.262824+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.358134+00:00",
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
      "start": "2026-09-10T12:44:08.359297+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.435387+00:00",
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
      "start": "2026-09-10T12:44:08.436171+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.793818+00:00",
      "counts": {
        "tests": 8,
        "pass": 8,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "plugin",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/plugin.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T12:44:08.794460+00:00",
      "timeoutSeconds": 60,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.927840+00:00",
      "counts": {
        "tests": 13,
        "pass": 12,
        "fail": 1,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "agent-policy",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/agent-policy.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T12:44:08.928578+00:00",
      "timeoutSeconds": 60,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T12:44:08.996937+00:00",
      "counts": {
        "tests": 4,
        "pass": 3,
        "fail": 1,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "owner-submission",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/owner-submission.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T12:44:08.997835+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:44:09.069454+00:00",
      "counts": {
        "tests": 6,
        "pass": 6,
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
  "at": "2026-09-10T12:47:49.416405+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md": "e274aace9aa02427609f45215818e27d425a3846e87533bead2b826b71268804"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-09-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-04 / AC-14: F10/F11 question projection and execution feedback','hashes':hashes()}
(e/'candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
b=json.loads((e/'baseline.json').read_text()); diffs=[]
for f in sorted(set(b['files']) | {f for f in c['hashes'] if f.startswith('owner-workflow-plugin/')}):
 before=(e/'before'/f).read_text() if (e/'before'/f).exists() else '';after=(r/f).read_text()
 diffs.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+f,tofile='candidate/'+f))
(e/'round.diff').write_text(''.join(diffs))
results=[]
for suite in ['convergence','model','control','security','plan-revision','workflow-state','runner','plugin','agent-policy','owner-submission']:
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

## dev-f10.log

````text
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (567.766ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (557.228167ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (805.804625ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (525.822083ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (567.169375ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3148.258458

````

## dev-r09-control-01.log

````text
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (769.410291ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (751.347708ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (571.322042ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (580.007875ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：technical (481.850833ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：permission (494.590666ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：business (513.538833ms)
✔ R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选 (529.533042ms)
✔ R09 已接纳反馈消费前重新校验当前来源：session (531.282583ms)
✔ R09 已接纳反馈消费前重新校验当前来源：attempt (499.441375ms)
✔ R09 已接纳反馈消费前重新校验当前来源：plan (492.082042ms)
✖ R09 已接纳反馈消费前重新校验当前来源：owner (540.13025ms)
✔ R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权 (588.901792ms)
ℹ tests 13
ℹ suites 0
ℹ pass 12
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7576.315834

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:7220:65
✖ R09 已接纳反馈消费前重新校验当前来源：owner (540.13025ms)
  Error: 任务 T1 的 write 范围 README.md 不属于 Owner plan-owner scope
      at assertTaskWriteScope (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:961:13)
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1000:5
      at Array.map (<anonymous>)
      at normalizePlanV2 (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:986:27)
      at readState (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:1003:5)
      at async file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:10773:23
      at async Object.withWorkflowLock (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:9621:16)
      at async Object.failSupervisorReservation (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:10772:7)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:7230:5)
      at async Test.run (node:internal/test_runner/test:1113:7)

````

## dev-r09-control-02.log

````text
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (1017.477125ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (1192.230333ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (906.909833ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (958.4515ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：technical (897.923125ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：permission (1113.930458ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：business (849.380875ms)
✔ R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选 (709.348166ms)
✔ R09 已接纳反馈消费前重新校验当前来源：session (721.578084ms)
✔ R09 已接纳反馈消费前重新校验当前来源：attempt (716.836ms)
✔ R09 已接纳反馈消费前重新校验当前来源：plan (966.085375ms)
✔ R09 已接纳反馈消费前重新校验当前来源：owner (767.345333ms)
✔ R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权 (647.412167ms)
✖ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (1.903041ms)
ℹ tests 14
ℹ suites 0
ℹ pass 13
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 11702.57825

✖ failing tests:

test at owner-workflow-plugin/test/plugin.test.mjs:691:1
✖ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (1.903041ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'owner_execution_feedback 只能由当前 active Owner 子代理调用'
  - undefined
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/plugin.test.mjs:696:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.start (node:internal/test_runner/test:1003:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'owner_execution_feedback 只能由当前 active Owner 子代理调用',
    expected: undefined,
    operator: 'strictEqual',
    diff: 'simple'
  }

````

## dev-r09-control-03.log

````text
✔ R09 已接纳反馈消费前重新校验当前来源：owner (484.912917ms)
✖ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (606.316084ms)
✔ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (0.685834ms)
ℹ tests 3
ℹ suites 0
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1214.930458

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:7269:1
✖ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (606.316084ms)
  Error: Owner plan-owner 已被存活的 Harness 进程占用：workflow=wf-registry-runtime，stage=T1，pid=96859
      at Object.acquireOwnerLease (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:4963:19)
      at async Object.withOwnerLease (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:5040:24)
      at async Object.recoverOwner (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:13046:18)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:7285:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## dev-r09-control-04.log

````text
✖ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (580.4925ms)
✔ R09 已确认权限缺口优先于技术 handoff 策略 (454.437125ms)
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1166.597375

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:7269:1
✖ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (580.4925ms)
  Error: Owner plan-owner 没有等待 owner-finish 的结果：T1:plan-owner
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:12354:17
      at async Object.withWorkflowLock (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:9621:16)
      at async Object.withOwnerLease (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:5044:24)
      at async Object.recoverOwner (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:13046:18)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:7287:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3)

````

## dev-r09-control-05.log

````text
✔ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (556.581417ms)
✖ R09 已报告用户待决后不能通过 completed 提交越过门禁：permission (455.657583ms)
✖ R09 已报告用户待决后不能通过 completed 提交越过门禁：business (444.246125ms)
✔ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (0.589625ms)
ℹ tests 4
ℹ suites 0
ℹ pass 2
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1574.962833

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:7317:48
✖ R09 已报告用户待决后不能通过 completed 提交越过门禁：permission (455.657583ms)
  Error: Owner 结果契约不受支持：undefined
      at ownerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1483:11)
      at submitOwnerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/owner-submission.mjs:18:18)
      at Object.submitOwnerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8406:28)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:7328:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:7317:48
✖ R09 已报告用户待决后不能通过 completed 提交越过门禁：business (444.246125ms)
  Error: Owner 结果契约不受支持：undefined
      at ownerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1483:11)
      at submitOwnerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/owner-submission.mjs:18:18)
      at Object.submitOwnerResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8406:28)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:7328:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## dev-r09-control-06.log

````text
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：permission (615.341458ms)
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：business (640.047792ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1408.469167

````

## f11-runtime-feedback-r09.log

````text
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (582.332958ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (646.595625ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (502.664542ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (513.029583ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：technical (465.098875ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：permission (542.827084ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：business (519.673125ms)
✔ R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选 (423.829417ms)
✔ R09 已接纳反馈消费前重新校验当前来源：session (457.596125ms)
✔ R09 已接纳反馈消费前重新校验当前来源：attempt (497.810125ms)
✔ R09 已接纳反馈消费前重新校验当前来源：plan (538.253416ms)
✔ R09 已接纳反馈消费前重新校验当前来源：owner (734.716375ms)
✔ R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权 (738.652958ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7299.059208
pre-submit feedback gate: runtime.mjs syntax check passed

````

## f11-runtime-feedback.log

````text
✔ owner-workflow-plugin/test/control.test.mjs (109.288792ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 113.056125

````

## formal-agent-policy.log

````text
✔ 子代理继承完整工具集，角色只决定文件沙箱模式 (0.77925ms)
✔ Planner 与 Reviewer 隐藏无效升级字段，并对同一失败搜索执行有界熔断 (0.358459ms)
✔ Operator 的重复搜索同样使用成功缓存和两次失败熔断 (0.435917ms)
✖ 主代理禁止直接开发，Owner 和 Operator 不使用工具白名单 (0.659958ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 40.948958

✖ failing tests:

test at owner-workflow-plugin/test/agent-policy.test.mjs:144:1
✖ 主代理禁止直接开发，Owner 和 Operator 不使用工具白名单 (0.659958ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /主会话不能直接调用/u. Input:
  
  'owner_host_exec 只能由当前 active Owner 子代理调用'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/agent-policy.test.mjs:172:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'owner_host_exec 只能由当前 active Owner 子代理调用',
    expected: /主会话不能直接调用/u,
    operator: 'match',
    diff: 'simple'
  }

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (160.386959ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (643.779875ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (367.540334ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (380.964541ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (367.632083ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (334.366625ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (175.238667ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (278.423833ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (211.929584ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (390.941208ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (360.011208ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (357.712708ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.54625ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (428.468791ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (377.552375ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.542083ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (569.414584ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (566.717ms)
✔ 自治事故的摘要型旧义务不能由 control socket probe 续期 (194.338166ms)
✔ control socket probe 只为类型化义务的宿主新文件续期一次 (454.211041ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (544.199542ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (412.756291ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (366.477291ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (333.176917ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (345.828625ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (387.73775ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (423.307166ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (260.098084ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (231.246375ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.434667ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1275.459875ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (294.73075ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (314.695125ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (306.620334ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (380.704458ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (206.008875ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (273.844208ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (286.733625ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (264.139792ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (258.575167ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (266.273584ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (224.840833ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (266.543625ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (660.212958ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (560.889667ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (209.475125ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (366.817ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (143.83425ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (147.425291ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (181.972125ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (0.721334ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.079916ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.048ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (397.36325ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (358.821709ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (466.302167ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (137.831791ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (465.928208ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (627.671458ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (983.144042ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (481.591291ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (639.826125ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.1085ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.025333ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.016667ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.014917ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.012958ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.013125ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (289.781ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (725.721666ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (455.830958ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (457.773792ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (492.472084ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.398833ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.74625ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.178375ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (469.8745ms)
✔ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (555.940625ms)
✔ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (628.961167ms)
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (520.417ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1772.161916ms)
✔ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (470.53825ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (378.820125ms)
✔ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (375.783083ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1164.624083ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (741.772334ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (579.496917ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (432.26275ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1768.571708ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (18.984083ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (18.984417ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.085208ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (4940.851583ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1995.846042ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (957.620416ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1283.478167ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (458.846459ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (554.129334ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (482.233584ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (519.938083ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (408.242084ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (747.835167ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (996.882166ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (308.085667ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (157.712583ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (123.993ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (121.813542ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (307.910459ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (135.931042ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (122.961583ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (139.58925ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (391.913375ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.653292ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (849.467875ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (876.866708ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (862.492084ms)
✔ R05 用户确认期间义务版本变化时不记录过期决定 (506.918459ms)
✔ R05 结构展开依据经 Runtime 消费，只关闭结构义务而保留业务验证 (615.05975ms)
✔ R05 pending 候选决定不能借用 active 回执，旧快照不能消费已变化候选 (519.942792ms)
✔ R05 同候选的新决定替代旧回执，取消替代不影响旧决定 (808.973458ms)
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (1893.064125ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (1904.721958ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (929.080417ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (402.007792ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (1759.549208ms)
✔ R08 真实 Review 分类与控制路由一致：technical (486.295791ms)
✔ R08 真实 Review 分类与控制路由一致：business (632.257083ms)
✔ R08 真实 Review 分类与控制路由一致：permission (618.852291ms)
✔ R08 真实 Review 分类与控制路由一致：mixed (603.830583ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (518.156625ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (656.199833ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (497.931ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (502.487416ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：technical (467.272042ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：permission (508.106792ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：business (493.000375ms)
✔ R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选 (431.593ms)
✔ R09 已接纳反馈消费前重新校验当前来源：session (502.687208ms)
✔ R09 已接纳反馈消费前重新校验当前来源：attempt (464.545166ms)
✔ R09 已接纳反馈消费前重新校验当前来源：plan (466.213458ms)
✔ R09 已接纳反馈消费前重新校验当前来源：owner (485.87575ms)
✔ R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权 (463.256291ms)
✔ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (503.883833ms)
✔ R09 已确认权限缺口优先于技术 handoff 策略 (450.191417ms)
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：permission (463.003208ms)
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：business (454.1955ms)
ℹ tests 146
ℹ suites 0
ℹ pass 139
ℹ fail 0
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 71659.480083

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.412834ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (6.207875ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.648417ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.344667ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.35125ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.627541ms)
✔ 决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示 (0.298041ms)
✔ 未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权 (0.159667ms)
✔ 新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留 (0.298333ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.263917ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.611792ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.128167ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.154584ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.348375ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.221875ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.106625ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.228208ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.159792ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.066542ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.070583ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.164542ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.135459ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.372334ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.079458ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 60.479792

````

## formal-model.log

````text
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.354708ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (4.01725ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.630666ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.763416ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (4.269792ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.970291ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.789084ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.691083ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.927375ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.385167ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.395167ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.318334ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.591375ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.400917ms)
✔ V2 计划拒绝未绑定的验证 ID (0.357667ms)
✔ V2 work task 必须绑定至少一个 required verification (0.48425ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.231583ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.305375ms)
✔ V2 计划拒绝任务依赖环 (0.526166ms)
✔ V2 计划拒绝空验证 argv (0.246583ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.214167ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (3.014667ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.128791ms)
✔ V2 计划拒绝字符串验证 argv (0.280792ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.045792ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.029542ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.097625ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.034666ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.056791ms)
✔ V2 计划拒绝 review 任务的 write (0.245625ms)
✔ V2 计划拒绝 verify 任务的 write (0.217958ms)
✔ V2 计划原样保留 done 验收文本 (0.4295ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.264084ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.603875ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.513333ms)
✔ 所有者范围支持目录范围和排除范围 (0.275042ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.176792ms)
✔ 计划拒绝循环和未知 Owner (0.079125ms)
✔ 计划拒绝所有者范围重叠 (0.166375ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.426792ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.296792ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.266958ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.564833ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.872375ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.830625ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.188208ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.075792ms)
✔ 计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段 (0.532834ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.229875ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.460792ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.81575ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 102.0555

````

## formal-owner-submission.log

````text
✔ owner_submit 顺序执行边界检查、固定验证和提交 (1.285417ms)
✔ Owner blocked 报告不会运行验证或提交 (0.120083ms)
✔ Owner needs_repair 留在当前子线程继续调整，不能制造脏现场恢复循环 (0.26175ms)
✔ 固定验证等待 Owner 现场授权时自动结算为 blocked，不依赖 Owner 模型猜测 (0.170375ms)
✔ 固定验证已经执行失败后拒绝 Owner 错报为 blocked (0.130125ms)
✔ 未获得可执行权限的验证结果仍允许 Owner 报告 blocked (0.078417ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.841333

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (1.144417ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (1.02575ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.067417ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (2.701958ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.48275ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (1.240917ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (0.439209ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 64.248834

````

## formal-plugin.log

````text
✖ 插件注册主编排工具、全局守卫和九个中文 Skill (2.037917ms)
✔ 决定回执工具仅允许主编排会话，所有子代理角色均被策略拒绝 (0.248ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.198542ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.100291ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.417125ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.195542ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.286792ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.11175ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.400792ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.53125ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.070125ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.275916ms)
✔ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (0.055208ms)
ℹ tests 13
ℹ suites 0
ℹ pass 12
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 106.231875

✖ failing tests:

test at owner-workflow-plugin/test/plugin.test.mjs:17:1
✖ 插件注册主编排工具、全局守卫和九个中文 Skill (2.037917ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'owner_execution_feedback'
  - 'owner_memory_note'
           ^
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/plugin.test.mjs:56:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.start (node:internal/test_runner/test:1003:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'owner_execution_feedback',
    expected: 'owner_memory_note',
    operator: 'strictEqual',
    diff: 'simple'
  }

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (1.540375ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.562125ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (14.97775ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (64.215708ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (48.17825ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (49.364458ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (48.156041ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (48.024041ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 331.805417

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (123.781041ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (357.340959ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (1859.135167ms)
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (594.865334ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (610.113958ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (444.607208ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (426.226458ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (360.871667ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (369.962375ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (365.778541ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (448.038584ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (328.470708ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (356.681ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (451.209375ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (866.228792ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.070583ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (207.987917ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (545.317833ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.108167ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.02475ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.016083ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.01575ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (351.284292ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (347.008709ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (233.442833ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1367.525292ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.065917ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.0175ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.012541ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.013375ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.012041ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (387.071833ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (389.694125ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.103667ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.020791ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.014792ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.015ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (671.545958ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (240.628375ms)
ℹ tests 39
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 12816.977375

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (1.571541ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.109834ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.207792ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.084416ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.072125ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.1045ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.065ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.110333ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.074792ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.1715ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (0.626875ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.7755

````

## review-direct-owner.log

````text
{
  "submitted": {
    "contract": "DSH_OWNER_SUBMISSION_V1",
    "status": "blocked",
    "summary": "Runtime 已接纳当前执行尝试的权限缺口：remote-ledger 缺少 read:ledger，阻断 读取指定账本；只能等待用户决定，不能继续提交或执行。",
    "accepted": true,
    "nextAction": "当前任务将返回主代理处理，不会进入验证、提交或合并。"
  }
}
owner exit: Owner 主动报告 blocked：Runtime 已接纳当前执行尝试的权限缺口：remote-ledger 缺少 read:ledger，阻断 读取指定账本；只能等待用户决定，不能继续提交或执行。
{
  "status": "blocked",
  "tasks": [
    {
      "taskId": "T1",
      "status": "stopped",
      "action": "await_user"
    },
    {
      "taskId": "T2",
      "status": "pending",
      "action": null
    }
  ],
  "recovery": {
    "contract": "DSH_AUTONOMOUS_RECOVERY_V1",
    "failureClass": "external_authority",
    "strategy": "request_user_authority",
    "message": "Owner 主动报告 blocked：Runtime 已接纳当前执行尝试的权限缺口：remote-ledger 缺少 read:ledger，阻断 读取指定账本；只能等待用户决定，不能继续提交或执行。",
    "evidenceDigest": "0541e3887b3c56813dbce24f46d05273466c87c3c56820cbde21f34760b00a04",
    "usedStrategies": [
      "request_user_authority"
    ],
    "fingerprint": "1401964b79ed056d99c07fbd9d8f28da9a8931531027312b53e43b69ae7926d0",
    "updatedAt": "2026-09-10T12:45:05.528Z"
  },
  "mainOutbox": {}
}

````

## 非原始stdout的观察记录 dev-f10-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09 首次|Reviewer 判定 needs_decision 后停止', 'owner-workflow-plugin/test/control.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-01-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09', 'owner-workflow-plugin/test/control.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-02-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09', 'owner-workflow-plugin/test/control.test.mjs', 'owner-workflow-plugin/test/plugin.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-03-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09 Owner 恢复|R09 执行反馈工具|R09 已接纳反馈消费前重新校验当前来源：owner', 'owner-workflow-plugin/test/control.test.mjs', 'owner-workflow-plugin/test/plugin.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-04-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09 Owner 恢复|R09 已确认权限', 'owner-workflow-plugin/test/control.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-05-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09 Owner 恢复|R09 已报告用户待决|R09 执行反馈工具', 'owner-workflow-plugin/test/control.test.mjs', 'owner-workflow-plugin/test/plugin.test.mjs']
````

## 非原始stdout的观察记录 dev-r09-control-06-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R09 已报告用户待决', 'owner-workflow-plugin/test/control.test.mjs']
````

## 非原始stdout的观察记录 review-direct-owner-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-09-261mulm1/review-direct-owner.probe.mjs']
固定候选只读诊断；提取现有夹具，使用真实 runExternalOwner/createOwnerEntry/runOwnerEntry/persistOwnerSession/feedback/submit/catch；仅 runChild 模拟模型执行。非正式测试计数。
exitCode=0
````

## 故障注入夹具 review-direct-owner.probe.mjs

````javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { apply as applyPlugin } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/index.js'
import {
  applyApprovedRegistryChange,
  ensureRegistry,
  loadRegistry,
  proposeRegistryChange,
} from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/registry.mjs'
import { createOwnerWorkflowRuntime } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs'
import { listBranches, statusRecords } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/git.mjs'
import { createTaskState } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/supervisor.mjs'
import { createPlanRevision } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/plan-revision.mjs'
import { normalizePlanV2 } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs'
import { deriveWorkflowControl } from '/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/workflow-state.mjs'

function reviewClosureContract(obligationId, kind, taskId = 'T1', authority = 'user') {
  return {
    obligationId,
    sourceId: `control/${obligationId}`,
    sourceVersion: '1',
    targetTaskIds: [taskId],
    closeWhen: { kind, taskId, ...(kind === 'decision_record' ? { authority } : {}) },
    ...(kind === 'decision_record' ? { classificationBasis: {
      source: { id: `control/${obligationId}`, version: '1' },
      technicalFacts: ['当前候选的决定尚未记录，原有执行边界保持。'],
      ...(authority === 'user' ? { businessCommitmentDelta: {
        currentCommitment: '仅执行已确认的现有方案',
        proposedCommitment: '采用待确认的方案 A',
        consequence: '改变当前候选向调用方提供的行为，需要明确选择。',
      } } : {}),
    } } : {}),
  }
}

const execFileAsync = promisify(execFile)
const EXTERNAL_RUNNER_PATH = fileURLToPath(new URL('/Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/external-runner.mjs', import.meta.url))

async function git(cwd, args) {
  await execFileAsync('git', args, { cwd, encoding: 'utf8' })
}

function addOwnerOperation(id = 'registry-owner') {
  return {
    type: 'add',
    owner: {
      id,
      name: `${id} 负责人`,
      description: `${id} 的职责`,
      scope: [`src/${id}/**`],
      exclude: [],
    },
    reason: `建立 ${id} 的正式职责`,
  }
}

function assertV2PlannerPrompt(prompt) {
  assert.equal(typeof prompt, 'string')
  assert.match(prompt, /DSH_PLAN_V2/u)
  assert.match(prompt, /registryDigest/u)
  assert.match(prompt, /verifications/u)
  assert.match(prompt, /tasks/u)
  assert.match(prompt, /代码责任域/u)
  assert.match(prompt, /当前 Workflow.*阶段/u)
  assert.match(prompt, /DAG task/u)
  assert.match(prompt, /\^\[a-z\]\[a-z0-9_-\]\{0,63\}\$/u)
  assert.match(prompt, /字段名必须是 run/u)
  assert.match(prompt, /禁止使用 argv/u)
  assert.match(prompt, /decomposition\.status 只允许 abstract、leaf、expanded/u)
  assert.match(prompt, /review 或 role=verify 的 task\.write 必须是空数组/u)
  assert.match(prompt, /所有 work 叶子必须至少绑定一个 verification|leaf work task 必须提供精确 write 与至少一个固定 verification/u)
  assert.match(prompt, /优先使用扁平 leaf DAG/u)
  assert.doesNotMatch(prompt, /DSH_PLAN_V1/u)
  assert.doesNotMatch(prompt, /\bstages\b/u)
  assert.doesNotMatch(prompt, /\bfiles\b/u)
  assert.doesNotMatch(prompt, /\bacceptance\b/u)
}

function canonicalDigestValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalDigestValue).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalDigestValue(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function registryContentDigest(registry) {
  return createHash('sha256').update(canonicalDigestValue(registry)).digest('hex')
}

async function applyRegistryOperation(worktree, registry, operation) {
  const proposal = proposeRegistryChange(registry, operation)
  return applyApprovedRegistryChange(worktree, { ...proposal, approvedDigest: proposal.digest })
}

async function registryWorkflowFixture(config = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owner-runtime-registry-'))
  const runtime = createOwnerWorkflowRuntime({}, config)
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), 'Registry 运行时测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化 Registry 运行时测试'])
  await runtime.prepareRoot(root)
  const id = 'wf-registry-runtime'
  const workflowBranch = `dsh/workflow/${id}`
  const workflowWorktree = join(root, '.dsh-workflow', 'worktrees', id, 'workflow')
  await git(root, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
  const registry = await ensureRegistry(workflowWorktree)
  const plan = {
    contract: 'DSH_PLAN_V1',
    summary: 'Registry 运行时测试计划',
    owners: [{ id: 'plan-owner', name: '计划 Owner', description: '旧计划职责', scope: ['README.md'], exclude: [] }],
    stages: [{ id: 'stage-1', name: '旧计划阶段', dependsOn: [], tasks: [{ id: 'task-1', ownerId: 'plan-owner', title: '旧计划任务', description: '旧计划任务', files: ['README.md'] }] }],
  }
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const agent = { id: 'registry-agent', session: { id: 'registry-agent', header: { cwd: root } } }
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id,
    root: await runtime.resolveRoot(agent),
    baseBranch: 'main',
    baseRef: 'main',
    workflowBranch,
    workflowWorktree,
    status: 'planned',
    plan,
    planDigest,
    registryDigest: registryContentDigest(registry),
    planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '旧计划已通过', issues: [] },
    planReviewDigest: planDigest,
    planApproved: true,
    planApprovedAt: new Date().toISOString(),
    planApprovedBy: 'registry-agent',
    completedStages: [],
    stageResults: [],
    ownerRuns: {},
    ownerSessions: {},
  }
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  return { root, runtime, agent, state }
}

async function planApprovalFixture(config = {}) {
  const fixture = await registryWorkflowFixture(config)
  const { root, state } = fixture
  let registry = await loadRegistry(state.workflowWorktree)
  registry = await applyRegistryOperation(state.workflowWorktree, registry, {
    type: 'add',
    owner: state.plan.owners[0],
    reason: '登记计划审批测试 Owner',
  })
  state.registryDigest = registryContentDigest(registry)
  state.planApproved = false
  state.planApprovedAt = undefined
  state.planApprovedBy = undefined
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${state.id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  return { ...fixture, registry }
}

async function closureReceiptFixture() {
  const fixture = await planApprovalFixture()
  const { root, state, agent } = fixture
  state.plan = normalizePlanV2({
    contract: 'DSH_PLAN_V2', registryDigest: state.registryDigest, summary: '关闭回执测试',
    owners: state.plan.owners,
    verifications: [{ id: 'unit', run: ['node', '--test'], cwd: '.' }],
    tasks: [{ id: 'T1', role: 'work', ownerId: state.plan.owners[0].id,
      title: '实现已决定的行为', dependsOn: [], write: ['README.md'], verify: ['unit'], done: ['行为验证通过'],
      decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: [state.plan.owners[0].id], unknowns: [] },
    }],
  })
  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  state.tasks = createTaskState(state.plan)
  state.planReview = undefined
  state.planReviewDigest = undefined
  state.orchestratorSessionId = agent.id
  state.conversationRootSessionId = agent.id
  const statePath = join(root, '.dsh-workflow', 'workflows', `${state.id}.json`)
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return { ...fixture, statePath }
}

function request(manifest, action, payload = {}) {
  return new Promise((resolveResponse, rejectResponse) => {
    const socket = createConnection(manifest.socketPath)
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({
        contract: 'DSH_WORKFLOW_CONTROL_V1',
        id: 'test-request',
        token: manifest.token,
        workflowId: manifest.workflowId,
        action,
        ...payload,
      })}\n`)
    })
    socket.on('data', chunk => {
      buffer += chunk
      const lineEnd = buffer.indexOf('\n')
      if (lineEnd < 0) return
      const response = JSON.parse(buffer.slice(0, lineEnd))
      socket.destroy()
      if (response.ok === true) resolveResponse(response.result)
      else rejectResponse(new Error(response.error))
    })
    socket.on('error', rejectResponse)
  })
}

async function waitForWorkflowState(path, predicate, label) {
  const deadline = Date.now() + 5_000
  let state
  while (Date.now() < deadline) {
    state = JSON.parse(await readFile(path, 'utf8'))
    if (predicate(state)) return state
    await delay(10)
  }
  throw new Error(`等待 workflow 状态超时：${label}；最后状态=${JSON.stringify(state)}`)
}

async function waitForCondition(predicate, label) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await delay(10)
  }
  throw new Error(`等待条件超时：${label}`)
}

async function removeFixtureRoot(root) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' || attempt === 4) throw error
      await delay(25 * (attempt + 1))
    }
  }
}

async function supervisorControlFixture({ materializeWorkflow = false, ctx = {}, config = {} } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-control-'))
  const runtime = createOwnerWorkflowRuntime(ctx, config)
  await git(root, ['init', '-b', 'main'])
  await git(root, ['config', 'user.email', 'owner-workflow@test.invalid'])
  await git(root, ['config', 'user.name', 'Owner Workflow Test'])
  await writeFile(join(root, 'README.md'), 'Supervisor 控制桥测试\n', 'utf8')
  await git(root, ['add', 'README.md'])
  await git(root, ['commit', '-m', '初始化 Supervisor 控制桥测试'])
  await runtime.prepareRoot(root)
  const plan = {
    contract: 'DSH_PLAN_V2',
    registryDigest: 'a'.repeat(64),
    summary: 'Supervisor 控制桥计划',
    owners: [{ id: 'api', name: 'API', description: 'API Owner', scope: ['src/api/**'], exclude: [] }],
    verifications: [{ id: 'unit', run: ['node', '--test'] }],
    tasks: [{
      id: 'T1',
      role: 'work',
      ownerId: 'api',
      title: '实现 API',
      dependsOn: [],
      write: ['src/api/t1.mjs'],
      verify: ['unit'],
      done: ['API 完成'],
    }],
  }
  const planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  const id = 'wf-supervisor-control'
  const agent = { id: 'supervisor-agent', session: { id: 'supervisor-agent', header: { cwd: root } } }
  const resolvedRoot = await runtime.resolveRoot(agent)
  const workflowBranch = `dsh/workflow/${id}`
  const workflowWorktree = materializeWorkflow
    ? join(resolvedRoot, '.dsh-workflow', 'worktrees', id, 'workflow')
    : resolvedRoot
  if (materializeWorkflow) {
    await mkdir(join(resolvedRoot, '.dsh-workflow', 'worktrees', id), { recursive: true })
    await git(resolvedRoot, ['worktree', 'add', '-b', workflowBranch, workflowWorktree, 'HEAD'])
  }
  const workflowHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: workflowWorktree,
    encoding: 'utf8',
  })).stdout.trim()
  const state = {
    contract: 'DSH_WORKFLOW_STATE_V1',
    id,
    root: resolvedRoot,
    baseBranch: 'main',
    baseRef: 'main',
    workflowBranch,
    workflowWorktree,
    status: 'approved',
    plan,
    planDigest,
    planReview: { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '通过', issues: [] },
    planReviewDigest: planDigest,
    planApproved: true,
    workflowHead,
    ownerRuns: {},
    ownerSessions: {},
  }
  await writeFile(
    join(root, '.dsh-workflow', 'workflows', `${id}.json`),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  )
  const manifest = await runtime.ensureControlBridge(agent, state)
  return {
    root,
    runtime,
    agent,
    state,
    manifest,
    statePath: join(root, '.dsh-workflow', 'workflows', `${id}.json`),
  }
}

async function preparePlanReviewRecoveryState(fixture) {
  let registry = await ensureRegistry(fixture.state.workflowWorktree)
  registry = await applyRegistryOperation(fixture.state.workflowWorktree, registry, {
    type: 'add',
    owner: fixture.state.plan.owners[0],
    reason: '登记计划审查恢复测试 Owner',
  })
  const registryDigest = registryContentDigest(registry)
  const owner = registry.owners.find(item => item.id === 'api')
  const plan = {
    ...fixture.state.plan,
    registryDigest,
    owners: [{
      id: owner.id,
      name: owner.name,
      description: owner.description,
      scope: [...owner.scope],
      exclude: [...owner.exclude],
    }],
  }
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  state.status = 'planned'
  state.plan = plan
  state.planDigest = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  delete state.registryDigest
  delete state.planReview
  delete state.planReviewDigest
  state.planApproved = false
  state.planningAgent = {
    childId: 'planner-recovery-child',
    phase: 'failed',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 30_000).toISOString(),
    error: '模拟计划审查驱动中断',
    recoveryAttempts: 0,
  }
  await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  return { state, registryDigest }
}

async function executionFeedbackFixture() {
  const fixture = await closureReceiptFixture()
  const { runtime, root, state, statePath } = fixture
  const registry = await applyRegistryOperation(state.workflowWorktree, await loadRegistry(state.workflowWorktree), addOwnerOperation('independent'))
  state.registryDigest = registryContentDigest(registry)
  const independent = registry.owners.find(owner => owner.id === 'independent')
  state.plan = normalizePlanV2({ ...state.plan, registryDigest: state.registryDigest,
    owners: [...state.plan.owners, independent],
    tasks: [...state.plan.tasks, { ...state.plan.tasks[0], id: 'T2', ownerId: 'independent', write: ['src/independent/value.mjs'], decomposition: { status: 'leaf', kind: 'leaf', ownerCandidates: ['independent'], unknowns: [] } }],
  })
  state.planDigest = createHash('sha256').update(JSON.stringify(state.plan)).digest('hex')
  state.planApproved = true
  state.planReview = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '当前计划通过', issues: [] }
  state.planReviewDigest = state.planDigest
  state.status = 'running'
  state.attempt = 1
  state.tasks = createTaskState(state.plan)
  const owner = state.plan.owners[0]
  const sessionId = 'r09-active-owner'
  const key = `T1:${owner.id}`
  state.tasks[0].status = 'running'
  state.tasks[0].executorId = sessionId
  state.ownerRuns[key] = { status: 'running', taskId: 'T1', stageId: 'T1', ownerId: owner.id, sessionId,
    attempt: 1, planDigest: state.planDigest, startedAt: '2026-09-10T12:10:00.000Z', worktree: state.workflowWorktree, branch: state.workflowBranch }
  state.supervisorOutbox = { [key]: { status: 'running', taskId: 'T1', ownerId: owner.id, attempts: 1 } }
  await writeFile(statePath, JSON.stringify(state), 'utf8')
  const acquired = await runtime.acquireOwnerLease(root, owner.id, state.id, 'T1')
  const active = { workflowRoot: state.root, workflowId: state.id, stageId: 'T1', owner, sessionId,
    worktree: state.workflowWorktree, lease: acquired.lease, state, stage: state.plan.tasks[0], attempt: 1, planDigest: state.planDigest,
    authority: { id: owner.id, name: owner.name, description: owner.description, scope: [...owner.scope], exclude: [...owner.exclude] } }
  runtime.activeOwners.set(sessionId, active)
  return { ...fixture, key, active, exec: { agent: { id: sessionId }, signal: undefined },
    async cleanup() { runtime.activeOwners.delete(sessionId); await runtime.releaseOwnerLease(acquired.lease); await runtime.dispose(); await rm(root, { recursive: true, force: true }) } }
}

function executionFeedback(mode = 'permission') {
  return { expected: '按现有合同读取指定账本', actual: '该执行环境无法读取指定账本',
    evidence: [{ kind: 'service_response', detail: 'remote-ledger 请求返回缺少 read:ledger 范围；本记录保留响应观察' }],
    technical_facts: ['当前任务需要读取指定账本；权限未在本轮任务中获得。'],
    ...(mode === 'permission' ? { external_permission_gap: { required_permission: 'read:ledger', target: 'remote-ledger', blocked_action: '读取指定账本' } } : {}),
    ...(mode === 'business' ? { business_commitment_delta: { current_commitment: '保留三十天', proposed_commitment: '保留七天', consequence: '第八天数据不可读取' } } : {}),
  }
}



const f=await executionFeedbackFixture();
try {
 f.runtime.activeOwners.delete(f.active.sessionId);await f.runtime.releaseOwnerLease(f.active.lease);
 const initial=JSON.parse(await readFile(f.statePath,'utf8'));initial.status='approved';initial.ownerRuns={};initial.supervisorOutbox={};initial.tasks=createTaskState(initial.plan);await writeFile(f.statePath,JSON.stringify(initial));
 f.runtime.runChild=async (_agent,_cwd,_prompt,_signal,options)=>{
  const active=options.activeOwner;if(!active)throw new Error('unexpected non-owner child');
  const sessionId='r09-direct-owner-probe';f.runtime.activeOwners.set(sessionId,active);await f.runtime.persistOwnerSession(active,sessionId);
  const exec={agent:{id:sessionId}};
  await f.runtime.recordOwnerExecutionDeviation(executionFeedback(),exec);
  const submitted=await f.runtime.submitOwnerResult({contract:'DSH_OWNER_RESULT_V1',status:'completed',summary:'声称完成',changes:[],tests:[],handoffs:[],memory_updates:[]},exec);
  console.log(JSON.stringify({submitted},null,2));return {...active.submission,sessionId};
 };
 try {await f.runtime.runExternalOwner(f.agent,f.state.id,'T1',f.active.owner.id,undefined,{deferFinish:true})}catch(error){console.log('owner exit: '+error.message)}
 const saved=JSON.parse(await readFile(f.statePath,'utf8'));console.log(JSON.stringify({status:saved.status,tasks:saved.tasks.map(t=>({taskId:t.taskId,status:t.status,action:t.action})),recovery:saved.ownerRuns[f.key]?.autonomousRecovery,mainOutbox:saved.mainOutbox??{}},null,2));
}finally{await f.cleanup();}

````
