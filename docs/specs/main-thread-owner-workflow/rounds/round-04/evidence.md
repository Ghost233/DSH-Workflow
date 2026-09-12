# 第 4 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-04-dpj0rrnf`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T08:43:46.587786+00:00",
  "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
  "files": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "552f87d83986383de270b963bf3d4fefe97bd65b2c329d43e9781486bfbb40bd",
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
    "owner-workflow-plugin/src/runtime.mjs": "14bd3eb1d0d5cae564abac1b9d8c09584fcfb90a10ea71b6603c942b5286c028",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "8cdf7b695b0eef3b0ded42b8d393b5fa0607cb38960df05f6911b3eccd98be16",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/test/launcher.test.mjs": "b6550c3e19347bba3e9e71b7db8feb07d8cfbcc171852f653b6086ed0ddfe882",
    "owner-workflow-plugin/test/owner-boundary.test.mjs": "3e2c4b9d5146893d995f308b470942e3f4bf752d48b6cf02d172da822bb6e593",
    "owner-workflow-plugin/test/runner.test.mjs": "811dba5847bc7270e18cbb76d9e48938b381e6d4a6bed211ef1b32cb321ef7b7",
    "owner-workflow-plugin/test/plugin.test.mjs": "2d6ef28cbccd805858e92b094988857503af07e9ad5d75f03d0c7d7c6207a6aa",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/operation-approval.test.mjs": "c6f43055ca7400d3587bd5f89da1731c8d831d76dd8e7897b0c9503b0ae1c96b",
    "owner-workflow-plugin/test/workflow-state.test.mjs": "db7e3535929a7679f1afafc18b010adc9b29d40782e2f2ece917af4d47fd38d1",
    "owner-workflow-plugin/test/dashboard-host.test.mjs": "10a51bc733d40bfd2982eb23e8f01acbbbf031a427e0b3efcd44bf1f34664f71",
    "owner-workflow-plugin/test/model.test.mjs": "c3969d3e6271097358337280de713fa5f0a1676623337e14d185c4da9823e4a1",
    "owner-workflow-plugin/test/control.test.mjs": "c33754c2e7de44da8aea01eb564fe6f05d4cb2357ba89285146900ef62bf0e81",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "9ac137fe11d47fed76a957a3fbd163e210c23ec4c80f237408b827f37776d34e",
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
    "owner-workflow-plugin/index.js": "38db015cf756e9f1b1cc9781c9646e4c409b81884fc8aec479a644f4b1915ef8"
  },
  "repos": {
    ".": {
      "head": "154914064f5ceb2f8eb413865e10a54e8ffbc663",
      "branch": "main",
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "refs/heads/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/heads/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/HEAD 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/codex/synapse-dynamic-dag 1b231ddbe2cccebbe12ecaeb189042820ee3b81f\nrefs/remotes/origin/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\n"
    },
    "deepseek-harness": {
      "head": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e",
      "branch": "master",
      "status": " M packages/host/apiproxy/src/fetch/client.ts\n M packages/host/apiproxy/tests/client-handler.spec.ts\n",
      "refs": "refs/heads/master b150a551b8d465e31e418e1b2eaf5e79bbb7d28e\nrefs/remotes/origin/HEAD dd6322d604e00eec1ba5e0c8541159906a21094a\nrefs/remotes/origin/master dd6322d604e00eec1ba5e0c8541159906a21094a\n"
    },
    "dsh-synapse": {
      "head": "97f8c432de875d97bf7a5e4d675f8010f7b34556",
      "branch": "",
      "status": "",
      "refs": "refs/heads/main a323f76b0c47ffad59194d8ac7efacb3aa6bdfba\nrefs/remotes/origin/HEAD 56935dc1862e7791b212f6eb2dd26404def5a575\nrefs/remotes/origin/main 56935dc1862e7791b212f6eb2dd26404def5a575\n"
    },
    "owner-workflow-plugin/vendor/dsh-approve-for-me": {
      "head": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b",
      "branch": "main",
      "status": "",
      "refs": "refs/heads/main a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\nrefs/remotes/origin/HEAD 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/compat/dsh-0.1.1-rc.1 f3a45b67e99a0e83ef0816c96b4e6c5e8289887e\nrefs/remotes/origin/compat/dsh-0.1.1-rc.2 93e6f35ca68d54bb5a1b746fb02b55f29d003b03\nrefs/remotes/origin/compat/rc7 1a88a630b20eb57ccf7e0e4a78d5f7532f7ff5cc\nrefs/remotes/origin/main 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\nrefs/remotes/origin/maintenance/beta2-quality f1b08abdfccb35d475b62d090fc536e6b11aa14f\n"
    }
  }
}
````

