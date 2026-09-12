# 第 8 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-08-arouonyy`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T11:42:49.809182+00:00",
  "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
  "files": {
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
    "owner-workflow-plugin/src/runtime.mjs": "966bc1c288f5a3d6d51bf7cdfe5c82d7672cc92b6f9b9232cc9ad403e10111bb",
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
    "owner-workflow-plugin/test/control.test.mjs": "44c05a5a980900f4500917372a662ca2e238123aac145ca5f480f03483886fcf",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "0cd9323e12d12983ae685f86e33d18d47b5685bdccd3640011ad4908b49df350",
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
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/124ceb79a610b47a9a7a3be6b3536a09575a98a1\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/145932e9003280cc00e35aad27a454c7de631dae\n57957d4e3613e12c94dbabf53d71f8a38e1adc67 refs/codex/snapshots/3b7681c524894932211b3d5c8b856f0e8ce39ee8\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/522872f6f5d368613af38d2e850d7a47c09886a6\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/8968d9303acd61a9d94fa49bedf4414766ef8894\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9957e186462ead56c4d7c086172b3921ead7b9ef\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9e58f2c8f0a635f2ba9bc1cb1e53e71baf490999\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/bc7ad8378ff8254e5a02f34236c34b834e09b8dd\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/ca05fdb36608106818494992534623b5e5c46ff6\n2486ff43af4afc7e0a78e0efcaac16144d1717a3 refs/codex/snapshots/ce7a59b6cd6cc8ae829dc186ea6ca794baf87114\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/d6203a184745fc8fea16694ed91f9566c79c2ed6\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/e21a79e9773ad39feffe4f24d23cfb8851572d49\n02aa692759cd453373fb1e99452d1fa9a58ed8a5 refs/codex/turn-diffs/captures/1789040530741/d235c46e-70e6-4068-bdf7-a7779dd242e0/base\n02aa692759cd453373fb1e99452d1fa9a58ed8a5 refs/codex/turn-diffs/checkpoints/1b6907baba28859fbba259bcecaef77c5ac146000793515606e4ded7be9a97aa/f7b1a98db4d5c831995a7e3e64c79af7de8bc8c9f6b62557be489baae59a0388/1789040526223/66537a14-c4aa-46ee-8320-da32042ef408\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/heads/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/heads/main\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/HEAD\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/remotes/origin/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/main\n"
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
  "at": "2026-09-10T11:55:53.330101+00:00",
  "scope": "T-04 / AC-14: structured authority classification",
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
@@ -11,7 +11,7 @@
   'alternate_implementation',
 ])

