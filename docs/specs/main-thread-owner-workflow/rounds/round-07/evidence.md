# 第 7 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-07-diwl2j6j`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T10:57:42.640240+00:00",
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
    "owner-workflow-plugin/index.js": "bd456c462f3a5ddf4fb0b77652cd3528ee64237c587024db0dd76a68800d867e"
  },
  "repos": {
    ".": {
      "head": "154914064f5ceb2f8eb413865e10a54e8ffbc663\n",
      "branch": "main\n",
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/124ceb79a610b47a9a7a3be6b3536a09575a98a1\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/145932e9003280cc00e35aad27a454c7de631dae\n57957d4e3613e12c94dbabf53d71f8a38e1adc67 refs/codex/snapshots/3b7681c524894932211b3d5c8b856f0e8ce39ee8\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/522872f6f5d368613af38d2e850d7a47c09886a6\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/8968d9303acd61a9d94fa49bedf4414766ef8894\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9957e186462ead56c4d7c086172b3921ead7b9ef\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/9e58f2c8f0a635f2ba9bc1cb1e53e71baf490999\n4d3a3b33ebbe57d9257cc418159daa6a596928bc refs/codex/snapshots/bc7ad8378ff8254e5a02f34236c34b834e09b8dd\nc8e0222a683cfa5993968a057d7faaa1bb80d940 refs/codex/snapshots/ca05fdb36608106818494992534623b5e5c46ff6\n2486ff43af4afc7e0a78e0efcaac16144d1717a3 refs/codex/snapshots/ce7a59b6cd6cc8ae829dc186ea6ca794baf87114\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/d6203a184745fc8fea16694ed91f9566c79c2ed6\n39e59939aa670b1d86a06b0ccaf835ec35c83345 refs/codex/snapshots/e21a79e9773ad39feffe4f24d23cfb8851572d49\n4eb8ad89c9fd97fc1b18ae5e202184372685427a refs/codex/turn-diffs/captures/1789037829648/e2ced5d4-06d3-46ca-a7ec-b7e8e26ef4a0/base\n4eb8ad89c9fd97fc1b18ae5e202184372685427a refs/codex/turn-diffs/checkpoints/1b6907baba28859fbba259bcecaef77c5ac146000793515606e4ded7be9a97aa/0a4d4de0f03c5e3f7951ada0a65db09b5fbc78c0b5bcd004ab672579f79c781e/1789037804724/61bccc29-9a0b-4b25-8b6d-a45445850f3a\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/heads/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/heads/main\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/HEAD\n1b231ddbe2cccebbe12ecaeb189042820ee3b81f refs/remotes/origin/codex/synapse-dynamic-dag\n154914064f5ceb2f8eb413865e10a54e8ffbc663 refs/remotes/origin/main\n"
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
  "at": "2026-09-10T11:02:44.643213+00:00",
  "scope": "T-03 / AC-15: F08 optional discovery isolation and F09 socket contract",
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
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -2708,6 +2708,7 @@
 }

 async function convergenceRuntimeEvidence(runtime, state, plan, candidatePlanDigest, signal) {
+  abortIfNeeded(signal)
   const evidence = {
     planDigest: candidatePlanDigest,
     planBindings: [],
@@ -2729,6 +2730,7 @@
   // gate owns freshness, session, generation, and host-result validation.
   if (typeof state.root !== 'string' || typeof state.id !== 'string') return evidence
   const latest = await readState(runtime, state.root, state.id)
+  abortIfNeeded(signal)
   const latestCandidate = currentPlanReviewCandidate(latest, candidate.sourcePlan, candidatePlanDigest)
   // Decision receipts are authority evidence.  They must come exclusively
   // from a fresh persisted state, including for pending PlanRevisions.  The
@@ -2747,14 +2749,24 @@
   // consultation prose or an earlier planningRuntimeFacts snapshot. Only
   // content-hashed regular files associated with this candidate's tasks
   // qualify; discovery failures and session/worktree labels are not facts.
-  const discovery = await ownerWorktreePlanningFacts(runtime, { ...latest, plan: latestCandidate.plan }, signal)
-  const candidateTaskIds = new Set(latestCandidate.plan.tasks.map(task => task.id))
-  evidence.verifiedFiles = discovery.worktrees.flatMap(worktree => worktree.files.flatMap(file =>
-    file.kind === 'file' && /^[a-f0-9]{64}$/u.test(file.sha256 ?? '')
-      ? file.candidateTaskIds.filter(taskId => candidateTaskIds.has(taskId)).map(taskId => ({
-          taskId, path: file.path, kind: file.kind, sha256: file.sha256,
-        }))
-      : []))
+  // File discovery is optional and has its own worktree requirements. An
+  // unavailable discovery source must not suppress independent, current
+  // verification receipts. Cancellation remains a request-wide failure.
+  if (typeof latest.workflowWorktree === 'string' && latest.workflowWorktree.trim() !== '') {
+    try {
+      const discovery = await ownerWorktreePlanningFacts(runtime, { ...latest, plan: latestCandidate.plan }, signal)
+      abortIfNeeded(signal)
+      const candidateTaskIds = new Set(latestCandidate.plan.tasks.map(task => task.id))
+      evidence.verifiedFiles = discovery.worktrees.flatMap(worktree => worktree.files.flatMap(file =>
+        file.kind === 'file' && /^[a-f0-9]{64}$/u.test(file.sha256 ?? '')
+          ? file.candidateTaskIds.filter(taskId => candidateTaskIds.has(taskId)).map(taskId => ({
+              taskId, path: file.path, kind: file.kind, sha256: file.sha256,
+            }))
+          : []))
+    } catch {
+      abortIfNeeded(signal)
+    }
+  }
   if (latestCandidate?.kind !== 'active') return evidence
   for (const task of latestCandidate.plan.tasks) {
     const taskState = latest.tasks?.find(item => item.taskId === task.id)
@@ -2775,6 +2787,7 @@
       abortIfNeeded(signal)
     }
   }
+  abortIfNeeded(signal)
   return evidence
 }

--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -1177,7 +1177,7 @@
   }
 })