## 冻结候选

````json
{
  "at": "2026-09-10T08:47:25.980872+00:00",
  "scope": "T-02 / AC-16, AC-32: mandatory independent obligation identity",
  "hashes": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "404075fbb9aa65406fab59b692e9e798436aa76edfa3dc73ff6d847134befbd4",
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
    "owner-workflow-plugin/src/runtime.mjs": "659c133a1c8908fa589feb6e93e3f1d870fede25ded119521ac011164bf7730c",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "f48a7d2af847694b1528a021c73308cc50d7b2ea8cad8404b359af6ddb11619b",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/test/launcher.test.mjs": "b6550c3e19347bba3e9e71b7db8feb07d8cfbcc171852f653b6086ed0ddfe882",
    "owner-workflow-plugin/test/owner-boundary.test.mjs": "3e2c4b9d5146893d995f308b470942e3f4bf752d48b6cf02d172da822bb6e593",
    "owner-workflow-plugin/test/runner.test.mjs": "811dba5847bc7270e18cbb76d9e48938b381e6d4a6bed211ef1b32cb321ef7b7",
    "owner-workflow-plugin/test/plugin.test.mjs": "2d6ef28cbccd805858e92b094988857503af07e9ad5d75f03d0c7d7c6207a6aa",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/operation-approval.test.mjs": "c6f43055ca7400d3587bd5f89da1731c8d831d76dd8e7897b0c9503b0ae1c96b",
    "owner-workflow-plugin/test/workflow-state.test.mjs": "db7e3535929a7679f1afafc18b010adc9b29d40782e2f2ece917af4d47fd38d1",
    "owner-workflow-plugin/test/dashboard-host.test.mjs": "10a51bc733d40bfd2982eb23e8f01acbbbf031a427e0b3efcd44bf1f34664f71",
    "owner-workflow-plugin/test/model.test.mjs": "30f79f38282fdbc6493859e63bf9018826f898d5718833fcfbb23a13278bbb77",
    "owner-workflow-plugin/test/control.test.mjs": "c33754c2e7de44da8aea01eb564fe6f05d4cb2357ba89285146900ef62bf0e81",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "a8b52f55bb782a93965ce09a949407d2f6a19ec0586ccd884ee06645ea89b8b6",
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
    "owner-workflow-plugin/index.js": "38db015cf756e9f1b1cc9781c9646e4c409b81884fc8aec479a644f4b1915ef8",
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
@@ -69,6 +69,9 @@
   const declaredId = nonEmptyText(issue?.obligationId)
   const sourceId = nonEmptyText(issue?.sourceId)
   const sourceVersion = nonEmptyText(issue?.sourceVersion) ?? nonEmptyText(review?.sourceVersion)
+  if (!allowLegacyObligations && declaredId === undefined) {
+    throw new Error('新审查义务必须提供不可变 obligationId')
+  }
   if (!allowLegacyObligations && sourceId === undefined) {
     throw new Error('新审查义务必须提供显式 sourceId')
   }
@@ -113,6 +116,7 @@

 function obligationIdentity(obligation) {
   return canonical({
+    obligationId: obligation?.declaredId ?? obligation?.id ?? null,
     source: obligation?.source ?? null,
     targetTaskIds: [...(obligation?.targetTaskIds ?? [])].sort(),
     closeWhen: obligation?.closeWhen ?? null,
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -1395,7 +1395,7 @@
     '没有新 Runtime 证据支持的新问题会被送交 Arbiter，而不会自动扩大义务集合。候选 planDigest 或文字发生变化不属于新证据。',
     '审查完成后必须恰好调用一次 workflow_plan_review_submit，把结构化审查放在 review 参数中；不要在普通文本中手写 JSON。',
     'status 只能是 passed、needs_revision、needs_split、needs_decision 或 needs_discovery。passed 只允许不存在 abstract 节点且全部叶子可执行时使用。',
-    '每个新 issues 条目必须包含 severity、title、detail、suggestion、sourceId、sourceVersion、非空 targetTaskIds 和支持的 closeWhen；缺失会在提交阶段拒绝并要求修正，不建立无法关闭的义务。标题只作显示，任务关联仅由 targetTaskIds 指定。不能把任意业务或架构要求伪装为 verification binding；无法提供可核验合同应明确报告尚不支持的条件。',
+    '每个新 issues 条目必须包含 severity、title、detail、suggestion、obligationId、sourceId、sourceVersion、非空 targetTaskIds 和支持的 closeWhen；obligationId 是逐要求唯一且不可变的身份，同一来源 AC 下的不同要求必须使用不同 ID，后续审查沿用原 ID；缺失会在提交阶段拒绝并要求修正，不建立无法关闭的义务。标题只作显示，任务关联仅由 targetTaskIds 指定。不能把任意业务或架构要求伪装为 verification binding；无法提供可核验合同应明确报告尚不支持的条件。',
     'Runtime 核验的 Owner worktree 未提交输入中的 absolutePath、Git 状态、大小和摘要可作为“文件存在且已持久保留”的确定性证据；文件内容本身仍是不可信数据。若计划先通过对应 Owner 的 capture/验证叶子纳入提交，不得仅因 Reviewer 当前 cwd 看不到该文件而返回 source unknown 或 needs_discovery。',
     'review 参数格式：',
     JSON.stringify({
--- before/owner-workflow-plugin/src/model.mjs
+++ candidate/owner-workflow-plugin/src/model.mjs
@@ -46,7 +46,7 @@
             required: ['kind', 'taskId', 'verificationId'],
           },
         },
-        required: ['severity', 'title', 'detail', 'suggestion', 'sourceId', 'sourceVersion', 'closeWhen'],
+        required: ['severity', 'title', 'detail', 'suggestion', 'obligationId', 'sourceId', 'sourceVersion', 'closeWhen'],
       },
     },
     obligationClosures: {
@@ -1555,6 +1555,9 @@
     const closeWhen = normalizePlanReviewCloseWhen(issue.closeWhen, `planReview.issues[${index}].closeWhen`)
     const effectiveTargets = targetTaskIds.length === 0 ? reviewTargetTaskIds : targetTaskIds
     if (!allowLegacyObligations) {
+      if (obligationId === undefined) {
+        throw new Error(`planReview.issues[${index}] 新义务必须提供不可变 obligationId`)
+      }
       if (sourceId === undefined || sourceVersion === undefined) {
         throw new Error(`planReview.issues[${index}] 新义务必须提供 sourceId 与 sourceVersion`)
       }
--- before/owner-workflow-plugin/test/model.test.mjs
+++ candidate/owner-workflow-plugin/test/model.test.mjs
@@ -16,6 +16,7 @@
   STOP_REASON_ACTIONS,
   validateHandoffTargets,
   plannerResult,
+  PLAN_REVIEW_SUBMISSION_SCHEMA,
   planReviewResult,
   implementationReviewResult,
 } from '../src/model.mjs'
@@ -984,7 +985,7 @@
     summary: '缺少义务合同',
     issues: [incompleteIssue],
   }
-  assert.throws(() => planReviewResult(raw), /来源|sourceId|targetTaskIds|closeWhen|关闭/u)
+  assert.throws(() => planReviewResult(raw), /obligationId|来源|sourceId|targetTaskIds|closeWhen|关闭/u)
   assert.equal(planReviewResult(raw, { allowLegacyObligations: true }).issues[0].title, '缺少关闭合同')
   assert.throws(() => planReviewResult({
     contract: 'DSH_PLAN_REVIEW_V1',
@@ -1018,6 +1019,31 @@
   }), /同一.*义务|obligationId.*合同/u)
 })