-const AUTHORITY_PATTERN = /(?:用户|人工|授权|凭据|密钥|secret|token|真实设备|真实钱包|真实外部服务|付费|费用|生产|发布|上线|不可逆|删除外部|外部账户|产品选择|业务选择)/iu
+const AUTHORITY_HINT_PATTERN = /(?:用户|人工|授权|凭据|密钥|secret|token|真实设备|真实钱包|真实外部服务|付费|费用|生产|发布|上线|不可逆|删除外部|外部账户|产品选择|业务选择)/iu

 function canonical(value) {
   if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
@@ -51,12 +51,107 @@
   if (/(?:dependsOn|依赖顺序|环|前置|dag|子图|叶子|拆分|抽象|abstract|composite|decomposition|渐进式|混合.*结果)/iu.test(text)) return 'dag-structure'
   if (/(?:完成条件|验收|行为测试|覆盖不足|无法证明)/iu.test(text)) return 'acceptance-evidence'
   if (/(?:事实|调查|discovery|未知|无法查明)/iu.test(text)) return 'discovery'
-  if (AUTHORITY_PATTERN.test(text)) return 'external-authority'
   return 'review-issue'
 }

 function nonEmptyText(value) {
   return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
+}
+
+function plainRecord(value) {
+  return value !== null && typeof value === 'object' && !Array.isArray(value)
+}
+
+function classificationTextList(value) {
+  if (!Array.isArray(value)) return undefined
+  const items = [...new Set(value.map(nonEmptyText).filter(Boolean))]
+  return items.length > 0 ? items : undefined
+}
+
+function exactRecord(value, keys) {
+  return plainRecord(value) && Object.keys(value).every(key => keys.includes(key))
+}
+
+function normalizeDecisionClassificationBasis(value, source, field) {
+  if (value === undefined) return undefined
+  if (!exactRecord(value, ['source', 'technicalFacts', 'businessCommitmentDelta', 'externalPermissionGap'])) {
+    throw new Error(`${field} 必须是只包含 source、technicalFacts、businessCommitmentDelta、externalPermissionGap 的对象`)
+  }
+  if (!exactRecord(value.source, ['id', 'version'])) {
+    throw new Error(`${field}.source 必须是只包含 id 与 version 的对象`)
+  }
+  const basisSource = {
+    id: nonEmptyText(value.source.id),
+    version: nonEmptyText(value.source.version),
+  }
+  if (basisSource.id === undefined || basisSource.version === undefined
+    || basisSource.id !== source?.id || basisSource.version !== source?.version) {
+    throw new Error(`${field}.source 必须与 obligation sourceId/sourceVersion 一致`)
+  }
+  const technicalFacts = classificationTextList(value.technicalFacts)
+  if (technicalFacts === undefined) throw new Error(`${field}.technicalFacts 必须是非空技术事实数组`)
+  let businessCommitmentDelta
+  if (value.businessCommitmentDelta !== undefined) {
+    const raw = value.businessCommitmentDelta
+    if (!exactRecord(raw, ['currentCommitment', 'proposedCommitment', 'consequence'])) {
+      throw new Error(`${field}.businessCommitmentDelta 必须是完整的业务承诺差异`)
+    }
+    const currentCommitment = nonEmptyText(raw.currentCommitment)
+    const proposedCommitment = nonEmptyText(raw.proposedCommitment)
+    const consequence = nonEmptyText(raw.consequence)
+    if (currentCommitment === undefined || proposedCommitment === undefined || consequence === undefined) {
+      throw new Error(`${field}.businessCommitmentDelta 必须提供当前承诺、拟议承诺和后果`)
+    }
+    if (currentCommitment === proposedCommitment) {
+      throw new Error(`${field}.businessCommitmentDelta 当前承诺必须与拟议承诺不同`)
+    }
+    businessCommitmentDelta = { currentCommitment, proposedCommitment, consequence }
+  }
+  let externalPermissionGap
+  if (value.externalPermissionGap !== undefined) {
+    const raw = value.externalPermissionGap
+    if (!exactRecord(raw, ['requiredPermission', 'target', 'blockedAction'])) {
+      throw new Error(`${field}.externalPermissionGap 必须是完整的外部权限缺口`)
+    }
+    const requiredPermission = nonEmptyText(raw.requiredPermission)
+    const target = nonEmptyText(raw.target)
+    const blockedAction = nonEmptyText(raw.blockedAction)
+    if (requiredPermission === undefined || target === undefined || blockedAction === undefined) {
+      throw new Error(`${field}.externalPermissionGap 必须提供权限、目标和受阻动作`)
+    }
+    externalPermissionGap = { requiredPermission, target, blockedAction }
+  }
+  return {
+    source: basisSource,
+    technicalFacts,
+    ...(businessCommitmentDelta === undefined ? {} : { businessCommitmentDelta }),
+    ...(externalPermissionGap === undefined ? {} : { externalPermissionGap }),
+  }
+}
+
+function classificationRequiresUserAuthority(basis) {
+  return basis?.businessCommitmentDelta !== undefined || basis?.externalPermissionGap !== undefined
+}
+
+function decisionRecordClassification({ closeWhen, classificationBasis, source, field, allowLegacyObligations }) {
+  if (closeWhen?.kind !== 'decision_record') return undefined
+  const basis = normalizeDecisionClassificationBasis(classificationBasis, source, `${field}.classificationBasis`)
+  if (basis === undefined) {
+    if (!allowLegacyObligations) throw new Error(`${field} 新 decision_record 义务必须提供 classificationBasis`)
+    return { authorityRequired: closeWhen.authority === 'user', kind: 'legacy_unclassified', basis: undefined }
+  }
+  const authorityRequired = classificationRequiresUserAuthority(basis)
+  const expectedAuthority = authorityRequired ? 'user' : 'orchestrator'
+  if (closeWhen.authority !== expectedAuthority) {
+    throw new Error(`${field}.closeWhen.authority 与 classificationBasis 的${authorityRequired ? '业务承诺或外部权限' : '技术事实'}分类冲突`)
+  }
+  return {
+    authorityRequired,
+    kind: authorityRequired
+      ? basis.externalPermissionGap !== undefined ? 'external_permission_gap' : 'business_commitment_delta'
+      : 'technical',
+    basis,
+  }
 }

 function obligationTargets(issue, review) {
@@ -158,6 +253,19 @@
   const title = String(issue?.title ?? '').trim()
   const source = obligationSource(issue, review, { allowLegacyObligations })
   const closeWhen = normalizeCloseWhen(issue?.closeWhen, targets, { allowLegacyObligations })
+  const declaredBasis = issue?.classificationBasis === undefined
+    ? undefined
+    : normalizeDecisionClassificationBasis(issue.classificationBasis, { id: source.id, version: source.version }, '审查义务.classificationBasis')
+  if (classificationRequiresUserAuthority(declaredBasis) && closeWhen.kind !== 'decision_record') {
+    throw new Error('审查义务 的业务承诺或外部权限分类必须使用 decision_record authority=user')
+  }
+  const classification = decisionRecordClassification({
+    closeWhen,
+    classificationBasis: declaredBasis,
+    source: { id: source.id, version: source.version },
+    field: '审查义务',
+    allowLegacyObligations,
+  })
   const identity = { source, targetTaskIds: targets, closeWhen }
   return {
     id: source.declaredId ?? digest(identity),
@@ -169,6 +277,8 @@
     suggestion: String(issue?.suggestion ?? '').trim(),
     source: { id: source.id, version: source.version },
     targetTaskIds: targets,
+    ...(classification?.basis === undefined ? {} : { classificationBasis: classification.basis }),
+    ...(classification === undefined ? {} : { decisionClassification: classification.kind }),
     closeWhen,
     status: 'open',
   }
@@ -220,7 +330,10 @@
     }
     return (review.decisionQuestions ?? []).map(question => ({
       id: digest(['decision', String(question)]),
-      category: AUTHORITY_PATTERN.test(String(question)) ? 'external-authority' : 'architecture-decision',
+      // Historical free text is unresolved but is never evidence that an
+      // external user authorization exists.  Only an explicit persisted
+      // decision_record authority=user remains a conservative human gate.
+      category: 'legacy-decision-unclassified',
       severity: 'high',
       title: String(question),
       detail: String(question),
@@ -709,17 +822,73 @@
   return preferred.find(strategy => !used.includes(strategy)) ?? 'autonomous_incident'
 }

-export function reviewRequiresUserAuthority(review) {
-  if (review?.status !== 'needs_decision') return false
-  if ((review.issues ?? []).some(issue => (
-    issue?.closeWhen?.kind === 'decision_record' && issue.closeWhen.authority === 'user'
-  ))) return true
-  const questions = review.decisionQuestions ?? []
-  // A mixed decision batch must stop as soon as any question needs external
-  // authority. Requiring every question to match allowed an architecture
-  // sub-question to hide real-wallet / production choices in the same batch,
-  // after which the autonomous driver tried to revise an unresolved decision.
-  return questions.length > 0 && questions.some(question => AUTHORITY_PATTERN.test(String(question)))
+function decisionClassificationDiagnostic(record, scope) {
+  const closeWhen = record?.closeWhen
+  if (closeWhen?.kind !== 'decision_record') return undefined
+  const source = record?.source ?? {
+    id: record?.sourceId,
+    version: record?.sourceVersion,
+  }
+  let basis
+  let integrity = 'structured'
+  try {
+    basis = normalizeDecisionClassificationBasis(record?.classificationBasis, source, `${scope} decision_record`)
+  } catch (error) {
+    // Strict submissions are rejected by reviewIssueObligation/model.  This
+    // branch reads already-persisted or hand-assembled state defensively: a
+    // malformed asserted business ground must not downgrade a human gate.
+    integrity = 'invalid_basis'
+  }
+  const text = `${record?.title ?? ''}\n${record?.detail ?? ''}\n${record?.suggestion ?? ''}`
+  const basisRequiresUser = classificationRequiresUserAuthority(basis)
+  const explicitUser = closeWhen.authority === 'user'
+  const malformedBasisClaimsAuthority = integrity === 'invalid_basis'
+    && plainRecord(record?.classificationBasis)
+    && (record.classificationBasis.businessCommitmentDelta !== undefined
+      || record.classificationBasis.externalPermissionGap !== undefined)
+  const authorityRequired = explicitUser || basisRequiresUser || malformedBasisClaimsAuthority
+  return {
+    obligationId: record?.id ?? record?.obligationId,
+    scope,
+    authorityRequired,
+    classification: basis === undefined
+      ? explicitUser ? 'legacy_explicit_user_authority' : 'legacy_unclassified'
+      : basisRequiresUser
+        ? basis.externalPermissionGap === undefined ? 'business_commitment_delta' : 'external_permission_gap'
+        : 'technical',
+    integrity,
+    keywordHint: AUTHORITY_HINT_PATTERN.test(text),
+    ...(basis === undefined ? {} : { basis }),
+  }
+}
+
+/**
+ * Returns a projection of authority facts.  Textual words such as 用户 or
+ * token are retained only as diagnostics; they never grant user authority.
+ * Open persisted obligations are deliberately considered even when a newer
+ * Reviewer omits them or changes its status to `passed`.
+ */
+export function reviewDecisionClassification(review, { obligations = [] } = {}) {
+  const classifications = []
+  for (const obligation of obligations) {
+    if (obligation?.status !== 'open') continue
+    const classification = decisionClassificationDiagnostic(obligation, 'persisted_open_obligation')
+    if (classification !== undefined) classifications.push(classification)
+  }
+  if (review?.status === 'needs_decision') {
+    for (const issue of review.issues ?? []) {
+      const classification = decisionClassificationDiagnostic(issue, 'submitted_review')
+      if (classification !== undefined) classifications.push(classification)
+    }
+  }
+  return {
+    authorityRequired: classifications.some(item => item.authorityRequired),
+    classifications,
+  }
+}
+
+export function reviewRequiresUserAuthority(review, options = {}) {
+  return reviewDecisionClassification(review, options).authorityRequired
 }

 export function reconcileReviewConvergence({ previous, candidate, review, evidenceDigest, time, runtimeEvidence, allowLegacyObligations = false }) {
@@ -845,7 +1014,8 @@
   const renewalRecords = strategyRenewals(baseline?.localStrategyRenewals)
   const renewal = baseline === undefined ? undefined : renewalForEvidence(newEvidence, time)
   if (renewal !== undefined && !renewalRecords.some(item => item.id === renewal.id)) renewalRecords.push(renewal)
-  const authorityRequired = reviewRequiresUserAuthority(review)
+  const authorityClassification = reviewDecisionClassification(review, { obligations: openObligations })
+  const authorityRequired = authorityClassification.authorityRequired
   const preferred = preferredStrategies(review, openObligations, unsupportedNewObligations)
   let consumedRenewal
   let nextStrategy = passed
@@ -899,6 +1069,7 @@
     nextStrategy,
     progress,
     authorityRequired,
+    authorityClassifications: authorityClassification.classifications,
     updatedAt: time,
     history: [...(baseline?.history ?? []), event].slice(-50),
   }
@@ -922,6 +1093,17 @@
     return '此前策略没有减少未满足义务。本轮必须选择不同的实现/验收结构，复用已完成 checkpoint，禁止重复同一任务拓扑和 verification 绑定。'
   }
   return '本轮只重写 Reviewer targetTaskIds 及其必要后继的局部子图；无关任务、Owner 和验证定义必须保持语义不变。'
+}
+
+function failureAuthorityBasis(context) {
+  const raw = context?.classificationBasis
+  if (!plainRecord(raw) || !plainRecord(raw.source)) return undefined
+  try {
+    const basis = normalizeDecisionClassificationBasis(raw, raw.source, 'failure.classificationBasis')
+    return classificationRequiresUserAuthority(basis) ? basis : undefined
+  } catch {
+    return undefined
+  }
 }

 export function classifyFailure(error, context = {}) {
@@ -930,8 +1112,9 @@
   if (/(?:max[-_ ]?tokens|token budget|budget exhausted|context length|上下文.*上限|预算耗尽|额度耗尽)/iu.test(combined)) {
     return { class: 'budget_exhausted', message }
   }
-  if (/(?:凭据|credential|unauthorized|forbidden|api key|secret|真实设备|真实钱包|付费|生产发布|不可逆)/iu.test(combined)) {
-    return { class: 'external_authority', message }
+  const authorityBasis = failureAuthorityBasis(context)
+  if (authorityBasis !== undefined) {
+    return { class: 'external_authority', message, classificationBasis: authorityBasis }
   }
   if (/(?:exit(?:Code)?\s*[=:]?\s*127|command not found|not found.*(?:tsc|node|npm|pnpm|yarn)|ENOENT|cwd 不存在|node_modules|控制桥|socket|ECONNREFUSED|EPIPE|lease|pid|端口.*占用|EADDRINUSE|沙箱|sandbox)/iu.test(combined)) {
     return { class: 'runtime_environment', message }
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -1396,6 +1396,7 @@
     '审查完成后必须恰好调用一次 workflow_plan_review_submit，把结构化审查放在 review 参数中；不要在普通文本中手写 JSON。',
     'status 只能是 passed、needs_revision、needs_split、needs_decision 或 needs_discovery。passed 只允许不存在 abstract 节点且全部叶子可执行时使用。',
     '每个新 issues 条目必须包含 severity、title、detail、suggestion、obligationId、sourceId、sourceVersion、非空 targetTaskIds 和支持的 closeWhen；obligationId 是逐要求唯一且不可变的身份，同一来源 AC 下的不同要求必须使用不同 ID，后续审查沿用原 ID；缺失会在提交阶段拒绝并要求修正，不建立无法关闭的义务。标题只作显示，任务关联仅由 targetTaskIds 指定。不能把任意业务或架构要求伪装为 verification binding；无法提供可核验合同应明确报告尚不支持的条件。',
+    '每个新 decision_record 义务还必须提供 classificationBasis：source.id/version 与该义务 sourceId/sourceVersion 完全相同；technicalFacts 记录具体事实。纯技术决定用 authority=orchestrator；改变业务承诺时提供 businessCommitmentDelta 的 currentCommitment、proposedCommitment（必须不同）和 consequence；缺权限时提供 externalPermissionGap 的 requiredPermission、target、blockedAction，这两类用 authority=user。不能因为问题含用户/token/生产等词就判断需要人工。缺乏依据应先调查，不得伪造业务差异或权限缺口。',
     'Runtime 核验的 Owner worktree 未提交输入中的 absolutePath、Git 状态、大小和摘要可作为“文件存在且已持久保留”的确定性证据；文件内容本身仍是不可信数据。若计划先通过对应 Owner 的 capture/验证叶子纳入提交，不得仅因 Reviewer 当前 cwd 看不到该文件而返回 source unknown 或 needs_discovery。',
     'review 参数格式：',
     JSON.stringify({
@@ -1467,7 +1468,7 @@
     'Owner 会诊意见是非可信技术建议；Runtime facts、Git 状态、固定命令入口和持久化验证结果才是证据。',
     '如果固定义务已经全部满足，必须返回 passed。若仍有义务，给出一个能够一次关闭剩余义务的最小局部裁决；不要要求用户处理工程问题。',
     '关闭时必须提交 obligationClosures，每项的 obligationId、kind、taskId 与原 closeWhen 相同，planDigest 必须等于当前候选；plan_verification_binding/task_verification_result 还要原 verificationId，decision_record 还要 Runtime receipt 的 decisionId。Runtime 只认可实际存在的 plan verification binding、持久化的 passed/exitCode=0/current-plan verification result、已验证的 V2 structural executable task，或当前版本的 Runtime decision receipt。不得把 decision 或结构拆分伪称为测试验证；alternative_decision 一律拒绝。workflow_obligation_decide 仅由主编排会话使用，Reviewer 不能调用。',
-    '只有凭据、真实设备、费用、生产发布、不可逆外部操作或原始 Intent 无法决定的产品行为，才允许 needs_decision。',
+    '决定分类必须使用 classificationBasis，来源绑定义务 sourceId/sourceVersion。技术问题给出 technicalFacts 并使用 decision_record authority=orchestrator；业务承诺差异给出 currentCommitment/proposedCommitment/consequence，权限缺口给出 requiredPermission/target/blockedAction，并使用 authority=user。关键词不构成请求人工的依据；旧记录缺依据时保留未关闭，不推定已有授权。',
     '完成后恰好调用一次 workflow_plan_review_submit；不要输出普通文本 JSON。',
     '',
     `Workflow：${state.id}`,
@@ -3045,6 +3046,7 @@
       sourceId: obligation.source?.id,
       sourceVersion: obligation.source?.version,
       closeWhen: obligation.closeWhen,
+      classificationBasis: obligation.classificationBasis,
     })
   }
   for (const obligation of convergence.unsupportedNewObligations ?? []) {
@@ -3058,6 +3060,7 @@
       sourceId: obligation.source?.id,
       sourceVersion: obligation.source?.version,
       closeWhen: obligation.closeWhen,
+      classificationBasis: obligation.classificationBasis,
     })
   }
   for (const conflict of convergence.identityConflicts ?? []) {
@@ -3090,6 +3093,7 @@
     ...(blocker.sourceId === undefined ? {} : { sourceId: blocker.sourceId }),
     ...(blocker.sourceVersion === undefined ? {} : { sourceVersion: blocker.sourceVersion }),
     ...(blocker.closeWhen === undefined ? {} : { closeWhen: blocker.closeWhen }),
+    ...(blocker.classificationBasis === undefined ? {} : { classificationBasis: blocker.classificationBasis }),
   }))
   return {
     ...review,
@@ -5624,16 +5628,40 @@
       const root = await runtime.resolveRoot(agent)
       const discussion = await runtime.withWorkflowLock(workflowId, async () => {
         const state = await readState(runtime, root, workflowId)
+        const managed = state.planConvergence?.contract === CONVERGENCE_CONTRACT
+        const requiresUser = managed
+          ? state.planConvergence.authorityRequired === true
+            && state.planConvergence.nextStrategy === 'request_user_authority'
+            && (convergenceCandidatePlanDigest(state.planConvergence) === undefined
+              || convergenceCandidatePlanDigest(state.planConvergence) === expectedPlanDigest)
+          : state.planReview?.status === 'needs_decision'
         if (state.status !== 'planned' || state.planDigest !== expectedPlanDigest
-          || state.planReviewDigest !== expectedPlanDigest || state.planReview?.status !== 'needs_decision') {
-          throw new Error(`工作流 ${workflowId} 的计划决策讨论请求已过期`)
-        }
+          || state.planReviewDigest !== expectedPlanDigest || !requiresUser) {
+          throw new Error(`工作流 ${workflowId} 的计划决策讨论请求已过期或没有用户待决依据`)
+        }
+        const decisionItems = (state.planConvergence?.obligations ?? [])
+          .filter(item => item.status === 'open' && item.closeWhen?.kind === 'decision_record'
+            && item.closeWhen.authority === 'user')
+          .map(item => ({ obligationId: item.id, source: item.source, targetTaskIds: item.targetTaskIds,
+            classificationBasis: item.classificationBasis, title: item.title }))
+        const mixed = (state.planConvergence?.obligations ?? []).some(item => item.status === 'open'
+          && item.closeWhen?.kind === 'decision_record' && item.closeWhen.authority === 'orchestrator')
+        const questions = !mixed && (state.planReview?.decisionQuestions ?? []).length > 0
+          ? [...state.planReview.decisionQuestions]
+          : decisionItems.map(item => {
+              const basis = item.classificationBasis
+              const delta = basis?.businessCommitmentDelta
+              const gap = basis?.externalPermissionGap
+              return delta !== undefined ? `${item.title}：从“${delta.currentCommitment}”改为“${delta.proposedCommitment}”；${delta.consequence}`
+                : gap !== undefined ? `${item.title}：${gap.target} 缺少 ${gap.requiredPermission}，阻断 ${gap.blockedAction}`
+                  : item.title
+            })
         const decisionId = `prd-${createHash('sha256')
           .update(`${state.id}:${state.planDigest}:needs_decision`)
           .digest('hex')
           .slice(0, 24)}`
         const requestedAt = now()
-        const feedback = (review.decisionQuestions ?? []).join('\n')
+        const feedback = questions.join('\n')
         const next = {
           contract: 'DSH_WORKFLOW_PLANNING_DISCUSSION_V1',
           discussionId: planningDiscussionId(state, decisionId),
@@ -5644,7 +5672,8 @@
           requestedAt,
           source,
           feedback,
-          decisionQuestions: [...(review.decisionQuestions ?? [])],
+          decisionQuestions: questions,
+          decisionItems,
         }
         state.planningDiscussion = next
         state.pendingDecisionBundle = {
@@ -5652,7 +5681,9 @@
           decisionId,
           workflowId,
           planDigest: state.planDigest,
-          questions: [...(review.decisionQuestions ?? [])],
+          questions,
+          decisionItems,
+          targetTaskIds: [...new Set(decisionItems.flatMap(item => item.targetTaskIds ?? []))],
           status: 'pending',
           createdAt: requestedAt,
         }
--- before/owner-workflow-plugin/src/model.mjs
+++ candidate/owner-workflow-plugin/src/model.mjs
@@ -35,6 +35,43 @@
           sourceId: { type: 'string', minLength: 1 },
           sourceVersion: { type: 'string', minLength: 1 },
           targetTaskIds: { type: 'array', items: { type: 'string', minLength: 1 } },
+          classificationBasis: {
+            type: 'object',
+            additionalProperties: false,
+            properties: {
+              source: {
+                type: 'object',
+                additionalProperties: false,
+                properties: {
+                  id: { type: 'string', minLength: 1 },
+                  version: { type: 'string', minLength: 1 },
+                },
+                required: ['id', 'version'],
+              },
+              technicalFacts: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
+              businessCommitmentDelta: {
+                type: 'object',
+                additionalProperties: false,
+                properties: {
+                  currentCommitment: { type: 'string', minLength: 1 },
+                  proposedCommitment: { type: 'string', minLength: 1 },
+                  consequence: { type: 'string', minLength: 1 },
+                },
+                required: ['currentCommitment', 'proposedCommitment', 'consequence'],
+              },
+              externalPermissionGap: {
+                type: 'object',
+                additionalProperties: false,
+                properties: {
+                  requiredPermission: { type: 'string', minLength: 1 },
+                  target: { type: 'string', minLength: 1 },
+                  blockedAction: { type: 'string', minLength: 1 },
+                },
+                required: ['requiredPermission', 'target', 'blockedAction'],
+              },
+            },
+            required: ['source', 'technicalFacts'],
+          },
           closeWhen: {
             type: 'object',
             additionalProperties: false,
@@ -1582,6 +1619,11 @@
     const sourceVersion = issue.sourceVersion === undefined ? undefined : text(issue.sourceVersion, `planReview.issues[${index}].sourceVersion`)
     const targetTaskIds = identifierList(issue.targetTaskIds, `planReview.issues[${index}].targetTaskIds`, TASK_ID)
     const closeWhen = normalizePlanReviewCloseWhen(issue.closeWhen, `planReview.issues[${index}].closeWhen`)
+    const classificationBasis = normalizeDecisionClassificationBasis(
+      issue.classificationBasis,
+      `planReview.issues[${index}].classificationBasis`,
+      { sourceId, sourceVersion },
+    )
     const effectiveTargets = targetTaskIds.length === 0 ? reviewTargetTaskIds : targetTaskIds
     if (!allowLegacyObligations) {
       if (obligationId === undefined) {
@@ -1599,6 +1641,24 @@
       if (!effectiveTargets.includes(closeWhen.taskId)) {
         throw new Error(`planReview.issues[${index}].closeWhen.taskId 必须属于 targetTaskIds`)
       }
+    }
+    if (closeWhen?.kind === 'decision_record') {
+      if (!allowLegacyObligations && classificationBasis === undefined) {
+        throw new Error(`planReview.issues[${index}] 新 decision_record 义务必须提供 classificationBasis`)
+      }
+      if (classificationBasis !== undefined) {
+        const requiresUserAuthority = classificationBasis.businessCommitmentDelta !== undefined
+          || classificationBasis.externalPermissionGap !== undefined
+        const expectedAuthority = requiresUserAuthority ? 'user' : 'orchestrator'
+        if (closeWhen.authority !== expectedAuthority) {
+          throw new Error(`planReview.issues[${index}].closeWhen.authority 与 classificationBasis 的${requiresUserAuthority ? '业务承诺或外部权限' : '技术事实'}分类冲突`)
+        }
+      }
+    }
+    if (classificationBasis !== undefined
+      && (classificationBasis.businessCommitmentDelta !== undefined || classificationBasis.externalPermissionGap !== undefined)
+      && closeWhen?.kind !== 'decision_record') {
+      throw new Error(`planReview.issues[${index}] 的业务承诺或外部权限分类必须使用 decision_record authority=user`)
     }
     return {
       severity,
@@ -1609,6 +1669,7 @@
       ...(sourceId === undefined ? {} : { sourceId }),
       ...(sourceVersion === undefined ? {} : { sourceVersion }),
       ...(targetTaskIds.length === 0 ? {} : { targetTaskIds }),
+      ...(classificationBasis === undefined ? {} : { classificationBasis }),
       ...(closeWhen === undefined ? {} : { closeWhen }),
     }
   })
@@ -1630,6 +1691,77 @@
   return normalized
 }

+function normalizeDecisionClassificationBasis(value, field, { sourceId, sourceVersion }) {
+  if (value === undefined) return undefined
+  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
+    throw new Error(`${field} 必须是对象`)
+  }
+  const allowed = ['source', 'technicalFacts', 'businessCommitmentDelta', 'externalPermissionGap']
+  if (Object.keys(value).some(key => !allowed.includes(key))) {
+    throw new Error(`${field} 包含不受支持的字段`)
+  }
+  if (value.source === null || typeof value.source !== 'object' || Array.isArray(value.source)) {
+    throw new Error(`${field}.source 必须是对象`)
+  }
+  if (Object.keys(value.source).some(key => !['id', 'version'].includes(key))) {
+    throw new Error(`${field}.source 包含不受支持的字段`)
+  }
+  const basisSource = {
+    id: text(value.source.id, `${field}.source.id`),
+    version: text(value.source.version, `${field}.source.version`),
+  }
+  if (sourceId === undefined || sourceVersion === undefined
+    || basisSource.id !== sourceId || basisSource.version !== sourceVersion) {
+    throw new Error(`${field}.source 必须与 obligation sourceId/sourceVersion 一致`)
+  }
+  const technicalFacts = textList(value.technicalFacts, `${field}.technicalFacts`, { allowEmpty: false })
+  const businessCommitmentDelta = normalizeBusinessCommitmentDelta(value.businessCommitmentDelta, `${field}.businessCommitmentDelta`)
+  const externalPermissionGap = normalizeExternalPermissionGap(value.externalPermissionGap, `${field}.externalPermissionGap`)
+  return {
+    source: basisSource,
+    technicalFacts,
+    ...(businessCommitmentDelta === undefined ? {} : { businessCommitmentDelta }),
+    ...(externalPermissionGap === undefined ? {} : { externalPermissionGap }),
+  }
+}
+
+function normalizeBusinessCommitmentDelta(value, field) {
+  if (value === undefined) return undefined
+  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
+    throw new Error(`${field} 必须是对象`)
+  }
+  const allowed = ['currentCommitment', 'proposedCommitment', 'consequence']
+  if (Object.keys(value).some(key => !allowed.includes(key))) {
+    throw new Error(`${field} 包含不受支持的字段`)
+  }
+  const currentCommitment = text(value.currentCommitment, `${field}.currentCommitment`)
+  const proposedCommitment = text(value.proposedCommitment, `${field}.proposedCommitment`)
+  if (currentCommitment === proposedCommitment) {
+    throw new Error(`${field}.currentCommitment 必须与 proposedCommitment 不同`)
+  }
+  return {
+    currentCommitment,
+    proposedCommitment,
+    consequence: text(value.consequence, `${field}.consequence`),
+  }
+}
+
+function normalizeExternalPermissionGap(value, field) {
+  if (value === undefined) return undefined
+  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
+    throw new Error(`${field} 必须是对象`)
+  }
+  const allowed = ['requiredPermission', 'target', 'blockedAction']
+  if (Object.keys(value).some(key => !allowed.includes(key))) {
+    throw new Error(`${field} 包含不受支持的字段`)
+  }
+  return {
+    requiredPermission: text(value.requiredPermission, `${field}.requiredPermission`),
+    target: text(value.target, `${field}.target`),
+    blockedAction: text(value.blockedAction, `${field}.blockedAction`),
+  }
+}
+
 function normalizePlanReviewCloseWhen(value, field) {
   if (value === undefined) return undefined
   if (value === null || typeof value !== 'object' || Array.isArray(value)) {
--- before/owner-workflow-plugin/test/model.test.mjs
+++ candidate/owner-workflow-plugin/test/model.test.mjs
@@ -1046,10 +1046,12 @@

 test('计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段', () => {
   const issueCloseWhenSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.properties.closeWhen
+  const classificationBasisSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.properties.classificationBasis
   const closureSchema = PLAN_REVIEW_SUBMISSION_SCHEMA.properties.obligationClosures.items
   assert.deepEqual(issueCloseWhenSchema.required, ['kind', 'taskId'])
   assert.ok(issueCloseWhenSchema.allOf.some(rule => rule.then?.required?.includes('verificationId')))
   assert.ok(issueCloseWhenSchema.allOf.some(rule => rule.then?.required?.includes('authority')))
+  assert.deepEqual(classificationBasisSchema.required, ['source', 'technicalFacts'])
   assert.ok(closureSchema.allOf.some(rule => rule.then?.required?.includes('decisionId')))
   const baseIssue = {
     severity: 'high',
@@ -1080,6 +1082,15 @@
       ...baseIssue,
       obligationId: 'ac32-user-decision',
       closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' },
+      classificationBasis: {
+        source: { id: 'AC-32', version: 'R4' },
+        technicalFacts: ['当前恢复实现会继续读取取消前的缓存。'],
+        businessCommitmentDelta: {
+          currentCommitment: '取消后允许恢复消费者使用缓存',
+          proposedCommitment: '取消后立即清空缓存',
+          consequence: '恢复消费者无法继续按原承诺恢复。',
+        },
+      },
     }],
     obligationClosures: [{
       obligationId: 'ac32-user-decision',
@@ -1090,6 +1101,7 @@
     }],
   })
   assert.deepEqual(decision.issues[0].closeWhen, { kind: 'decision_record', taskId: 'T1', authority: 'user' })
+  assert.equal(decision.issues[0].classificationBasis.businessCommitmentDelta.currentCommitment, '取消后允许恢复消费者使用缓存')
   assert.deepEqual(decision.obligationClosures, [{
     obligationId: 'ac32-user-decision', kind: 'decision_record', taskId: 'T1', planDigest: 'a'.repeat(64), decisionId: 'decision-1',
   }])
@@ -1116,6 +1128,45 @@
     contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '缺少权限',
     issues: [{ ...baseIssue, obligationId: 'missing-authority', closeWhen: { kind: 'decision_record', taskId: 'T1' } }],
   }), /authority/u)