-test('自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复', async () => {
+test('自治事故的摘要型旧义务不能由 control socket probe 续期', async () => {
   const fixture = await supervisorControlFixture()
   try {
     const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
@@ -1210,15 +1210,100 @@
     await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

     const probed = await request(fixture.manifest, 'convergence-probe')
-    assert.equal(probed.resumed, true)
-    assert.equal(probed.resumedPlan, true)
+    assert.equal(probed.resumed, false)
+    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    assert.equal(saved.planConvergence.progress, 'none')
+    assert.equal(saved.planConvergence.nextStrategy, 'autonomous_incident')
+    assert.equal(saved.planningAgent.phase, 'autonomous_incident')
+    assert.ok(saved.planConvergence.seenEvidence)
+    assert.ok(saved.planConvergence.seenEvidenceFacts)
+  } finally {
+    await fixture.runtime.dispose()
+    await rm(fixture.root, { recursive: true, force: true })
+  }
+})
+
+test('control socket probe 只为类型化义务的宿主新文件续期一次', async () => {
+  const fixture = await supervisorControlFixture({ materializeWorkflow: true })
+  try {
+    const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    state.status = 'planned'
+    state.planApproved = false
+    state.planReview = {
+      contract: 'DSH_PLAN_REVIEW_V1',
+      status: 'needs_revision',
+      summary: '等待 T1 当前 Runtime 事实',
+      issues: [{
+        severity: 'high',
+        title: '固定验证缺少当前宿主事实',
+        detail: 'T1 必须取得由 Runtime 重新读取的文件证据。',
+        suggestion: '在 Owner worktree 中补齐 T1 的实际改动。',
+        ...reviewClosureContract('control-socket-runtime-file', 'task_verification_result', 'T1'),
+        closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+      }],
+    }
+    state.planReviewDigest = state.planDigest
+    state.ownerRuns = {
+      'T1:api': { taskId: 'T1', ownerId: 'api', worktree: state.workflowWorktree },
+    }
+    state.planConvergence = {
+      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
+      runtimeVersion: 'evidence-lease-v3',
+      cycleId: 'initial-cycle',
+      evidenceDigest: 'stale-evidence',
+      obligations: [{
+        id: 'control-socket-runtime-file',
+        declaredId: 'control-socket-runtime-file',
+        category: 'acceptance-evidence',
+        severity: 'high',
+        title: '固定验证缺少当前宿主事实',
+        detail: 'T1 必须取得由 Runtime 重新读取的文件证据。',
+        suggestion: '在 Owner worktree 中补齐 T1 的实际改动。',
+        source: { id: 'control/control-socket-runtime-file', version: '1' },
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+        status: 'open',
+      }],
+      unsupportedNewObligations: [],
+      usedStrategies: ['local_subgraph_rewrite', 'diagnose', 'owner_council', 'arbitrate', 'alternate_implementation'],
+      nextStrategy: 'autonomous_incident',
+      history: [],
+    }
+    state.planningAgent = { managedBy: 'runner-runtime', phase: 'autonomous_incident' }
+    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
+
+    const baseline = await request(fixture.manifest, 'convergence-probe')
+    assert.equal(baseline.resumed, false)
+    const seeded = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    assert.ok(seeded.planConvergence.seenEvidence)
+    assert.ok(seeded.planConvergence.seenEvidenceFacts)
+
+    const changedFile = join(state.workflowWorktree, 'src', 'api', 't1.mjs')
+    await mkdir(join(state.workflowWorktree, 'src', 'api'), { recursive: true })
+    await writeFile(changedFile, 'export const controlSocketRuntimeFact = true\n', 'utf8')
+
+    const renewed = await request(fixture.manifest, 'convergence-probe')
+    assert.equal(renewed.resumed, true)
+    assert.equal(renewed.resumedPlan, true)
     const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
     assert.equal(saved.planConvergence.progress, 'new_evidence')
-    assert.equal(saved.planConvergence.nextStrategy, 'diagnose')
+    assert.equal(saved.planConvergence.nextStrategy, 'local_subgraph_rewrite')
     assert.equal(saved.planningAgent.phase, 'revision_retry_pending')
+    assert.ok(saved.planConvergence.seenEvidence['control-socket-runtime-file'].some(proof => (
+      proof.kind === 'verified_file' && proof.path === 'src/api/t1.mjs'
+    )))
+
+    const duplicate = await request(fixture.manifest, 'convergence-probe')
+    assert.equal(duplicate.resumed, false)
+    const afterDuplicate = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    assert.equal(afterDuplicate.planConvergence.nextStrategy, 'local_subgraph_rewrite')
+    assert.deepEqual(
+      afterDuplicate.planConvergence.seenEvidence['control-socket-runtime-file'],
+      saved.planConvergence.seenEvidence['control-socket-runtime-file'],
+    )
   } finally {
     await fixture.runtime.dispose()
-    await rm(fixture.root, { recursive: true, force: true })
+    await removeFixtureRoot(fixture.root)
   }
 })

--- before/owner-workflow-plugin/test/security.test.mjs
+++ candidate/owner-workflow-plugin/test/security.test.mjs
@@ -476,6 +476,57 @@
   }
 })