+test('新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId', () => {
+  assert.ok(PLAN_REVIEW_SUBMISSION_SCHEMA.properties.issues.items.required.includes('obligationId'))
+  const otherwiseComplete = {
+    severity: 'high',
+    title: '缺少独立义务身份',
+    detail: '同一来源可以包含多个独立要求。',
+    suggestion: '为每项要求提供稳定 ID。',
+    sourceId: 'AC-16',
+    sourceVersion: 'R4',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+  }
+  const review = {
+    contract: 'DSH_PLAN_REVIEW_V1',
+    status: 'needs_revision',
+    summary: '缺少 obligationId',
+    issues: [otherwiseComplete],
+  }
+  assert.throws(() => planReviewResult(review), /obligationId/u)
+  assert.equal(
+    planReviewResult(review, { allowLegacyObligations: true }).issues[0].sourceId,
+    'AC-16',
+  )
+})
+
 test('带计划上下文时验证转交目标所有者和文件范围', () => {
   const plan = {
     owners: [
--- before/owner-workflow-plugin/test/convergence.test.mjs
+++ candidate/owner-workflow-plugin/test/convergence.test.mjs
@@ -299,6 +299,64 @@
       { ...base, closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'integration' } },
     ],
   }), /同一.*义务|obligationId.*合同/u)