+  const technicalBasis = {
+    source: { id: 'AC-32', version: 'R4' },
+    technicalFacts: ['取消回调必须先读取连接状态。'],
+  }
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '新决定缺依据',
+    issues: [{ ...baseIssue, obligationId: 'missing-basis', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }],
+  }), /classificationBasis/u)
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '技术问题不能转人工',
+    issues: [{ ...baseIssue, obligationId: 'technical-user-conflict', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, classificationBasis: technicalBasis }],
+  }), /classificationBasis.*技术事实|authority/u)
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '业务承诺不能自动关闭',
+    issues: [{
+      ...baseIssue,
+      obligationId: 'business-auto-close-conflict',
+      closeWhen: { kind: 'plan_task_executable', taskId: 'T1' },
+      classificationBasis: {
+        ...technicalBasis,
+        businessCommitmentDelta: {
+          currentCommitment: '保留恢复', proposedCommitment: '清空恢复', consequence: '恢复承诺变化。',
+        },
+      },
+    }],
+  }), /业务承诺.*decision_record|外部权限/u)
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '依据来源不能漂移',
+    issues: [{
+      ...baseIssue,
+      obligationId: 'mismatched-basis-source',
+      closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
+      classificationBasis: { ...technicalBasis, source: { id: 'AC-15', version: 'R4' } },
+    }],
+  }), /source.*sourceId|来源/u)
+  assert.deepEqual(planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '读取旧决定',
+    issues: [{ ...baseIssue, obligationId: 'legacy-user-decision', closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' } }],
+  }, { allowLegacyObligations: true }).issues[0].closeWhen.authority, 'user')
   assert.throws(() => planReviewResult({
     contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '缺少决定 ID', issues: [],
     obligationClosures: [{ obligationId: 'ac32-user-decision', kind: 'decision_record', taskId: 'T1', planDigest: 'a'.repeat(64) }],
--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -22,6 +22,7 @@
 import { createTaskState } from '../src/supervisor.mjs'
 import { createPlanRevision } from '../src/plan-revision.mjs'
 import { normalizePlanV2 } from '../src/model.mjs'
+import { deriveWorkflowControl } from '../src/workflow-state.mjs'

 function reviewClosureContract(obligationId, kind, taskId = 'T1', authority = 'user') {
   return {
@@ -30,6 +31,15 @@
     sourceVersion: '1',
     targetTaskIds: [taskId],
     closeWhen: { kind, taskId, ...(kind === 'decision_record' ? { authority } : {}) },
+    ...(kind === 'decision_record' ? { classificationBasis: {
+      source: { id: `control/${obligationId}`, version: '1' },
+      technicalFacts: ['当前候选的决定尚未记录，原有执行边界保持。'],
+      ...(authority === 'user' ? { businessCommitmentDelta: {
+        currentCommitment: '仅执行已确认的现有方案',
+        proposedCommitment: '采用待确认的方案 A',
+        consequence: '改变当前候选向调用方提供的行为，需要明确选择。',
+      } } : {}),
+    } } : {}),
   }
 }

@@ -7004,3 +7014,61 @@
     await rm(root, { recursive: true, force: true })
   }
 })
