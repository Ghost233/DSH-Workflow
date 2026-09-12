# 第 10 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-10-u3th4igz`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T12:49:44.101677+00:00",
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
    "owner-workflow-plugin/index.js": "e4b0cfc9d439b9dfe2c9cd27182a0d1b0b1232bfc7fb533397649a53906fb60d"
  },
  "repos": {
    ".": {
      "head": "154914064f5ceb2f8eb413865e10a54e8ffbc663\n",
      "branch": "main\n",
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "at": "2026-09-10T12:51:22.527607+00:00",
  "scope": "T-04 / AC-14: F12 direct Owner decision routing and compatibility",
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
    "owner-workflow-plugin/src/runtime.mjs": "962fdf8b259b80add94dd8fedeac4cc83e5a0485445990a6356b7774b9f63298",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "78a07ec8b5d0ff312c91d64feeed413e7734f4b714324f27c6e6ddc7866ceb77",
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
    "owner-workflow-plugin/test/control.test.mjs": "63259e71b6c7bbabf517ed387c891303b5f8e8b456fbf1a7f7fae6fb590a97be",
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
    "owner-workflow-plugin/index.js": "460fac92044786329bb8d4d686c2ad8ee4ee7c0ce99ecc27b8ee00591eba1aa5",
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
@@ -1615,9 +1615,9 @@

   ctx.tools.register(toolDefinition(ctx, runtime))
   ctx.tools.register(ownerSubmitDefinition(runtime))
-  ctx.tools.register(ownerExecutionFeedbackDefinition(runtime))
   ctx.tools.register(ownerMemoryNoteDefinition(runtime))
   ctx.tools.register(ownerHostExecDefinition(runtime))
+  ctx.tools.register(ownerExecutionFeedbackDefinition(runtime))
   ctx.tools.register(requestSubgraphDefinition(runtime))
   ctx.tools.register(requestHandoffDefinition(runtime))
   for (const definition of workflowToolDefinitions(ctx, runtime)) ctx.tools.register(definition)
--- before/owner-workflow-plugin/src/agent-policy.mjs
+++ candidate/owner-workflow-plugin/src/agent-policy.mjs
@@ -50,15 +50,6 @@
   'subagent_acp',
   'subagent_codex',
   'subagent_claude_code',
-])
-
-const OWNER_ONLY_TOOLS = new Set([
-  'owner_submit',
-  'owner_execution_feedback',
-  'owner_memory_note',
-  'owner_host_exec',
-  'request_subgraph',
-  'request_handoff',
 ])

 const SEARCH_BREAKER_ROLES = new Set(['owner', 'planner', 'plan-reviewer', 'reviewer', 'operator'])
@@ -183,7 +174,7 @@
     }
     return undefined
   }
-  if (OWNER_ONLY_TOOLS.has(toolName)) {
+  if (toolName === 'owner_execution_feedback') {
     return `${toolName} 只能由当前 active Owner 子代理调用`
   }
   if (role !== undefined) {
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -12347,7 +12347,9 @@
               failureClass: classified.class,
               usedStrategies: latest.ownerRuns[key]?.autonomousRecovery?.usedStrategies ?? [],
             })
-            const requiresMainDecision = !blocked && recoveryStrategy === 'request_user_authority'
+            // A noncompleted Owner receipt is a transport outcome, not a
+            // reason to discard its current structured decision classification.
+            const requiresMainDecision = recoveryStrategy === 'request_user_authority'
             const autonomousRecovery = {
               contract: 'DSH_AUTONOMOUS_RECOVERY_V1',
               failureClass: classified.class,
@@ -12400,8 +12402,8 @@
             }
             await runtime.assertOwnerLease(acquiredLease.lease)
             await saveState(runtime, latest, acquiredLease.lease)