+test('R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽', async () => {
+  const fixture = await ownerVerificationFixture()
+  try {
+    await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 7\n')
+    const result = await fixture.runtime.recordBoundVerification({
+      task_id: 'T1', verification_id: 'unit', description: 'R07 当前宿主验证',
+    }, fixture.exec)
+    const original = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    for (const workflowWorktree of [undefined, '', null, 42, join(fixture.root, 'missing', 'workflow'), '/unavailable-r07/workflow']) {
+      const state = { ...original, workflowWorktree }
+      await writeFile(fixture.statePath, JSON.stringify(state))
+      const evidence = await fixture.runtime.planReviewEvidence(state, state.plan, state.planDigest)
+      assert.deepEqual(evidence.verifiedFiles, [], `不可用发现路径：${String(workflowWorktree)}`)
+      assert.deepEqual(evidence.taskVerificationResults, [{ ...result, current: true }])
+    }
+    const discoverable = { ...original, workflowWorktree: join(fixture.root, 'workflow') }
+    await writeFile(fixture.statePath, JSON.stringify(discoverable))
+    const available = await fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest)
+    assert.ok(available.verifiedFiles.some(file => file.taskId === 'T1' && file.path === 'src/owned/value.mjs'))
+    assert.deepEqual(available.taskVerificationResults, [{ ...result, current: true }])
+
+    const canceled = new AbortController()
+    canceled.abort(new Error('R07 请求取消'))
+    await assert.rejects(fixture.runtime.planReviewEvidence(original, original.plan, original.planDigest, canceled.signal), /Owner 工作流已被调用方取消/)
+
+    const duringVerification = new AbortController()
+    const originalCheck = fixture.runtime.assertRequiredTaskVerifications
+    fixture.runtime.assertRequiredTaskVerifications = async (...args) => {
+      const checked = await originalCheck(...args)
+      duringVerification.abort()
+      return checked
+    }
+    try {
+      await assert.rejects(fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest, duringVerification.signal), /Owner 工作流已被调用方取消/)
+    } finally {
+      fixture.runtime.assertRequiredTaskVerifications = originalCheck
+    }
+
+    const changed = structuredClone(discoverable)
+    changed.plan.summary = 'R07 新候选'
+    changed.planDigest = createHash('sha256').update(JSON.stringify(changed.plan)).digest('hex')
+    await writeFile(fixture.statePath, JSON.stringify(changed))
+    const stale = await fixture.runtime.planReviewEvidence(discoverable, discoverable.plan, discoverable.planDigest)
+    assert.deepEqual(stale.verifiedFiles, [])
+    assert.deepEqual(stale.taskVerificationResults, [])
+    assert.deepEqual(stale.planBindings, [])
+  } finally {
+    await fixture.cleanup()
+  }
+})
+
 test('旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证', async () => {
   const fixture = await legacyFlutterVerificationFixture()
   try {

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T11:02:44.643213+00:00",
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
      "start": "2026-09-10T11:02:44.770528+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:02:44.882512+00:00",
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
      "start": "2026-09-10T11:02:44.883261+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:04:03.203749+00:00",
      "counts": {
        "tests": 125,
        "pass": 118,
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
      "start": "2026-09-10T11:04:03.204604+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:04:18.233459+00:00",
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
      "start": "2026-09-10T11:04:18.234512+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:04:18.327595+00:00",
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
      "start": "2026-09-10T11:04:18.328556+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:04:18.402984+00:00",
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
      "start": "2026-09-10T11:04:18.403682+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T11:04:18.814489+00:00",
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
  "at": "2026-09-10T11:05:42.367010+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-05/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-06/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-07/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md": "8afb43abc7fafc274748516df82bd7628bf123d6d50f5098a7aa4144c835bf87",
  "docs/specs/main-thread-owner-workflow/rounds/round-06/report.md": "46b284a94b52490799893b6f1eaea74365587a1acac64d1f7518c6167ebb5384"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-07-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-03 / AC-15: F08 optional discovery isolation and F09 socket contract','hashes':hashes()}
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

## control-r07-diff-check.raw.log

````text

````

## control-r07-direct-r06.raw.log

````text
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (2638.723833ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2848.462625

````

## control-r07-socket.raw.log

````text
✔ 自治事故的摘要型旧义务不能由 control socket probe 续期 (302.348583ms)
✔ control socket probe 只为类型化义务的宿主新文件续期一次 (568.333083ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1050.361291

````

## dev-security-01.log

````text
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (2940.385625ms)
✖ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (686.569ms)
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3762.645916

✖ failing tests:

test at owner-workflow-plugin/test/security.test.mjs:479:1
✖ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (686.569ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /R07 请求取消/. Input:
  
  'Error: Owner 工作流已被调用方取消'
  
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/security.test.mjs:502:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: Owner 工作流已被调用方取消
        at abortIfNeeded (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:299:30)
        at convergenceRuntimeEvidence (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:2711:3)
        at Object.planReviewEvidence (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:14354:14)
        at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/security.test.mjs:502:42)
        at async Test.run (node:internal/test_runner/test:1113:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:788:7),
    expected: /R07 请求取消/,
    operator: 'rejects',
    diff: 'simple'
  }

````

## dev-security-02.log

````text
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (2779.232708ms)
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (761.072167ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3673.872083

````

## dev-security-03.log

````text
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (820.495292ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 959.148333

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (457.592125ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (1129.536542ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (535.595333ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (547.154208ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (584.185ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (646.623417ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (219.399958ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (393.447417ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (278.066667ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (615.943375ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (1055.651ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (825.885417ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.339958ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (610.413167ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (495.484417ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.753125ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (783.5465ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (1360.64275ms)
✔ 自治事故的摘要型旧义务不能由 control socket probe 续期 (357.460166ms)
✔ control socket probe 只为类型化义务的宿主新文件续期一次 (624.434834ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (857.082375ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (626.146708ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (746.702083ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (462.5445ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (400.037709ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (489.162833ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (582.09575ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (390.029625ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (385.66675ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.321584ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1948.459ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (332.542625ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (364.661666ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (352.207584ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (386.374209ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (202.42475ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (304.026083ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (392.601083ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (392.77525ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (317.631917ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (321.146667ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (259.941917ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (323.448792ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (855.956167ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (612.8825ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (275.018875ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (645.109458ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (386.668ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (378.462375ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (224.765375ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (1.144208ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.0665ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.042916ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (525.935375ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (430.751833ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (633.919416ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (160.518667ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (549.429792ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (616.964084ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (1145.434666ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (508.1365ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (866.131084ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.11675ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.034959ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.019167ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.014667ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.023333ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.115208ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (484.531417ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (1063.286167ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (603.447542ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (617.003542ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (593.374583ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.325583ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.721458ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.164834ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (475.811333ms)
✔ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (630.133833ms)
✔ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (633.50075ms)
✔ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (526.288042ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1939.599459ms)
✔ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (532.054667ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (425.88325ms)
✔ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (421.359167ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1232.09375ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (785.734625ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (571.623042ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (396.683ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1853.19775ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (27.971208ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (22.043417ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.125042ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (5414.007542ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1990.075084ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (1021.854375ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1382.799167ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (513.681458ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (607.488291ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (520.127375ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (654.249125ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (432.592667ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (817.066792ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (1161.170083ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (328.063708ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (237.021292ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (150.016458ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (133.718042ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (346.019041ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (137.802166ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (144.652917ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (141.451292ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (377.873417ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.379333ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (795.771916ms)
✔ R05 决定回执经真实 Review 关闭入口消费：orchestrator (973.06525ms)
✔ R05 决定回执经真实 Review 关闭入口消费：user (928.286333ms)
✔ R05 用户确认期间义务版本变化时不记录过期决定 (570.717ms)
✔ R05 结构展开依据经 Runtime 消费，只关闭结构义务而保留业务验证 (1071.90825ms)
✔ R05 pending 候选决定不能借用 active 回执，旧快照不能消费已变化候选 (723.221583ms)
✔ R05 同候选的新决定替代旧回执，取消替代不影响旧决定 (1240.229375ms)
✔ R06 真实 Review 会诊固定描述在相同事实下耗尽策略 (3715.508916ms)
✔ R06 真实 Review 会诊交替描述在相同事实下耗尽策略 (2699.449916ms)
✔ R06 真实候选补齐绑定只记一次进展，重复与候选文案变化不续期 (1184.509709ms)
✔ R06 文件进展由宿主重新读取，伪造缓存与过期候选没有文件事实 (502.935708ms)
✔ R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 (2192.398208ms)
ℹ tests 125
ℹ suites 0
ℹ pass 118
ℹ fail 0
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 78287.102791

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (3.117416ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (7.037958ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (1.410209ms)
✔ 交替会诊文本、时间、会话、HEAD 和候选摘要不能在 30 轮内重置策略 (2.887416ms)
✔ 当前候选恢复的验证绑定只登记一次进展，不自动关闭且重复事实不续期 (0.402208ms)
✔ 已解决义务的新文件和反复更换 obligationId 都不能回收策略租约 (0.661417ms)
✔ 只有真正的外部授权问题才请求用户 (0.057458ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.596958ms)
✔ Workflow 证据摘要只投影稳定的任务结果和 Runtime 文件哈希 (1.106834ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.2315ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.328625ms)
✔ 严格义务必须有 ID；已见事实不能用新 ID 重新引入已解决的合同 (0.281833ms)
✔ 不同 obligationId 的同合同要求独立保留，关闭一项不会关闭另一项 (0.485208ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.143459ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.245959ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.172292ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.06175ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.069458ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.172625ms)
✔ 结构可执行关闭只依赖 Runtime 记录的任务存在，不将其视为业务完成 (0.150666ms)
✔ 版本化决定必须由 Runtime 当前记录完整绑定，且不同义务 ID 不会共享关闭结果 (0.341916ms)
✔ decision_record 的 user authority 明确请求用户，同时保留旧问题文本回退 (0.030417ms)
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 75.543791

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (0.937875ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (0.937583ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.069583ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (2.302334ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.774542ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (0.912166ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (0.262709ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.801583

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (1.149125ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.294ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (17.043708ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (65.706ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (55.509666ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (56.513ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (72.192333ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (57.048208ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 382.536584

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (138.198708ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (401.623625ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (2084.845375ms)
✔ R07 可选文件发现不可用时保留独立验证证据，当前候选与取消门禁不放宽 (693.136125ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (725.944167ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (507.275292ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (550.53375ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (420.2555ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (403.203125ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (445.992833ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (504.591ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (370.833083ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (370.020875ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (532.92375ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (1038.238167ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.188583ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (333.01675ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (617.776875ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.187708ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.02675ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.01675ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.01475ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (379.992166ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (395.988584ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (287.0565ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1587.576375ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.065417ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.019292ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.015125ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.0125ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.010833ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (484.072916ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (544.768709ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.110292ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.025084ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.019167ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.0295ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (779.007209ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (275.95975ms)
ℹ tests 39
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 14997.347

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (0.862666ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.068042ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.594625ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.080334ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.068459ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.085834ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.063834ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.106625ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.069334ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.135959ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (0.547125ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.915334

````

## 非原始stdout的观察记录 control-r07-diff-check.command.txt

````text
command: git diff --check -- owner-workflow-plugin/test/control.test.mjs
exit: 0

````

## 非原始stdout的观察记录 control-r07-direct-r06.command.txt

````text
command: /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-name-pattern R06 Runner 探针不能凭摘要变化清空策略，真实新文件只恢复一次 test/control.test.mjs
exit: 0

````

## 非原始stdout的观察记录 control-r07-socket.command.txt

````text
command: /Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-name-pattern 摘要型旧义务\|类型化义务 test/control.test.mjs
exit: 0

````

## 非原始stdout的观察记录 dev-security-command.txt

````text
['/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node', '--test', '--test-force-exit', '--test-name-pattern=F02 的|R07', 'owner-workflow-plugin/test/security.test.mjs']
exit=1
````

## 非原始stdout的观察记录 dev-security-notes.txt

````text
Development only, not frozen formal results. All commands cwd /Volumes/LargeStorage/code/DSH-Workflow, Node /Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node, --test --test-force-exit, target owner-workflow-plugin/test/security.test.mjs, timeout60.
01 selector F02 的|R07: exit1, 1 pass/1 fail. R07 expected custom abort message but existing abortIfNeeded deliberately emits standard cancellation message.
02 same selector after correcting expectation: exit0, 2 pass.
03 selector R07 after adding read-completion cancellation checks and in-verifier abort case: exit0, 1 pass.
Separate node --check runtime.mjs and git diff --check returned0, no standalone raw log.

````

## 非原始stdout的观察记录 review-final.txt

````text
Independent read-only review, gpt-5.6-terra / xhigh: No concrete F08/F09 blockers found.
Frozen delta isolates unavailable/malformed optional discovery, preserves valid current verification receipts, keeps stale candidate evidence empty and propagates cancellation. Valid discovered files remain usable.
F09 rejects the legacy digest-only socket expectation and uses typed obligation + actual host-read file for one-time renewal. Immediate duplicate socket and existing R06 post-consumption/re-entry tests both pass.
Frozen runtime.mjs/security.test.mjs/control.test.mjs hashes match candidate.json. 212 tests,191 pass,0 fail,21 skips,0 timeouts,no drift.
Root independently agrees based on source and raw evidence.
round.diff SHA256: a20f463e4d8d9fd94409b68db962673d714f8685c8bb40572d3ea01da71f15c4

````