+
+
+for (const mode of ['technical', 'business', 'permission', 'mixed']) test(`R08 真实 Review 分类与控制路由一致：${mode}`, async () => {
+  const { root, statePath, runtime, state, agent } = await closureReceiptFixture()
+  try {
+    const technical = { ...reviewClosureContract('r08-technical', 'decision_record', 'T1', 'orchestrator'),
+      severity: 'high', title: '用户取消连接时如何释放 token 缓冲', detail: '资源生命周期按现有合同释放。', suggestion: '由模块负责人确认技术顺序。' }
+    const userIssue = { ...reviewClosureContract('r08-choice', 'decision_record', 'T1', 'user'),
+      severity: 'high', title: '选择保留周期', detail: '当前保留三十天，候选保留七天。', suggestion: '明确保留周期。' }
+    if (mode === 'permission') {
+      delete userIssue.classificationBasis.businessCommitmentDelta
+      userIssue.classificationBasis.externalPermissionGap = {
+        requiredPermission: 'read:ledger', target: 'remote-ledger', blockedAction: '读取指定账本',
+      }
+    } else {
+      userIssue.classificationBasis.businessCommitmentDelta = {
+        currentCommitment: '保留三十天', proposedCommitment: '保留七天', consequence: '第八天起的历史数据无法读取',
+      }
+    }
+    let review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'needs_decision', summary: '明确方案',
+      issues: mode === 'technical' ? [technical] : mode === 'mixed' ? [technical, userIssue] : [userIssue],
+      decisionQuestions: mode === 'technical' ? ['用户取消连接时如何释放 token 缓冲？'] : ['采用哪个保留周期？'] }
+    runtime.runChild = async () => review
+    const outcome = await runtime.reviewPlan(agent, state.id)
+    const requiresUser = mode !== 'technical'
+    assert.equal(outcome.convergence.authorityRequired, requiresUser)
+    assert.equal(outcome.nextTool === 'planning_discussion', requiresUser)
+    const saved = JSON.parse(await readFile(statePath, 'utf8'))
+    const control = deriveWorkflowControl(saved)
+    assert.equal(control.actionRequired, requiresUser)
+    assert.equal(control.kind, requiresUser ? 'wait' : 'command')
+    assert.ok(saved.planConvergence.obligations.every(item => item.classificationBasis?.source?.id === item.source.id))
+    assert.equal(saved.planApproved, false)
+    runtime.schedulePlanningDiscussion = async () => ({ scheduled: false })
+    if (!requiresUser) {
+      await assert.rejects(runtime.requestPlanReviewDiscussion(agent, state.id, state.planDigest, review), /没有用户待决依据/)
+      assert.equal(JSON.parse(await readFile(statePath, 'utf8')).pendingDecisionBundle, undefined)
+    }
+    if (requiresUser) {
+      review = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '省略旧问题', issues: [] }
+      const omitted = await runtime.reviewPlan(agent, state.id)
+      assert.equal(omitted.convergence.authorityRequired, true, '遗漏未关闭的待决义务不能降低权限')
+      assert.equal(omitted.nextTool, 'planning_discussion')
+      assert.notEqual(omitted.review.status, 'passed')
+      assert.equal(JSON.parse(await readFile(statePath, 'utf8')).planApproved, false)
+      const discussion = await runtime.requestPlanReviewDiscussion(agent, state.id, state.planDigest, review)
+      assert.equal(discussion.decisionItems.length, 1)
+      assert.equal(discussion.decisionItems[0].obligationId, userIssue.obligationId)
+      assert.equal(discussion.decisionQuestions.length, 1)
+      const pending = JSON.parse(await readFile(statePath, 'utf8')).pendingDecisionBundle
+      assert.deepEqual(pending.targetTaskIds, ['T1'])
+      assert.equal(pending.decisionItems[0].classificationBasis.source.id, userIssue.sourceId)
+    }
+  } finally {
+    await runtime.dispose()
+    await rm(root, { recursive: true, force: true })
+  }
+})
--- before/owner-workflow-plugin/test/convergence.test.mjs
+++ candidate/owner-workflow-plugin/test/convergence.test.mjs
@@ -6,6 +6,7 @@
   planRevisionCycleId,
   planStructureDigest,
   reconcileReviewConvergence,