-            await appendLog(runtime, root, workflowId, blocked ? 'workflow.blocked' : 'workflow.failed', {
-              summary: latest.error,
+            await appendLog(runtime, root, workflowId, requiresMainDecision ? 'owner.authority-required' : blocked ? 'workflow.blocked' : 'workflow.failed', {
+              summary: requiresMainDecision ? errorText(error) : latest.error,
               handoffs,
             })
           })
--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -7337,3 +7337,58 @@
     assert.equal(saved.tasks[1].status, 'pending')
   } finally { await f.cleanup() }
 })
+
+
+for (const mode of ['permission-blocked', 'permission-failed', 'business-blocked', 'legacy-blocked']) test(`R10 真实 Owner 非成功结算保留分类与局部待决：${mode}`, async () => {
+  const f = await executionFeedbackFixture()
+  try {
+    f.runtime.activeOwners.delete(f.active.sessionId)
+    await f.runtime.releaseOwnerLease(f.active.lease)
+    const initial = JSON.parse(await readFile(f.statePath, 'utf8'))
+    initial.status = 'approved'
+    initial.ownerRuns = {}
+    initial.supervisorOutbox = {}
+    initial.tasks = createTaskState(initial.plan)
+    await writeFile(f.statePath, JSON.stringify(initial))
+    let receipt
+    f.runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
+      const active = options.activeOwner
+      assert.ok(active, '只模拟模型回合，运行真实 Owner 生命周期')
+      const sessionId = 'r10-direct-owner'
+      f.runtime.activeOwners.set(sessionId, active)
+      await f.runtime.persistOwnerSession(active, sessionId)
+      const exec = { agent: { id: sessionId } }
+      if (mode !== 'legacy-blocked') await f.runtime.recordOwnerExecutionDeviation(executionFeedback(mode.startsWith('business') ? 'business' : 'permission'), exec)
+      if (mode === 'permission-failed') active.verificationResults = { unit: { passed: false, exitCode: 1, enforcement: 'full' } }
+      receipt = await f.runtime.submitOwnerResult({ contract: 'DSH_OWNER_RESULT_V1', status: mode === 'legacy-blocked' ? 'blocked' : 'completed', summary: '模型回报', changes: [], tests: [], handoffs: [], memory_updates: [] }, exec)
+      return { ...active.submission, sessionId }
+    }
+    await assert.rejects(f.runtime.runExternalOwner(f.agent, f.state.id, 'T1', f.active.owner.id, undefined, { deferFinish: true }), /Owner 主动报告/)
+    assert.equal(receipt.status, mode === 'permission-failed' ? 'failed' : 'blocked')
+    const saved = JSON.parse(await readFile(f.statePath, 'utf8'))
+    assert.equal(saved.tasks[0].action, 'await_user')
+    assert.equal(saved.tasks[1].status, 'pending')
+    assert.equal(saved.ownerRuns[f.key].result, undefined, '未生成提交结果')
+    if (mode === 'legacy-blocked') {
+      assert.equal(saved.status, 'blocked')
+      assert.equal(Object.keys(saved.mainOutbox ?? {}).length, 0)
+    } else {
+      assert.equal(saved.status, 'running')
+      assert.equal(saved.ownerRuns[f.key].autonomousRecovery.strategy, 'request_user_authority')
+      const pending = Object.values(saved.mainOutbox ?? {})
+      assert.equal(pending.length, 1)
+      assert.equal(pending[0].reason, 'execution_authority_required')
+      assert.equal(pending[0].taskId, 'T1')
+      assert.equal(pending[0].deviationId, saved.ownerRuns[f.key].executionDeviation.deviationId)
+      const delivered = []
+      f.agent.followup = message => delivered.push(JSON.parse(message.content[0].text))
+      await f.runtime.deliverMainOutbox(f.agent, f.state.id, pending[0].notificationId)
+      assert.equal(delivered.length, 1)
+      assert.deepEqual(delivered[0].classificationBasis, saved.ownerRuns[f.key].executionDeviation.classificationBasis)
+      const manifest = await f.runtime.ensureControlBridge(f.agent, saved)
+      const next = await request(manifest, 'supervisor-next')
+      assert.equal(next.action, 'create')
+      assert.deepEqual(next.tasks.map(task => task.taskId), ['T2'])
+    }
+  } finally { await f.cleanup() }
+})

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T12:51:22.527607+00:00",
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
      "start": "2026-09-10T12:51:22.602272+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:51:22.690653+00:00",
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
      "start": "2026-09-10T12:51:22.691428+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:51:22.817393+00:00",
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
      "start": "2026-09-10T12:51:22.818262+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:37.696007+00:00",
      "counts": {
        "tests": 150,
        "pass": 143,
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
      "start": "2026-09-10T12:52:37.697109+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:51.635263+00:00",
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
      "start": "2026-09-10T12:52:51.635955+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:51.723271+00:00",
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
      "start": "2026-09-10T12:52:51.724069+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:51.798795+00:00",
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
      "start": "2026-09-10T12:52:51.799631+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:52.211259+00:00",
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
      "start": "2026-09-10T12:52:52.212337+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:52.355856+00:00",
      "counts": {
        "tests": 13,
        "pass": 13,
        "fail": 0,
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
      "start": "2026-09-10T12:52:52.356628+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:52.428250+00:00",
      "counts": {
        "tests": 4,
        "pass": 4,
        "fail": 0,
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
      "start": "2026-09-10T12:52:52.429408+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T12:52:52.506763+00:00",
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
  "at": "2026-09-10T12:54:40.122447+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-09/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-10/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-10/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md": "98856cf9e8f7add832badb3a1d7a8b6f3108531fdf9a616cd0e553dade994a51"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-10-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-04 / AC-14: F12 direct Owner decision routing and compatibility','hashes':hashes()}
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

## dev.log

````text
✔ 主代理禁止直接开发，Owner 和 Operator 不使用工具白名单 (0.758917ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：permission-blocked (845.667917ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：permission-failed (819.498125ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：business-blocked (776.453958ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：legacy-blocked (765.861375ms)
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (2.848958ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3326.095917

````

## formal-agent-policy.log

````text
✔ 子代理继承完整工具集，角色只决定文件沙箱模式 (1.79625ms)
✔ Planner 与 Reviewer 隐藏无效升级字段，并对同一失败搜索执行有界熔断 (0.463166ms)
✔ Operator 的重复搜索同样使用成功缓存和两次失败熔断 (0.48625ms)
✔ 主代理禁止直接开发，Owner 和 Operator 不使用工具白名单 (0.396834ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.369

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (162.097333ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (647.380708ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (396.3965ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (362.439417ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (410.107125ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (344.957375ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (182.645625ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (282.862584ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (207.083458ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (391.056917ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (361.291ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (349.371875ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.326459ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (420.495834ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (371.595208ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.540292ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (521.652708ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (505.067375ms)
✔ 自治事故的摘要型旧义务不能由 control socket probe 续期 (196.093917ms)
✔ control socket probe 只为类型化义务的宿主新文件续期一次 (461.536417ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (538.433625ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (375.03425ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (376.857625ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (335.172834ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (337.123625ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (382.992417ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (416.652834ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (256.611709ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (236.806458ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.504583ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1279.703792ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (301.8555ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (316.830917ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (304.541875ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (348.783834ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (194.767375ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (267.129458ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (450.449ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (317.615917ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (288.993458ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (282.509583ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (236.711167ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (287.366042ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (673.446041ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (524.234166ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (220.101541ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (368.736667ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (143.366ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (145.678334ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (182.11575ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (0.757875ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.154291ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.221ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (547.47475ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (551.981ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (615.355208ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (143.26425ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (461.381667ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (528.437167ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (1046.335167ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (435.956ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (644.538417ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.110833ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.02375ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.01675ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.013875ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.013959ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.012667ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (294.168917ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (796.301583ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (451.863666ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (452.842042ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (474.151875ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.378875ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.863916ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.2255ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (451.297792ms)
✔ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (466.24125ms)
✔ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (628.509958ms)
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (580.028084ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1750.489417ms)
✔ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (471.742709ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (409.714792ms)
✔ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (412.723542ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1196.433833ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (688.055292ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (491.298291ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (350.783375ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1612.762125ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (23.524708ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (18.612458ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.048ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (4953.456167ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1863.731458ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (1009.938208ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1286.57975ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (459.756875ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (564.180291ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (492.5275ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (515.768958ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (401.592458ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (720.157709ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (1009.3715ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (307.31875ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (162.9665ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (126.340375ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (123.731583ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (317.49475ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (128.962583ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (121.205ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (126.107625ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (333.905375ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.45275ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (730.0215ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (831.133708ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (895.315959ms)
✔ R05 用户确认期间义务版本变化时不记录过期决定 (490.254292ms)
✔ R05 结构展开依据经 Runtime 消费，只关闭结构义务而保留业务验证 (639.873875ms)
✔ R05 pending 候选决定不能借用 active 回执，旧快照不能消费已变化候选 (584.197125ms)
✔ R05 同候选的新决定替代旧回执，取消替代不影响旧决定 (801.441791ms)
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (1883.598708ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (1913.982791ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (890.706875ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (403.989833ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (1832.439917ms)
✔ R08 真实 Review 分类与控制路由一致：technical (502.460459ms)
✔ R08 真实 Review 分类与控制路由一致：business (672.536042ms)
✔ R08 真实 Review 分类与控制路由一致：permission (613.059958ms)
✔ R08 真实 Review 分类与控制路由一致：mixed (627.558583ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：permission (504.874ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：business (643.979667ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-decision (506.649291ms)
✔ R09 首次待决问题来自冻结用户义务而非 Reviewer 自由文本：mixed-verification (572.139916ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：technical (526.082166ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：permission (497.883083ms)
✔ R09 Owner 反馈经实际失败入口分类且保留独立任务：business (493.594666ms)
✔ R09 Owner 反馈接纳拒绝伪造绑定、无依据、外来会话和过期候选 (433.453792ms)
✔ R09 已接纳反馈消费前重新校验当前来源：session (454.981292ms)
✔ R09 已接纳反馈消费前重新校验当前来源：attempt (461.706833ms)
✔ R09 已接纳反馈消费前重新校验当前来源：plan (451.339625ms)
✔ R09 已接纳反馈消费前重新校验当前来源：owner (457.730208ms)
✔ R09 同 attempt 的用户反馈幂等保留，不能由后续技术描述降权 (458.283583ms)
✔ R09 Owner 恢复消费当前反馈，换 attempt 后不继承旧用户门禁 (486.809417ms)
✔ R09 已确认权限缺口优先于技术 handoff 策略 (440.495333ms)
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：permission (451.137542ms)
✔ R09 已报告用户待决后不能通过 completed 提交越过门禁：business (461.801667ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：permission-blocked (786.55075ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：permission-failed (797.827208ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：business-blocked (801.492416ms)
✔ R10 真实 Owner 非成功结算保留分类与局部待决：legacy-blocked (727.483041ms)
ℹ tests 150
ℹ suites 0
ℹ pass 143
ℹ fail 0
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 74851.742

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.116625ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (5.933833ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.475708ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.092583ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.31125ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.574417ms)
✔ 决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示 (0.300834ms)
✔ 未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权 (0.164041ms)
✔ 新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留 (0.611833ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.29675ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.288334ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.334708ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.146583ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.255375ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.203958ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.09775ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.231625ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.158416ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.064417ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.071709ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.161708ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.149292ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.371459ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.058709ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62.070625

````

## formal-model.log

````text
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.539167ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (3.965833ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.677042ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.753958ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.065125ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.702375ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.144875ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.663416ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.4085ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.268166ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.65225ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.448792ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.600792ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.37575ms)
✔ V2 计划拒绝未绑定的验证 ID (0.310166ms)
✔ V2 work task 必须绑定至少一个 required verification (0.54625ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.288833ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.317834ms)
✔ V2 计划拒绝任务依赖环 (0.518458ms)
✔ V2 计划拒绝空验证 argv (0.2355ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.22625ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (3.106584ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.163209ms)
✔ V2 计划拒绝字符串验证 argv (0.291708ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.043625ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.030916ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.098375ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.033709ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.058167ms)
✔ V2 计划拒绝 review 任务的 write (0.23375ms)
✔ V2 计划拒绝 verify 任务的 write (0.218167ms)
✔ V2 计划原样保留 done 验收文本 (0.318ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.243ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.578833ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.455833ms)
✔ 所有者范围支持目录范围和排除范围 (0.254167ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.196208ms)
✔ 计划拒绝循环和未知 Owner (0.06675ms)
✔ 计划拒绝所有者范围重叠 (0.187583ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.438625ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.273625ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.167834ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.588958ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.742208ms)
✔ 规划和所有者结果契约未知时按关闭处理 (1.391292ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.209333ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.079083ms)
✔ 计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段 (0.468416ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.246708ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.377125ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.2115ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.356041

````

## formal-owner-submission.log

````text
✔ owner_submit 顺序执行边界检查、固定验证和提交 (1.109958ms)
✔ Owner blocked 报告不会运行验证或提交 (0.156708ms)
✔ Owner needs_repair 留在当前子线程继续调整，不能制造脏现场恢复循环 (0.45475ms)
✔ 固定验证等待 Owner 现场授权时自动结算为 blocked，不依赖 Owner 模型猜测 (0.276ms)
✔ 固定验证已经执行失败后拒绝 Owner 错报为 blocked (0.175542ms)
✔ 未获得可执行权限的验证结果仍允许 Owner 报告 blocked (0.106625ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.995583

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (0.7855ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (0.845458ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.070917ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (2.228667ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.593666ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (0.82975ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (0.239125ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 54.424541

````

## formal-plugin.log

````text
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (2.016459ms)
✔ 决定回执工具仅允许主编排会话，所有子代理角色均被策略拒绝 (0.225417ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.182666ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.092666ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.401042ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.179083ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.282792ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.107417ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.266833ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.913541ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.098958ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.368792ms)
✔ R09 执行反馈工具拒绝主编排和只读角色，不能冒充活动 Owner (0.09225ms)
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 114.045292

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (1.24625ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.2765ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (14.903209ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (91.8385ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (54.897542ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (54.769208ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (52.67925ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (54.256167ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 384.978041

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (116.802ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (353.768083ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (2511.855667ms)
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (719.085458ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (635.985416ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (441.735459ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (420.853041ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (344.08925ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (361.180833ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (384.6305ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (450.337833ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (331.639375ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (346.471709ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (460.12025ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (889.919875ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.113708ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (210.160792ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (539.460917ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.070333ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.018458ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.013958ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.013584ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (340.022125ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (344.638166ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (234.87275ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1446.750417ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.099292ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.021292ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.017375ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.016083ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.014ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (442.448625ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (519.92075ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.087041ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.021958ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.077708ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.060666ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (690.333792ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (256.35ms)
ℹ tests 39
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 13907.947708

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (1.336292ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.722916ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.123708ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.07175ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.075041ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.104916ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.072416ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.09675ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.071875ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.188375ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (0.948167ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.245541

````

## 非原始stdout的观察记录 dev-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R10|插件注册主编排工具|主代理禁止直接开发', 'owner-workflow-plugin/test/control.test.mjs', 'owner-workflow-plugin/test/plugin.test.mjs', 'owner-workflow-plugin/test/agent-policy.test.mjs']
````