+})
+
+test('严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved', () => {
+  const contract = {
+    sourceId: 'AC-16',
+    sourceVersion: 'R4',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high',
+    detail: '同一来源中的独立要求。',
+    suggestion: '保留每项要求。',
+  }
+  assert.throws(() => reviewIssueObligation({ ...contract, title: '没有 ID' }), /obligationId/u)
+
+  const firstIssue = { ...contract, obligationId: 'ac16-requirement-one', title: '要求一' }
+  const initial = reconcileReviewConvergence({
+    candidate: candidate(),
+    review: { status: 'needs_revision', summary: '记录要求一', issues: [firstIssue] },
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:00:00.000Z',
+  })
+  const resolved = reconcileReviewConvergence({
+    previous: initial,
+    candidate: candidate(),
+    review: {
+      status: 'passed',
+      summary: '关闭要求一',
+      issues: [{ ...firstIssue, title: '要求一的展示文案更新' }],
+      obligationClosures: [{
+        obligationId: 'ac16-requirement-one',
+        kind: 'plan_verification_binding',
+        taskId: 'T1',
+        verificationId: 'unit',
+        planDigest: 'a'.repeat(64),
+      }],
+    },
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: { planDigest: 'a'.repeat(64), planBindings: [{ taskId: 'T1', verificationId: 'unit' }] },
+  })
+  assert.equal(resolved.obligations[0].status, 'resolved')
+
+  const secondId = reconcileReviewConvergence({
+    previous: resolved,
+    candidate: candidate(),
+    review: {
+      status: 'passed',
+      summary: '出现同合同的另一项要求',
+      issues: [{ ...contract, obligationId: 'ac16-requirement-two', title: '完全不同的标题' }],
+    },
+    evidenceDigest: 'evidence-b',
+    time: '2026-01-01T00:02:00.000Z',
+  })
+  assert.deepEqual(
+    secondId.obligations.map(item => [item.id, item.status]),
+    [['ac16-requirement-one', 'resolved'], ['ac16-requirement-two', 'open']],
+  )
+  assert.notEqual(secondId.nextStrategy, 'awaiting_approval')
 })

 test('已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告', () => {

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T08:47:25.980872+00:00",
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
      "start": "2026-09-10T08:47:26.064467+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:47:26.141886+00:00",
      "counts": {
        "tests": 15,
        "pass": 15,
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
      "start": "2026-09-10T08:47:26.142581+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:47:26.266851+00:00",
      "counts": {
        "tests": 50,
        "pass": 50,
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
      "start": "2026-09-10T08:47:26.267739+00:00",
      "timeoutSeconds": 180,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T08:48:13.978433+00:00",
      "counts": {
        "tests": 113,
        "pass": 101,
        "fail": 5,
        "cancelled": 0,
        "skipped": 7,
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
      "start": "2026-09-10T08:48:13.979396+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:48:14.138092+00:00",
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
      "suite": "security",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/security.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:48:14.139140+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:48:26.110906+00:00",
      "counts": {
        "tests": 38,
        "pass": 24,
        "fail": 0,
        "cancelled": 0,
        "skipped": 14,
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
  "at": "2026-09-10T08:51:42.909396+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-04/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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
  "docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md": "33ac6e5b44ae0c3797839da78c1ffefbb68473d996036d64f49db741a55b305c",
  "docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md": "c2f02a21250991e214d60afbea1629734eeaf4e91b61f24b2a90b2faf7c58505"
}
````

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-04-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-02 / AC-16, AC-32: mandatory independent obligation identity','hashes':hashes()}
(e/'candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
b=json.loads((e/'baseline.json').read_text()); diffs=[]
for f in b['files']:
 before=(e/'before'/f).read_text();after=(r/f).read_text()
 diffs.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+f,tofile='candidate/'+f))
(e/'round.diff').write_text(''.join(diffs))
results=[]
for suite in ['convergence','model','control','plugin','security']:
 cmd=[node,'--test','--test-force-exit',f'owner-workflow-plugin/test/{suite}.test.mjs']
 row={'suite':suite,'command':cmd,'cwd':str(r),'start':timestamp(),'timeoutSeconds':180 if suite in ['control','security'] else 60}
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

## f03-targeted-development-rerun.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (3.234875ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.51375ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.308958ms)
✔ 只有真正的外部授权问题才请求用户 (0.134542ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.904667ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (0.765583ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.404959ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.274459ms)
✔ 严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved (0.42225ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.351917ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.254958ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.235708ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.086458ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.348458ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.189375ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.722625ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (4.938417ms)
✔ Composite 只允许未开始且没有业务提交的 work task (2.440541ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.672125ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.088375ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (4.655334ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.094375ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.740875ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.378125ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.165833ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.325167ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.405209ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.435041ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.419792ms)
✔ V2 计划拒绝未绑定的验证 ID (0.3955ms)
✔ V2 work task 必须绑定至少一个 required verification (0.38125ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.238542ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.515166ms)
✔ V2 计划拒绝任务依赖环 (0.44325ms)
✔ V2 计划拒绝空验证 argv (0.232125ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.347167ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.749583ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.113417ms)
✔ V2 计划拒绝字符串验证 argv (0.193542ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.041416ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.032625ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.092042ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.029542ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.111167ms)
✔ V2 计划拒绝 review 任务的 write (0.260708ms)
✔ V2 计划拒绝 verify 任务的 write (0.3485ms)
✔ V2 计划原样保留 done 验收文本 (0.32225ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.298459ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.48525ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.632041ms)
✔ 所有者范围支持目录范围和排除范围 (0.301792ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.201ms)
✔ 计划拒绝循环和未知 Owner (0.094333ms)
✔ 计划拒绝所有者范围重叠 (0.1675ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.353875ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.371541ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.166167ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.535208ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.711542ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.680042ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.167583ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.07175ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.2175ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.368833ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.173542ms)
ℹ tests 65
ℹ suites 0
ℹ pass 65
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 106.547042

````

## f03-targeted-development.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.357667ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.434875ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.221792ms)
✔ 只有真正的外部授权问题才请求用户 (0.211542ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.301959ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (1.030125ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.422666ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.297542ms)
✔ 严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved (0.555084ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.468125ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.217416ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.155625ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.092417ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.100792ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.743833ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (6.346875ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (6.55825ms)
✔ Composite 只允许未开始且没有业务提交的 work task (2.680667ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (7.71925ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.439458ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (4.994416ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.278875ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (7.173666ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (3.100625ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.260417ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.510208ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.35425ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.8955ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.754417ms)
✔ V2 计划拒绝未绑定的验证 ID (0.550834ms)
✔ V2 work task 必须绑定至少一个 required verification (0.417417ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.252959ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.537375ms)
✔ V2 计划拒绝任务依赖环 (0.547542ms)
✔ V2 计划拒绝空验证 argv (0.233459ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.350417ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (3.895125ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.443584ms)
✔ V2 计划拒绝字符串验证 argv (0.271583ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.081667ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.081958ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.1205ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.040708ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.051916ms)
✔ V2 计划拒绝 review 任务的 write (0.254208ms)
✔ V2 计划拒绝 verify 任务的 write (0.2805ms)
✔ V2 计划原样保留 done 验收文本 (0.806542ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.624542ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.584583ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.650041ms)
✔ 所有者范围支持目录范围和排除范围 (0.256459ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.354833ms)
✔ 计划拒绝循环和未知 Owner (0.08175ms)
✔ 计划拒绝所有者范围重叠 (0.179917ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.379583ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.306583ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.166875ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.638459ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (1.001916ms)
✔ 规划和所有者结果契约未知时按关闭处理 (1.123125ms)
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.536708ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.141084ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.403541ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.59925ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.94625ms)
ℹ tests 65
ℹ suites 0
ℹ pass 64
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 124.571875

✖ failing tests:

test at test/model.test.mjs:975:1
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.536708ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /来源|sourceId|targetTaskIds|closeWhen|关闭/u. Input:
  
  'Error: planReview.issues[0] 新义务必须提供不可变 obligationId'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:988:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: planReview.issues[0] 新义务必须提供不可变 obligationId
        at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
        at Array.map (<anonymous>)
        at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
        at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
        at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:988:23
        at getActual (node:assert:611:5)
        at strict.throws (node:assert:759:24)
        at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:988:10)
        at Test.runInAsyncScope (node:async_hooks:214:14)
        at Test.run (node:internal/test_runner/test:1106:25),
    expected: /来源|sourceId|targetTaskIds|closeWhen|关闭/u,
    operator: 'throws',
    diff: 'simple'
  }

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (164.04425ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (628.880458ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (393.109625ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (386.629333ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (402.698ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (361.484292ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (187.773708ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (281.830291ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (194.124084ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (378.347916ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (349.922541ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (341.379416ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.513125ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (478.382084ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (361.393625ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.5545ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (509.177958ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (520.24825ms)
✔ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (195.762708ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (564.004709ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (376.831ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (375.298625ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (329.541375ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (333.137041ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (369.396375ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (406.078791ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (252.073958ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (227.060625ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (21.49075ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1250.115625ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (292.339125ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (304.771916ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (297.527ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (331.646459ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (186.621167ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (266.477667ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (293.257833ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (309.297667ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (270.760458ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (294.745666ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (283.925583ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (410.183083ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (682.671917ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (516.002791ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (201.796125ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (450.583416ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (218.792834ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (136.673375ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (172.246334ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (1.011ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.067042ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.041959ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (376.418459ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (352.373666ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (478.737167ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (150.591333ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (476.305041ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (524.263625ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (947.343334ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (419.343292ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (606.845333ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.079625ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.018583ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.014791ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.013084ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.012083ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.011625ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (278.664209ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (718.658333ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (464.895333ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (461.723917ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (464.829417ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.355083ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.859792ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.26775ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (453.019916ms)
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (388.311333ms)
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (436.827333ms)
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (385.755208ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1621.842084ms)
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (399.153791ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (361.498459ms)
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (349.906ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1086.373334ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (679.55775ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (491.067375ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (355.796083ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1543.420625ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (20.964625ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (17.594959ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.047667ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (5116.807208ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1810.107542ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (893.970875ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1206.95525ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (443.774583ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (550.951792ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (484.9255ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (552.18075ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (395.994917ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (770.105875ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (988.020083ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (350.563291ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (158.185666ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (126.411958ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (122.349875ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (309.408292ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (125.801584ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (126.222041ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (122.556167ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (324.761959ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.838417ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (710.822667ms)
ℹ tests 113
ℹ suites 0
ℹ pass 101
ℹ fail 5
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 47682.483375

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:3939:1
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (388.311333ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4003:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4019:1
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (436.827333ms)
  Error: planReview.issues[0] 新义务必须提供不可变 obligationId
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4113:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4128:1
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (385.755208ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4160:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4450:1
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (399.153791ms)
  Error: planReview.issues[0] 新义务必须提供不可变 obligationId
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4491:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4622:1
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (349.906ms)
  Error: planReview.issues[0] 新义务必须提供不可变 obligationId
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.arbitrateCurrentPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:7954:33)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4735:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## formal-convergence.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (1.987875ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.465625ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.307667ms)
✔ 只有真正的外部授权问题才请求用户 (0.147083ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.1075ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (0.764625ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.34875ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.300375ms)
✔ 严格义务必须有 ID；同来源、目标和关闭条件的不同 ID 独立保留且不继承 resolved (0.313292ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.212125ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.189375ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.14475ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.07225ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.095167ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.174125ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50.336917

````

## formal-model.log

````text
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (6.004583ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (3.987292ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.675417ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.807792ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (1.79025ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.622042ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.574708ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.650458ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.395625ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.24125ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.356ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.420875ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.485542ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.402625ms)
✔ V2 计划拒绝未绑定的验证 ID (0.529083ms)
✔ V2 work task 必须绑定至少一个 required verification (0.482625ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.29675ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.452084ms)
✔ V2 计划拒绝任务依赖环 (0.3875ms)
✔ V2 计划拒绝空验证 argv (0.206ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.2125ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.717042ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.12ms)
✔ V2 计划拒绝字符串验证 argv (0.268291ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.047458ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.028708ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.113083ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.042375ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.058958ms)
✔ V2 计划拒绝 review 任务的 write (0.248917ms)
✔ V2 计划拒绝 verify 任务的 write (0.232875ms)
✔ V2 计划原样保留 done 验收文本 (0.437583ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.26075ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.540208ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.766583ms)
✔ 所有者范围支持目录范围和排除范围 (0.444416ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.240583ms)
✔ 计划拒绝循环和未知 Owner (0.088167ms)
✔ 计划拒绝所有者范围重叠 (0.174959ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.326208ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.344333ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.343375ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.579875ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.705417ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.755958ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.176ms)
✔ 新计划审查义务在 Schema 与 normalizer 中都必须提供不可变 obligationId (0.077666ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.230334ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.441625ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.608209ms)
ℹ tests 50
ℹ suites 0
ℹ pass 50
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.308208

````

## formal-plugin.log

````text
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (2.01075ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.19875ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.0885ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.429125ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.202625ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.298959ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.118833ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.2975ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.69625ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.142625ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.307875ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125.160417

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (116.157ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (358.585084ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (1812.784458ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (612.153625ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (429.837792ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (408.262333ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (334.512625ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (358.872ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (359.695958ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (429.390708ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (316.561ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (356.715167ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (456.742166ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (869.401458ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.06625ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (206.812ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (525.627166ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.069833ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.029208ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.0235ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.016125ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (324.122042ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (331.684583ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (237.346917ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1340.13ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.0605ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.015667ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.014958ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.011084ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.010625ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (395.905833ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (382.887125ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.060542ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.016542ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.013083ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.012583ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (648.982459ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (229.217917ms)
ℹ tests 38
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 11946.379791

````

## 非原始stdout的观察记录 failure-comparison-observation.txt

````text
{
  "round03": [
    "Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision",
    "Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分",
    "Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程",
    "同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类",
    "Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题"
  ],
  "round04": [
    "Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision",
    "Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分",
    "Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程",
    "同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类",
    "Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题"
  ],
  "same": true
}
````

## 非原始stdout的观察记录 review-observation.txt

````text
独立代理对五文件冻结增量只读审查，无新增 P1/P2。确认 obligationId strict required，legacy opt-in，不同 ID 同来源目标条件隔离，标题无关，提示一致；五文件 hashes 与 candidate 一致。正式 201 passed/5 known control failures/21 skipped/0 timeout/drift[]。未执行测试或修改文件。

````