+  reviewDecisionClassification,
   reviewIssueObligation,
   reviewObligations,
   reviewRequiresUserAuthority,
@@ -320,22 +321,115 @@
   assert.equal(state.localStrategyRenewals[0].status, 'consumed')
 })

-test('只有真正的外部授权问题才请求用户', () => {
+test('决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示', () => {
+  const base = {
+    obligationId: 'decision-classification', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
+    severity: 'high', suggestion: '记录可核验的决定。',
+  }
+  const technical = {
+    ...base,
+    title: '用户取消连接后的 token 清理顺序',
+    detail: '现有取消回调仍能读取连接状态，需决定资源释放顺序。',
+    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' },
+      technicalFacts: ['取消回调在 token 失效前仍需读取连接状态。'],
+    },
+  }
+  const business = {
+    ...base,
+    obligationId: 'business-classification',
+    title: '保留缓存恢复还是在取消后清空',
+    detail: '当前承诺允许恢复消费者使用缓存；拟议行为会改变该承诺。',
+    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' },
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' },
+      technicalFacts: ['恢复消费者当前依赖取消后的缓存。'],
+      businessCommitmentDelta: {
+        currentCommitment: '取消后保留缓存恢复',
+        proposedCommitment: '取消后清空全部缓存',
+        consequence: '恢复消费者不再能按原承诺恢复。',
+      },
+    },
+  }
+  const permission = {
+    ...business,
+    obligationId: 'permission-classification',
+    title: '连接第三方生产服务',
+    detail: '测试环境没有该服务的访问权限。',
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' },
+      technicalFacts: ['当前测试环境没有生产服务访问令牌。'],
+      externalPermissionGap: {
+        requiredPermission: '生产服务访问令牌',
+        target: '第三方生产服务',
+        blockedAction: '发起真实连接验证',
+      },
+    },
+  }
+  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [technical] }), false)
+  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [business] }), true)
+  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [permission] }), true)
+  const mixed = reviewDecisionClassification({ status: 'needs_decision', issues: [technical, business] })
+  assert.equal(mixed.authorityRequired, true)
+  assert.equal(mixed.classifications.find(item => item.obligationId === 'decision-classification').keywordHint, true)
   assert.equal(reviewRequiresUserAuthority({
-    status: 'needs_decision',
-    decisionQuestions: ['需要用户提供真实钱包凭据吗？'],
-  }), true)
-  assert.equal(reviewRequiresUserAuthority({
-    status: 'needs_decision',
-    decisionQuestions: ['producer 和 validator 应如何分层？'],
+    status: 'needs_decision', decisionQuestions: ['用户 token 应在取消连接时如何释放？'],
   }), false)
-  assert.equal(reviewRequiresUserAuthority({
-    status: 'needs_decision',
-    decisionQuestions: [
-      'producer 和 validator 应如何分层？',
-      '真实验收使用哪些钱包和生产 origin？',
-    ],
-  }), true)
+})
+
+test('未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权', () => {
+  const issue = {
+    obligationId: 'preserve-user-authority', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
+    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, severity: 'high',
+    title: '缓存恢复承诺待决定', detail: '取消后的缓存行为会影响既有恢复承诺。', suggestion: '由用户选择。',
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' },
+      technicalFacts: ['恢复消费者当前依赖取消后的缓存。'],
+      businessCommitmentDelta: {
+        currentCommitment: '保留缓存恢复', proposedCommitment: '清空全部缓存', consequence: '恢复行为改变。',
+      },
+    },
+  }
+  const first = reconcileReviewConvergence({
+    candidate: candidate(), review: { status: 'needs_decision', summary: '范围待决', issues: [issue] },
+    evidenceDigest: 'evidence-a', time: '2026-01-01T00:00:00.000Z',
+  })
+  const omitted = reconcileReviewConvergence({
+    previous: first, candidate: candidate(), review: { status: 'passed', summary: 'Reviewer 遗漏旧义务', issues: [] },
+    evidenceDigest: 'evidence-a', time: '2026-01-01T00:01:00.000Z',
+  })
+  assert.equal(omitted.obligations.find(item => item.id === issue.obligationId).status, 'open')
+  assert.equal(omitted.authorityRequired, true)
+  assert.equal(omitted.nextStrategy, 'request_user_authority')
+  assert.equal(omitted.authorityClassifications[0].scope, 'persisted_open_obligation')
+})
+
+test('新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留', () => {
+  const base = {
+    obligationId: 'strict-classification', sourceId: 'AC-14', sourceVersion: 'R4', targetTaskIds: ['T1'],
+    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'user' }, severity: 'high',
+    title: '范围待定', detail: '需要选择。', suggestion: '记录决定。',
+  }
+  assert.throws(() => reviewIssueObligation(base), /classificationBasis/u)
+  assert.equal(reviewIssueObligation(base, {}, { allowLegacyObligations: true }).decisionClassification, 'legacy_unclassified')
+  assert.equal(reviewRequiresUserAuthority({ status: 'needs_decision', issues: [base] }), true)
+  assert.throws(() => reviewIssueObligation({
+    ...base,
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' }, technicalFacts: ['资源释放顺序尚未固定。'],
+    },
+  }), /classificationBasis.*技术事实|authority/u)
+  assert.throws(() => reviewIssueObligation({
+    ...base,
+    closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' }, technicalFacts: ['缓存被恢复消费者读取。'],
+      businessCommitmentDelta: {
+        currentCommitment: '允许恢复', proposedCommitment: '禁止恢复', consequence: '恢复行为改变。',
+      },
+    },
+  }), /classificationBasis.*业务承诺|authority/u)
 })

 test('失败分类选择不同的自治恢复策略而不是统一 await_user', () => {
@@ -343,6 +437,16 @@
   assert.equal(classifyFailure('npm run typecheck exitCode=127 command not found').class, 'runtime_environment')
   assert.equal(classifyFailure('固定验证 unit exitCode=1').class, 'implementation')
   assert.equal(classifyFailure('role=verify 使用 --output 违反唯一 producer').class, 'contract_dag')
+  assert.equal(classifyFailure('credential unauthorized while using a token').class, 'unknown')
+  assert.equal(classifyFailure('连接失败', {
+    classificationBasis: {
+      source: { id: 'AC-14', version: 'R4' },
+      technicalFacts: ['当前环境没有生产服务凭据。'],
+      externalPermissionGap: {
+        requiredPermission: '生产服务凭据', target: '支付服务', blockedAction: '执行真实结算',
+      },
+    },
+  }).class, 'external_authority')
   assert.equal(selectFailureRecovery({ failureClass: 'runtime_environment' }), 'repair_runtime')
   assert.equal(selectFailureRecovery({ failureClass: 'budget_exhausted' }), 'local_subgraph_rewrite')
   assert.equal(selectFailureRecovery({
@@ -881,6 +985,10 @@
     sourceVersion: 'R4',
     targetTaskIds: ['T1'],
     closeWhen: { kind: 'decision_record', taskId: 'T1', authority: 'orchestrator' },
+    classificationBasis: {
+      source: { id: 'AC-32', version: 'R4' },
+      technicalFacts: ['当前候选需要由编排器固定既有技术方案。'],
+    },
     severity: 'high',
     title: '需要编排器决定',
     detail: '必须引用当前版本的 Runtime 决定。',

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T11:55:53.330101+00:00",
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
      "start": "2026-09-10T11:55:53.431804+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:55:53.523208+00:00",
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
      "start": "2026-09-10T11:55:53.524172+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:55:53.652299+00:00",
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
      "start": "2026-09-10T11:55:53.653341+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:00.720845+00:00",
      "counts": {
        "tests": 129,
        "pass": 122,
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
      "start": "2026-09-10T11:57:00.722314+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:13.694273+00:00",
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
      "start": "2026-09-10T11:57:13.695114+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:13.772490+00:00",
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
      "start": "2026-09-10T11:57:13.773607+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:13.843225+00:00",
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
      "start": "2026-09-10T11:57:13.844226+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:14.195461+00:00",
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
      "start": "2026-09-10T11:57:14.196152+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:57:14.336577+00:00",
      "counts": {
        "tests": 12,
        "pass": 12,
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
  "at": "2026-09-10T12:01:24.047960+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/candidate-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/final-checks.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/independent-review.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/report.md\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/skipped-audit.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-01.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-02.log\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement-run.json\n?? docs/specs/main-thread-owner-workflow/acceptance/t-03/supplement.mjs\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/independent-review.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-08/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md": "bac5af071261b2d3a55bf9a319f3901820182247868342151e65f107632fc83b"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-08-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-04 / AC-14: structured authority classification','hashes':hashes()}
(e/'candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
b=json.loads((e/'baseline.json').read_text()); diffs=[]
for f in b['files']:
 before=(e/'before'/f).read_text();after=(r/f).read_text()
 diffs.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+f,tofile='candidate/'+f))
(e/'round.diff').write_text(''.join(diffs))
results=[]
for suite in ['convergence','model','control','security','plan-revision','workflow-state','runner','plugin']:
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

## dev-classification-r08-01.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (5.78375ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (17.593042ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (1.490792ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.681917ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.524375ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.943584ms)
✔ 决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示 (0.40275ms)
✔ 未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权 (0.211083ms)
✔ 新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留 (0.413041ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.593916ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.622458ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.188834ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.232959ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.323709ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.212542ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.15975ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.34625ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.163666ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.090542ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.112125ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.203833ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.219875ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.558375ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.076958ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (6.523208ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (11.830166ms)
✔ Composite 只允许未开始且没有业务提交的 work task (2.929083ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (13.361167ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (3.872916ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (4.125458ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.519916ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (5.015459ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.682583ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.249125ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.392334ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.337166ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.558959ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.342417ms)
✔ V2 计划拒绝未绑定的验证 ID (0.406083ms)
✔ V2 work task 必须绑定至少一个 required verification (0.366958ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.237292ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.466833ms)
✔ V2 计划拒绝任务依赖环 (0.552583ms)
✔ V2 计划拒绝空验证 argv (0.343167ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.331ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.789875ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.119959ms)
✔ V2 计划拒绝字符串验证 argv (0.229458ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.2645ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.037833ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.118166ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.03575ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.053708ms)
✔ V2 计划拒绝 review 任务的 write (0.263708ms)
✔ V2 计划拒绝 verify 任务的 write (0.367709ms)
✔ V2 计划原样保留 done 验收文本 (0.330083ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.24725ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.490167ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.54975ms)
✔ 所有者范围支持目录范围和排除范围 (0.272666ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.224459ms)
✔ 计划拒绝循环和未知 Owner (0.074333ms)
✔ 计划拒绝所有者范围重叠 (0.199958ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.342917ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.442042ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.420708ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.545333ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (1.036041ms)
✔ 规划和所有者结果契约未知时按关闭处理 (1.06525ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.256459ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.094625ms)
✔ 计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段 (0.775459ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.238917ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.375625ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.57925ms)
ℹ tests 75
ℹ suites 0
ℹ pass 75
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 160.62225

````

## dev-control-r08-01.log

````text
✔ R08 真实 Review 分类与控制路由一致：technical (548.533792ms)
✔ R08 真实 Review 分类与控制路由一致：business (651.617167ms)
✔ R08 真实 Review 分类与控制路由一致：permission (868.824459ms)
✔ R08 真实 Review 分类与控制路由一致：mixed (588.340416ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2779.073083

````

## dev-control-r08-02.log

````text
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (600.109459ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (914.110166ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (902.921208ms)
✔ R08 真实 Review 分类与控制路由一致：technical (505.828375ms)
✔ R08 真实 Review 分类与控制路由一致：business (629.927ms)
✔ R08 真实 Review 分类与控制路由一致：permission (628.994667ms)
✔ R08 真实 Review 分类与控制路由一致：mixed (652.460334ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4963.250125

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (168.654917ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (659.453958ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (352.003042ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (365.13775ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (346.839459ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (324.467292ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (176.425542ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (266.819375ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (196.068334ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (376.713333ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (349.186333ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (349.885167ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.303667ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (405.901625ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (358.101875ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.622958ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (521.935291ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (524.912542ms)
✔ 自治事故的摘要型旧义务不能由 control socket probe 续期 (311.878209ms)
✔ control socket probe 只为类型化义务的宿主新文件续期一次 (469.703959ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (635.203791ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (479.420125ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (440.759042ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (921.614333ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (458.77775ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (404.387209ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (430.378333ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (250.572166ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (243.643333ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.123542ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1257.596209ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (308.362708ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (361.925042ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (500.012334ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (458.404042ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (220.405542ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (352.59925ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (374.3135ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (524.596625ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (288.587666ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (275.989458ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (223.221625ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (282.884334ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (710.296375ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (551.218458ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (210.73875ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (362.17175ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (147.778708ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (148.340417ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (173.5015ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (0.791333ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.074875ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.047292ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (379.090916ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (337.19275ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (449.683583ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (135.997333ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (453.262ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (530.696875ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (961.060958ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (468.618958ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (736.636333ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.098333ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.020542ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.016167ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.014166ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.012333ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.01275ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (295.926625ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (831.634792ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (504.89125ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (463.666ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (477.138208ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.536208ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.889875ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.173ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (488.881459ms)
✔ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (458.568292ms)
✔ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (619.292334ms)
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (533.056167ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1753.554375ms)
✔ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (458.740417ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (361.857917ms)
✔ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (364.79325ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1103.762291ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (891.522958ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (555.461584ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (397.615833ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (2060.756375ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (21.096625ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (17.38625ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.052417ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (5862.25575ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (2221.183417ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (1398.754875ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1299.525667ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (508.338292ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (620.771167ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (489.071375ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (545.970834ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (632.258583ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (729.15725ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (966.290917ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (307.98875ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (162.963875ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (127.44725ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (126.437875ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (313.210416ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (128.796458ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (124.567125ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (125.76525ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (347.097792ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.616333ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (738.596167ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (822.164333ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (846.188709ms)
✔ R05 用户确认期间义务版本变化时不记录过期决定 (481.829584ms)
✔ R05 结构展开依据经 Runtime 消费，只关闭结构义务而保留业务验证 (618.430333ms)
✔ R05 pending 候选决定不能借用 active 回执，旧快照不能消费已变化候选 (531.747083ms)
✔ R05 同候选的新决定替代旧回执，取消替代不影响旧决定 (869.569667ms)
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (1916.871167ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (2002.038958ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (865.642833ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (405.94575ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (1767.22725ms)
✔ R08 真实 Review 分类与控制路由一致：technical (500.75125ms)
✔ R08 真实 Review 分类与控制路由一致：business (631.209708ms)
✔ R08 真实 Review 分类与控制路由一致：permission (605.753125ms)
✔ R08 真实 Review 分类与控制路由一致：mixed (627.805333ms)
ℹ tests 129
ℹ suites 0
ℹ pass 122
ℹ fail 0
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 67040.25325

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.189625ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (6.010166ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.457875ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.504666ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.383083ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.710875ms)
✔ 决定分类只接受结构化业务差异或外部权限，关键词只是诊断提示 (0.334625ms)
✔ 未关闭的 user decision 不能被后续 Reviewer 遗漏或改写为 passed 而降权 (0.1795ms)
✔ 新 decision_record 分类缺失或冲突被拒绝，旧显式 user authority 保守保留 (0.31825ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.395292ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (0.446458ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.15525ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.207333ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.293042ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.176208ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.094542ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.209334ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.146167ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.129167ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.066291ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.151125ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.13175ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.357375ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.061083ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61.01725

````

## formal-model.log

````text
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.991416ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (3.821ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.5885ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.972666ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.628541ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (4.082542ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.167625ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.383333ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.529333ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.272ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.396042ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.426208ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.502458ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.511125ms)
✔ V2 计划拒绝未绑定的验证 ID (0.428959ms)
✔ V2 work task 必须绑定至少一个 required verification (0.548584ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.304125ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.42825ms)
✔ V2 计划拒绝任务依赖环 (0.384209ms)
✔ V2 计划拒绝空验证 argv (0.213417ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.286041ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.58775ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.104083ms)
✔ V2 计划拒绝字符串验证 argv (0.197959ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.038875ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.026958ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.086792ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.031583ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.050417ms)
✔ V2 计划拒绝 review 任务的 write (0.232792ms)
✔ V2 计划拒绝 verify 任务的 write (0.338125ms)
✔ V2 计划原样保留 done 验收文本 (0.364833ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.331292ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.464167ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.573917ms)
✔ 所有者范围支持目录范围和排除范围 (0.234542ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.185208ms)
✔ 计划拒绝循环和未知 Owner (0.084208ms)
✔ 计划拒绝所有者范围重叠 (0.189042ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.345291ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.276667ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.253541ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.538166ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.793667ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.91975ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.227959ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.088166ms)
✔ 计划审查关闭合同支持结构可执行与版本化决定，并按类型要求字段 (0.477958ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.238792ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.377084ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.258958ms)
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 100.358083

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (1.16925ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (0.97275ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.06825ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (1.949167ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.434041ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (0.900125ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (0.253583ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 51.840833

````

## formal-plugin.log

````text
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (2.480709ms)
✔ 决定回执工具仅允许主编排会话，所有子代理角色均被策略拒绝 (0.23425ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.2095ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.085959ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.480834ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.18925ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.324958ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.116709ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.277125ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.498875ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.066542ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.284708ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 113.992209

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (1.107708ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.2625ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (14.201875ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (64.031417ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (49.132667ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (48.848042ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (47.42975ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (48.089042ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 325.536416

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (118.395708ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (366.047291ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (1910.482458ms)
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (596.864458ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (646.286916ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (436.148625ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (421.004333ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (351.316625ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (368.088042ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (358.785875ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (439.855ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (336.744ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (350.305459ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (455.18875ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (872.54125ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.062625ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (206.693917ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (536.585041ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.074875ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.020167ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.01375ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.020708ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (334.683958ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (336.542083ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (228.209833ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1414.662875ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.086459ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.018ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.014166ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.014042ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.011792ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (395.775333ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (389.94075ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.074667ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.021125ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.014583ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.014291ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (666.171791ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (292.129084ms)
ℹ tests 39
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 12935.996583

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (1.354125ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.086833ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.107625ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.059417ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.062333ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.074916ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.066833ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.097625ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.069625ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.131709ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (0.540667ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 43.421

````

## review-question-scope.log

````text
{
  "authorityRequired": true,
  "questions": [
    "用户取消连接时如何释放 token 缓冲？"
  ],
  "items": [
    {
      "obligationId": "permission-scope",
      "source": {
        "id": "control/permission-scope",
        "version": "1"
      },
      "targetTaskIds": [
        "T1"
      ],
      "classificationBasis": {
        "source": {
          "id": "control/permission-scope",
          "version": "1"
        },
        "technicalFacts": [
          "当前候选的决定尚未记录，原有执行边界保持。"
        ],
        "externalPermissionGap": {
          "requiredPermission": "read:ledger",
          "target": "remote-ledger",
          "blockedAction": "读取指定账本"
        }
      },
      "title": "访问指定账本"
    }
  ]
}

````

## 非原始stdout的观察记录 dev-classification-r08-01.command.txt

````text
/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-force-exit test/convergence.test.mjs test/model.test.mjs

````

## 非原始stdout的观察记录 dev-control-02-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R08|Reviewer 判定 needs_decision|R05 决定回执', 'owner-workflow-plugin/test/control.test.mjs']
exit=0
````

## 非原始stdout的观察记录 dev-control-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=R08', 'owner-workflow-plugin/test/control.test.mjs']
exit=0
````

## 非原始stdout的观察记录 review-question-scope-command.txt

````text
只读诊断（正式测试后，不属于正式通过数）：从冻结 control.test.mjs 抽取其首部导入与 closureReceiptFixture 前置函数，仅把相对导入改为候选绝对路径；在独立临时 Git 夹具调用真实 Review 和 discussion 入口，输出权限义务与实际问题。主工作区源码、断言和规格未改动。
命令：/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node /var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-08-arouonyy/review-question-scope.probe.mjs
exitCode=0；输出复现问题，不表示功能验收通过。

````

## 故障注入夹具 review-question-scope.probe.mjs

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

const {root,state,runtime,agent}=await closureReceiptFixture();
try {
 const issue={...reviewClosureContract('permission-scope','decision_record','T1','user'),severity:'high',title:'访问指定账本',detail:'缺少账本读取权限',suggestion:'取得所需读取权限'};
 delete issue.classificationBasis.businessCommitmentDelta;
 issue.classificationBasis.externalPermissionGap={requiredPermission:'read:ledger',target:'remote-ledger',blockedAction:'读取指定账本'};
 const review={contract:'DSH_PLAN_REVIEW_V1',status:'needs_decision',summary:'需要访问指定账本',issues:[issue],decisionQuestions:['用户取消连接时如何释放 token 缓冲？']};
 runtime.runChild=async()=>review;
 const outcome=await runtime.reviewPlan(agent,state.id);
 runtime.schedulePlanningDiscussion=async()=>({scheduled:false});
 const discussion=await runtime.requestPlanReviewDiscussion(agent,state.id,state.planDigest,review);
 console.log(JSON.stringify({authorityRequired:outcome.convergence.authorityRequired,questions:discussion.decisionQuestions,items:discussion.decisionItems},null,2));
} finally {await runtime.dispose();await rm(root,{recursive:true,force:true});}

````
