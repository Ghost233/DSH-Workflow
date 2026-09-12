# 第 3 轮原始证据

对应 [报告](report.md)。临时证据目录：`/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-round-03-05ck3_ms`。以当前候选指纹和本轮起始内容差分识别被测内容，不能用仓库 HEAD 代替未提交候选。

## 起始版本与状态

````json
{
  "at": "2026-09-10T07:59:07.380633+00:00",
  "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
  "files": {
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/convergence.mjs": "eae456c6e14bb78e76f9c3d7c4d09abcf23fb6b72c707d2c9475908895d435e9",
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
    "owner-workflow-plugin/src/runtime.mjs": "f74eeb2e6129d1fa349958d1f1bef919d95d60362246b374df8985aa72c0a1bb",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/model.mjs": "e21165816778bda602f7e3304260c969328d9e78cf658d9c5795db5ba7cac489",
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
    "owner-workflow-plugin/test/model.test.mjs": "299909787559daea479e6295d6d7a8246a14d28449fced83cf38922c60ca4970",
    "owner-workflow-plugin/test/control.test.mjs": "d369103c75288fd570e94d4d60a7ec7a5e0b730613ef0099c04d2f986cabbf5e",
    "owner-workflow-plugin/test/registry.test.mjs": "0b1f255ceb93bc3086b37e2992aa866bc28acd96b37f97bbf9ebecfc16512a0f",
    "owner-workflow-plugin/test/project-layout.test.mjs": "2c47b84998f44a1fcb2be3016421db6beda20ed5c842f96f22beadcee1593aa8",
    "owner-workflow-plugin/test/dashboard.test.mjs": "ec99b2b7fa542012c3c21ec2cc139ce9969e593c2edffe3a4224c0adaf7282bc",
    "owner-workflow-plugin/test/operation.test.mjs": "39d3868185c6ecfb5a8b12bf5b56619d63120441281704bc2dde1cd8de5c11c9",
    "owner-workflow-plugin/test/convergence.test.mjs": "5761b49d88e4277b85ff4b5cc4a82e5930bcdc85ae659b1bb081b02997a6baca",
    "owner-workflow-plugin/test/git.test.mjs": "368e9d09f65acc7b607fc47f17fd5410a89c06c7ce9b6642167d86239cfa2d39",
    "owner-workflow-plugin/test/security.test.mjs": "01a622f8674a12fe46795f51458042271adc801c5f529e26edc5d5534a2f7fa8",
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
      "status": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
      "refs": "refs/heads/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\nrefs/remotes/origin/main 154914064f5ceb2f8eb413865e10a54e8ffbc663\n"
    },
    "deepseek-harness": {
      "head": "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e",
      "branch": "master",
      "status": " M packages/host/apiproxy/src/fetch/client.ts\n M packages/host/apiproxy/tests/client-handler.spec.ts\n",
      "refs": ""
    },
    "dsh-synapse": {
      "head": "97f8c432de875d97bf7a5e4d675f8010f7b34556",
      "branch": "",
      "status": "",
      "refs": "refs/heads/main a323f76b0c47ffad59194d8ac7efacb3aa6bdfba\nrefs/remotes/origin/main 56935dc1862e7791b212f6eb2dd26404def5a575\n"
    },
    "owner-workflow-plugin/vendor/dsh-approve-for-me": {
      "head": "a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b",
      "branch": "main",
      "status": "",
      "refs": "refs/heads/main a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b\nrefs/remotes/origin/main 0e50918ff9dfd49b6cadf86093baa325a3bc16bf\n"
    }
  }
}
````

## 冻结候选

````json
{
  "at": "2026-09-10T08:18:37.089358+00:00",
  "scope": "T-02 / AC-16, AC-32, round-02 F-02..F-07 repairs",
  "hashes": {
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
@@ -60,28 +60,37 @@
 }

 function obligationTargets(issue, review) {
-  const issueText = `${issue?.title ?? ''} ${issue?.detail ?? ''} ${issue?.suggestion ?? ''}`
-  const embeddedTaskIds = issueText.match(/\bT[A-Za-z0-9_-]{0,63}\b/gu) ?? []
   return [...new Set([
     ...(issue?.targetTaskIds ?? review?.targetTaskIds ?? []),
-    ...embeddedTaskIds,
   ].map(value => String(value).trim()).filter(Boolean))].sort()
 }

-function obligationSource(issue, review, category) {
+function obligationSource(issue, review, { allowLegacyObligations }) {
   const declaredId = nonEmptyText(issue?.obligationId)
-  const sourceId = nonEmptyText(issue?.sourceId) ?? declaredId
-  const detail = normalizedText(issue?.detail)
-  const suggestion = normalizedText(issue?.suggestion)
-  const fallback = detail || suggestion || normalizedText(issue?.title)
+  const sourceId = nonEmptyText(issue?.sourceId)
+  const sourceVersion = nonEmptyText(issue?.sourceVersion) ?? nonEmptyText(review?.sourceVersion)
+  if (!allowLegacyObligations && sourceId === undefined) {
+    throw new Error('新审查义务必须提供显式 sourceId')
+  }
+  if (!allowLegacyObligations && sourceVersion === undefined) {
+    throw new Error('新审查义务必须提供显式 sourceVersion')
+  }
+  // A legacy record can be retained only through the explicit compatibility
+  // path. Its fallback intentionally hashes lossless fields: normalizedText
+  // erases paths and identifiers, so it is unsuitable for obligation identity.
+  const legacySource = digest(['legacy-review-requirement', {
+    title: String(issue?.title ?? ''),
+    detail: String(issue?.detail ?? ''),
+    suggestion: String(issue?.suggestion ?? ''),
+  }])
   return {
     declaredId,
-    id: sourceId ?? digest(['review-requirement', fallback]),
-    version: nonEmptyText(issue?.sourceVersion) ?? nonEmptyText(review?.sourceVersion) ?? String(review?.contract ?? 'unversioned-review'),
-  }
-}
-
-function normalizeCloseWhen(raw, targets) {
+    id: sourceId ?? declaredId ?? legacySource,
+    version: sourceVersion ?? String(review?.contract ?? 'unversioned-review'),
+  }
+}
+
+function normalizeCloseWhen(raw, targets, { allowLegacyObligations }) {
   if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
     const kind = nonEmptyText(raw.kind)
     const taskId = nonEmptyText(raw.taskId)
@@ -92,6 +101,9 @@
     if (kind === 'task_verification_result' && taskId !== undefined && verificationId !== undefined) {
       return { kind, taskId, verificationId }
     }
+  }
+  if (!allowLegacyObligations) {
+    throw new Error('新审查义务必须提供受支持的 closeWhen')
   }
   // Old reviews did not declare a Runtime-verifiable release condition. Keep
   // their obligations visible, but never infer that a later `passed` closes
@@ -117,12 +129,18 @@
     && typeof condition.verificationId === 'string'
 }

-export function reviewIssueObligation(issue, review = {}) {
+export function reviewIssueObligation(issue, review = {}, { allowLegacyObligations = false } = {}) {
+  if (allowLegacyObligations && typeof issue === 'string') {
+    issue = { title: issue, detail: issue, suggestion: '' }
+  }
   const category = issueCategory(issue)
   const targets = obligationTargets(issue, review)
+  if (!allowLegacyObligations && targets.length === 0) {
+    throw new Error('新审查义务必须提供显式 targetTaskIds')
+  }
   const title = String(issue?.title ?? '').trim()
-  const source = obligationSource(issue, review, category)
-  const closeWhen = normalizeCloseWhen(issue?.closeWhen, targets)
+  const source = obligationSource(issue, review, { allowLegacyObligations })
+  const closeWhen = normalizeCloseWhen(issue?.closeWhen, targets, { allowLegacyObligations })
   const identity = { source, targetTaskIds: targets, closeWhen }
   return {
     id: source.declaredId ?? digest(identity),
@@ -139,32 +157,58 @@
   }
 }

-export function reviewObligations(review) {
-  const obligations = (review?.issues ?? []).map(issue => reviewIssueObligation(issue, review))
-  if (obligations.length > 0) return [...new Map(obligations.map(item => [item.id, item])).values()]
+function assertNoBatchIdentityConflict(obligations) {
+  const seen = new Map()
+  for (const obligation of obligations) {
+    const existing = seen.get(obligation.id)
+    if (existing === undefined) {
+      seen.set(obligation.id, obligation)
+      continue
+    }
+    if (obligationIdentity(existing) !== obligationIdentity(obligation)) {
+      throw new Error(`同一 obligationId 不能声明不同义务合同：${obligation.id}`)
+    }
+  }
+  return [...seen.values()]
+}
+
+export function reviewObligations(review, { allowLegacyObligations = false } = {}) {
+  const obligations = (review?.issues ?? []).map(issue => {
+    if (issue === null || typeof issue !== 'object' || Array.isArray(issue)) {
+      if (!allowLegacyObligations) throw new Error('新审查义务必须是结构化合同')
+    }
+    return reviewIssueObligation(issue, review, { allowLegacyObligations })
+  })
+  if (obligations.length > 0) return assertNoBatchIdentityConflict(obligations)
   if (review?.status === 'needs_discovery') {
+    if (!allowLegacyObligations) {
+      throw new Error('新 needs_discovery 审查必须通过结构化 issues 提供义务合同')
+    }
     return (review.discoveryQuestions ?? []).map(question => ({
-      id: digest(['discovery', normalizedText(question)]),
+      id: digest(['discovery', String(question)]),
       category: 'discovery',
       severity: 'high',
       title: String(question),
       detail: String(question),
       suggestion: '由只读诊断代理取得 Runtime 可核验事实',
-      source: { id: digest(['discovery', normalizedText(question)]), version: String(review?.contract ?? 'unversioned-review') },
+      source: { id: digest(['discovery', String(question)]), version: String(review?.contract ?? 'unversioned-review') },
       targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort(),
       closeWhen: { kind: 'runtime_evidence_required', targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort() },
       status: 'open',
     }))
   }
   if (review?.status === 'needs_decision') {
+    if (!allowLegacyObligations) {
+      throw new Error('新 needs_decision 审查必须通过结构化 issues 提供义务合同')
+    }
     return (review.decisionQuestions ?? []).map(question => ({
-      id: digest(['decision', normalizedText(question)]),
+      id: digest(['decision', String(question)]),
       category: AUTHORITY_PATTERN.test(String(question)) ? 'external-authority' : 'architecture-decision',
       severity: 'high',
       title: String(question),
       detail: String(question),
       suggestion: '优先由 Owner 会诊与独立 Arbiter 根据现有 Intent 裁决',
-      source: { id: digest(['decision', normalizedText(question)]), version: String(review?.contract ?? 'unversioned-review') },
+      source: { id: digest(['decision', String(question)]), version: String(review?.contract ?? 'unversioned-review') },
       targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort(),
       closeWhen: { kind: 'runtime_evidence_required', targetTaskIds: [...new Set(review.targetTaskIds ?? [])].sort() },
       status: 'open',
@@ -245,8 +289,13 @@
 }

 function sameObligation(left, right) {
-  if (!hasClosureContract(left) || !hasClosureContract(right)) return false
-  return left.id === right.id && obligationIdentity(left) === obligationIdentity(right)
+  if (left?.id !== right?.id) return false
+  // Compatibility records may lack a closeWhen/source contract, but the
+  // persisted id still identifies the same retained record. Contract
+  // availability controls closure, never whether a repeated legacy record is
+  // a newly introduced obligation.
+  if (!hasClosureContract(left) || !hasClosureContract(right)) return true
+  return obligationIdentity(left) === obligationIdentity(right)
 }

 function uniqueObligations(values) {
@@ -256,13 +305,14 @@
 function identityConflicts(priorOpen, current) {
   const conflicts = []
   for (const next of current) {
-    if (next.declaredId === undefined) continue
+    const nextReferenceId = next.declaredId ?? next.id
     for (const previous of priorOpen) {
-      if (previous.declaredId !== next.declaredId) continue
-      if (obligationIdentity(previous) === obligationIdentity(next)) continue
+      const previousReferenceId = previous.declaredId ?? previous.id
+      if (previousReferenceId !== nextReferenceId) continue
+      if (sameObligation(previous, next)) continue
       conflicts.push({
         id: next.id,
-        declaredId: next.declaredId,
+        declaredId: nextReferenceId,
         previousObligationId: previous.id,
         reason: 'obligation_identity_changed',
       })
@@ -312,6 +362,7 @@
         && item?.planDigest === candidate.planDigest
         && item?.passed === true
         && item?.exitCode === 0
+        && item?.current === true
         && typeof item?.contentDigest === 'string'
         && item.contentDigest !== ''
       ))
@@ -363,8 +414,8 @@
   return questions.length > 0 && questions.some(question => AUTHORITY_PATTERN.test(String(question)))
 }

-export function reconcileReviewConvergence({ previous, candidate, review, evidenceDigest, time, runtimeEvidence }) {
-  const current = reviewObligations(review)
+export function reconcileReviewConvergence({ previous, candidate, review, evidenceDigest, time, runtimeEvidence, allowLegacyObligations = false }) {
+  const current = reviewObligations(review, { allowLegacyObligations })
   const sameCycle = previous?.contract === CONVERGENCE_CONTRACT
     && previous?.cycleId === candidate.cycleId
   // A PlanRevision can change its candidate digest, split a task, or start a
@@ -373,15 +424,16 @@
   // the cycle label changed would make a new plan an approval bypass.
   const baseline = previous?.contract === CONVERGENCE_CONTRACT ? previous : undefined
   const inheritedAcrossCycle = baseline !== undefined && !sameCycle
-  const priorOpen = baseline?.obligations?.filter(item => item.status === 'open') ?? []
+  const priorObligations = baseline?.obligations ?? []
+  const priorOpen = priorObligations.filter(item => item.status === 'open')
   const evidenceChanged = baseline !== undefined && baseline.evidenceDigest !== evidenceDigest
   const closures = new Map(priorOpen.map(item => [item.id, verifiedClosure(item, review, candidate, runtimeEvidence, time)]))
   const resolved = priorOpen.filter(item => closures.get(item.id)?.resolution !== undefined)
   const closureBlockers = priorOpen
     .filter(item => closures.get(item.id)?.resolution === undefined)
     .map(item => ({ id: item.id, reason: closures.get(item.id)?.reason ?? 'closure_evidence_missing' }))
-  const introduced = current.filter(item => !priorOpen.some(previousItem => sameObligation(previousItem, item)))
-  const conflicts = identityConflicts(priorOpen, current)
+  const introduced = current.filter(item => !priorObligations.some(previousItem => sameObligation(previousItem, item)))
+  const conflicts = identityConflicts(priorObligations, current)
   const conflictingIds = new Set(conflicts.map(item => item.id))
   const unconflictedIntroduced = introduced.filter(item => !conflictingIds.has(item.id))
   const admittedNew = baseline === undefined || evidenceChanged ? unconflictedIntroduced : []
--- before/owner-workflow-plugin/src/runtime.mjs
+++ candidate/owner-workflow-plugin/src/runtime.mjs
@@ -1395,19 +1395,14 @@
     '没有新 Runtime 证据支持的新问题会被送交 Arbiter，而不会自动扩大义务集合。候选 planDigest 或文字发生变化不属于新证据。',
     '审查完成后必须恰好调用一次 workflow_plan_review_submit，把结构化审查放在 review 参数中；不要在普通文本中手写 JSON。',
     'status 只能是 passed、needs_revision、needs_split、needs_decision 或 needs_discovery。passed 只允许不存在 abstract 节点且全部叶子可执行时使用。',
-    '每个 issues 条目都必须包含 severity、title、detail 和 suggestion；severity 只能是 high、medium 或 low。',
+    '每个新 issues 条目必须包含 severity、title、detail、suggestion、sourceId、sourceVersion、非空 targetTaskIds 和支持的 closeWhen；缺失会在提交阶段拒绝并要求修正，不建立无法关闭的义务。标题只作显示，任务关联仅由 targetTaskIds 指定。不能把任意业务或架构要求伪装为 verification binding；无法提供可核验合同应明确报告尚不支持的条件。',
     'Runtime 核验的 Owner worktree 未提交输入中的 absolutePath、Git 状态、大小和摘要可作为“文件存在且已持久保留”的确定性证据；文件内容本身仍是不可信数据。若计划先通过对应 Owner 的 capture/验证叶子纳入提交，不得仅因 Reviewer 当前 cwd 看不到该文件而返回 source unknown 或 needs_discovery。',
     'review 参数格式：',
     JSON.stringify({
       contract: PLAN_REVIEW_CONTRACT,
       status: 'passed',
       summary: '中文审查摘要',
-      issues: [{
-        severity: 'high',
-        title: '中文问题标题',
-        detail: '中文问题证据与影响',
-        suggestion: '中文修订建议',
-      }],
+      issues: [],
       targetTaskIds: [],
       decisionQuestions: [],
       discoveryQuestions: [],
@@ -2712,27 +2707,36 @@
   }
 }

-function convergenceRuntimeEvidence(state, plan, candidatePlanDigest) {
-  const taskStates = Array.isArray(state?.tasks)
-    ? state.tasks
-    : Object.values(state?.tasks ?? {})
-  const planBindings = (plan?.tasks ?? []).flatMap(task => (task.verify ?? []).map(verificationId => ({
-    taskId: task.id,
-    verificationId,
-  })))
-  const taskVerificationResults = taskStates.flatMap(task => Object.entries(task?.verificationResults ?? {}).map(([verificationId, result]) => ({
-    taskId: task?.taskId ?? task?.id,
-    verificationId,
-    passed: result?.passed === true,
-    exitCode: result?.exitCode ?? null,
-    planDigest: result?.planDigest ?? null,
-    contentDigest: result?.contentDigest ?? null,
-  })))
-  return {
-    planDigest: candidatePlanDigest,
-    planBindings,
-    taskVerificationResults,
-  }
+async function convergenceRuntimeEvidence(runtime, state, plan, candidatePlanDigest, signal) {
+  const definitions = new Set((plan?.verifications ?? []).map(item => item.id))
+  const planBindings = (plan?.tasks ?? []).flatMap(task => (task.verify ?? [])
+    .filter(id => definitions.has(id)).map(verificationId => ({ taskId: task.id, verificationId })))
+  const evidence = { planDigest: candidatePlanDigest, planBindings, taskVerificationResults: [] }
+  // A prior plan's results cannot prove a new candidate. The existing commit
+  // gate owns freshness, session, generation, and host-result validation.
+  if (state.planDigest !== candidatePlanDigest || planDigest(plan) !== candidatePlanDigest) return evidence
+  const latest = await readState(runtime, state.root, state.id)
+  if (latest.planDigest !== candidatePlanDigest) return evidence
+  for (const task of plan.tasks ?? []) {
+    const taskState = latest.tasks?.find(item => item.taskId === task.id)
+    if (Object.keys(taskState?.verificationResults ?? {}).length === 0) continue
+    const record = latest.ownerRuns?.[ownerRunKey(task.id, task.ownerId)]
+    const worktree = record?.worktree ?? record?.result?.worktree
+    if (typeof worktree !== 'string' || worktree === '') continue
+    try {
+      const checked = await runtime.assertRequiredTaskVerifications(latest, task.id, task.ownerId, worktree, {
+        allowCompleted: true, includeResults: true, signal,
+      })
+      for (const result of checked.verifiedResults) {
+        if (result.planDigest !== candidatePlanDigest) continue
+        evidence.taskVerificationResults.push({ ...result, current: true })
+      }
+    } catch (error) {
+      // Missing/expired evidence stays open; cancellation must still propagate.
+      abortIfNeeded(signal)
+    }
+  }
+  return evidence
 }

 function convergenceBlockers(convergence) {
@@ -2749,6 +2753,9 @@
       title: obligation.title ?? obligation.id,
       detail: obligation.detail ?? '',
       suggestion: obligation.suggestion ?? '',
+      sourceId: obligation.source?.id,
+      sourceVersion: obligation.source?.version,
+      closeWhen: obligation.closeWhen,
     })
   }
   for (const obligation of convergence.unsupportedNewObligations ?? []) {
@@ -2759,6 +2766,9 @@
       title: obligation.title ?? obligation.id,
       detail: obligation.detail ?? '',
       suggestion: obligation.suggestion ?? '',
+      sourceId: obligation.source?.id,
+      sourceVersion: obligation.source?.version,
+      closeWhen: obligation.closeWhen,
     })
   }
   for (const conflict of convergence.identityConflicts ?? []) {
@@ -2788,6 +2798,9 @@
     suggestion: blocker.suggestion || '提交与当前候选版本匹配、且由 Runtime 实际核验的解除证据。',
     obligationId: blocker.id,
     targetTaskIds: blocker.targetTaskIds,
+    ...(blocker.sourceId === undefined ? {} : { sourceId: blocker.sourceId }),
+    ...(blocker.sourceVersion === undefined ? {} : { sourceVersion: blocker.sourceVersion }),
+    ...(blocker.closeWhen === undefined ? {} : { closeWhen: blocker.closeWhen }),
   }))
   return {
     ...review,
@@ -2808,6 +2821,9 @@

 function assertConvergenceActivationAllowed(convergence, action, { planDigest, onlyMatchingCandidate = false } = {}) {
   if (onlyMatchingCandidate) {
+    // Already-active v1 workflows keep their original execution protocol.
+    // New approvals still use the strict guard (onlyMatchingCandidate=false).
+    if (convergence?.runtimeVersion === 'evidence-lease-v1' || convergence?.runtimeVersion === undefined) return
     const candidatePlanDigest = convergenceCandidatePlanDigest(convergence)
     // A pending revision owns a different candidate. Its open obligations
     // must not pause the previously approved DAG while that DAG remains the
@@ -6139,9 +6155,10 @@
             strategy: 'local_subgraph_rewrite',
           },
           review: state.planReview,
+          allowLegacyObligations: true,
           evidenceDigest: workflowEvidenceDigest(state, planningRuntimeFacts),
           time: migratedAt,
-          runtimeEvidence: convergenceRuntimeEvidence(state, state.plan, state.planDigest),
+          runtimeEvidence: await runtime.planReviewEvidence(state, state.plan, state.planDigest),
         })
         state = await runtime.withWorkflowLock(state.id, async () => {
           const current = await readState(runtime, state.root, state.id)
@@ -6413,7 +6430,7 @@
               ? 'request_user_authority'
               : 'local_subgraph_rewrite',
           progress: reviewed.review.status === 'passed' ? 'passed' : 'none',
-          obligations: reviewObligations(reviewed.review),
+          obligations: reviewObligations(reviewed.review, { allowLegacyObligations: true }),
           usedStrategies: [],
         }
         if (reviewedConvergence.nextStrategy === 'awaiting_approval') {
@@ -6903,7 +6920,7 @@
           review,
           evidenceDigest: workflowEvidenceDigest(state, planningRuntimeFacts),
           time: candidate.reviewedAt,
-          runtimeEvidence: convergenceRuntimeEvidence(state, candidate.plan, candidate.planDigest),
+          runtimeEvidence: await runtime.planReviewEvidence(state, candidate.plan, candidate.planDigest),
         })
         state.planConvergence = convergence
         const effectiveReview = effectivePlanReview(review, convergence)
@@ -7015,7 +7032,7 @@
           review: arbitrationReview,
           evidenceDigest: workflowEvidenceDigest(current, planningRuntimeFacts),
           time: reviewedAt,
-          runtimeEvidence: convergenceRuntimeEvidence(current, currentCandidate.plan, currentCandidate.planDigest),
+          runtimeEvidence: await runtime.planReviewEvidence(current, currentCandidate.plan, currentCandidate.planDigest),
         })
         current.planConvergence = convergence
         const effectiveReview = effectivePlanReview(arbitrationReview, convergence)
@@ -7180,9 +7197,10 @@
           previous: state.planConvergence,
           candidate,
           review: candidate.review,
+          allowLegacyObligations: true,
           evidenceDigest: workflowEvidenceDigest(state, planningRuntimeFacts),
           time: candidate.reviewedAt ?? now(),
-          runtimeEvidence: convergenceRuntimeEvidence(state, candidate.plan, candidate.planDigest),
+          runtimeEvidence: await runtime.planReviewEvidence(state, candidate.plan, candidate.planDigest),
         })
         candidate.review = effectivePlanReview(candidate.review, convergence)
         await runtime.withWorkflowLock(state.id, async () => {
@@ -7954,7 +7972,7 @@
           review: arbitrationReview,
           evidenceDigest: workflowEvidenceDigest(current, planningRuntimeFacts),
           time: reviewedAt,
-          runtimeEvidence: convergenceRuntimeEvidence(current, current.plan, current.planDigest),
+          runtimeEvidence: await runtime.planReviewEvidence(current, current.plan, current.planDigest),
         })
         const effectiveReview = effectivePlanReview(arbitrationReview, convergence)
         current.planReview = effectiveReview
@@ -8026,7 +8044,7 @@
         review,
         evidenceDigest: workflowEvidenceDigest(state, planningRuntimeFacts),
         time: state.planReviewedAt,
-        runtimeEvidence: convergenceRuntimeEvidence(state, state.plan, state.planDigest),
+        runtimeEvidence: await runtime.planReviewEvidence(state, state.plan, state.planDigest),
       })
       state.planConvergence = convergence
       const effectiveReview = effectivePlanReview(review, convergence)
@@ -14035,6 +14053,9 @@
         nextAction: 'Runtime 已为 Registry 后续规划启动新的 Planner 单轮；不要调用 workflow_recover、workflow_plan_review 或 workflow_plan_revise，等待 Runtime 主动回报。',
       }
     },
+    async planReviewEvidence(state, plan, candidatePlanDigest, signal) {
+      return convergenceRuntimeEvidence(runtime, state, plan, candidatePlanDigest, signal)
+    },
     async assertRequiredTaskVerifications(state, taskId, ownerId, worktree, options = {}) {
       if (state?.plan?.contract !== PLAN_V2_CONTRACT) return undefined
       if (typeof state.root !== 'string' || typeof state.id !== 'string') {
@@ -14072,9 +14093,16 @@
         workflowRoot: latest.root,
         worktree,
       }, options.signal))
+      const verifiedResults = []
       for (const verificationId of task.verify) {
         try {
           const result = taskState.verificationResults?.[verificationId]
+          const bound = resolveExecutionBoundVerification(latest.plan, task, verificationId, worktree)
+          if (result?.verificationId !== verificationId
+            || canonicalDigestValue(result?.argv) !== canonicalDigestValue(bound.argv)
+            || result?.cwd !== bound.cwd) {
+            throw new Error('验证结果的 verification/argv/cwd 与当前固定绑定不一致')
+          }
           if (result?.planDigest !== currentPlanDigest) {
             throw new Error(`验证结果 planDigest ${String(result?.planDigest)} 与当前 ${currentPlanDigest} 不一致`)
           }
@@ -14100,11 +14128,12 @@
             throw new Error(`验证结果写入代次 ${String(result?.writeGeneration)} 与当前代次 ${writeGeneration} 不一致，必须重新运行验证`)
           }
           assertPassingVerification(result, contentDigest)
+          verifiedResults.push({ ...result })
         } catch (error) {
           throw new Error(`任务 ${taskId} 的必需验证 ${verificationId} 未通过当前内容门禁：${errorText(error)}`)
         }
       }
-      return { contentDigest, verificationIds: [...task.verify] }
+      return { contentDigest, verificationIds: [...task.verify], ...(options.includeResults ? { verifiedResults } : {}) }
     },
     async assertPersistedOwnerRecord(state, stageId, ownerId, record, signal, { allowCompleted = false } = {}) {
       assertV2WorkflowExecutable(state, `幂等返回 Owner ${ownerId} 的持久化结果`)
--- before/owner-workflow-plugin/src/model.mjs
+++ candidate/owner-workflow-plugin/src/model.mjs
@@ -46,7 +46,7 @@
             required: ['kind', 'taskId', 'verificationId'],
           },
         },
-        required: ['severity', 'title', 'detail', 'suggestion'],
+        required: ['severity', 'title', 'detail', 'suggestion', 'sourceId', 'sourceVersion', 'closeWhen'],
       },
     },
     obligationClosures: {
@@ -1501,7 +1501,7 @@
   return handoffs
 }

-export function planReviewResult(raw) {
+export function planReviewResult(raw, { allowLegacyObligations = false } = {}) {
   if (raw?.contract !== PLAN_REVIEW_CONTRACT) {
     throw new Error(`计划审查结果契约不受支持：${String(raw?.contract)}`)
   }
@@ -1512,11 +1512,18 @@
   const decisionQuestions = textList(raw.decisionQuestions, 'planReview.decisionQuestions')
   const discoveryQuestions = textList(raw.discoveryQuestions, 'planReview.discoveryQuestions')
   const obligationClosures = normalizePlanReviewClosures(raw.obligationClosures)
+  const issues = normalizePlanReviewIssues(raw.issues, { allowLegacyObligations, reviewTargetTaskIds: targetTaskIds })
+  if (!allowLegacyObligations
+    && issues.length === 0
+    && ((raw.status === 'needs_discovery' && discoveryQuestions.length > 0)
+      || (raw.status === 'needs_decision' && decisionQuestions.length > 0))) {
+    throw new Error(`新的 ${raw.status} 审查必须通过结构化 issues 提供来源、目标和 closeWhen`)
+  }
   return {
     contract: PLAN_REVIEW_CONTRACT,
     status: raw.status,
     summary: text(raw.summary ?? '未提供计划审查摘要', 'planReview.summary'),
-    issues: normalizePlanReviewIssues(raw.issues),
+    issues,
     ...(obligationClosures.length === 0 ? {} : { obligationClosures }),
     ...(targetTaskIds.length === 0 ? {} : { targetTaskIds }),
     ...(decisionQuestions.length === 0 ? {} : { decisionQuestions }),
@@ -1524,11 +1531,16 @@
   }
 }

-function normalizePlanReviewIssues(value) {
+function normalizePlanReviewIssues(value, { allowLegacyObligations, reviewTargetTaskIds }) {
   if (value === undefined) return []
   if (!Array.isArray(value)) throw new Error('planReview.issues 必须是数组')
-  return value.map((issue, index) => {
-    if (typeof issue === 'string') return text(issue, `planReview.issues[${index}]`)
+  const normalized = value.map((issue, index) => {
+    if (typeof issue === 'string') {
+      if (!allowLegacyObligations) {
+        throw new Error(`planReview.issues[${index}] 新义务必须提供结构化来源、targetTaskIds 和 closeWhen`)
+      }
+      return text(issue, `planReview.issues[${index}]`)
+    }
     if (issue === null || typeof issue !== 'object' || Array.isArray(issue)) {
       throw new Error(`planReview.issues[${index}] 必须是字符串或结构化问题`)
     }
@@ -1541,6 +1553,21 @@
     const sourceVersion = issue.sourceVersion === undefined ? undefined : text(issue.sourceVersion, `planReview.issues[${index}].sourceVersion`)
     const targetTaskIds = identifierList(issue.targetTaskIds, `planReview.issues[${index}].targetTaskIds`, TASK_ID)
     const closeWhen = normalizePlanReviewCloseWhen(issue.closeWhen, `planReview.issues[${index}].closeWhen`)
+    const effectiveTargets = targetTaskIds.length === 0 ? reviewTargetTaskIds : targetTaskIds
+    if (!allowLegacyObligations) {
+      if (sourceId === undefined || sourceVersion === undefined) {
+        throw new Error(`planReview.issues[${index}] 新义务必须提供 sourceId 与 sourceVersion`)
+      }
+      if (effectiveTargets.length === 0) {
+        throw new Error(`planReview.issues[${index}] 新义务必须提供 targetTaskIds`)
+      }
+      if (closeWhen === undefined) {
+        throw new Error(`planReview.issues[${index}] 新义务必须提供 closeWhen`)
+      }
+      if (!effectiveTargets.includes(closeWhen.taskId)) {
+        throw new Error(`planReview.issues[${index}].closeWhen.taskId 必须属于 targetTaskIds`)
+      }
+    }
     return {
       severity,
       title: text(issue.title, `planReview.issues[${index}].title`),
@@ -1553,6 +1580,22 @@
       ...(closeWhen === undefined ? {} : { closeWhen }),
     }
   })
+  const contractsByObligationId = new Map()
+  for (const issue of normalized) {
+    if (issue === null || typeof issue !== 'object' || Array.isArray(issue) || issue.obligationId === undefined) continue
+    const identity = JSON.stringify({
+      sourceId: issue.sourceId,
+      sourceVersion: issue.sourceVersion,
+      targetTaskIds: [...(issue.targetTaskIds ?? reviewTargetTaskIds)].sort(),
+      closeWhen: issue.closeWhen,
+    })
+    const existing = contractsByObligationId.get(issue.obligationId)
+    if (existing !== undefined && existing !== identity) {
+      throw new Error(`同一 obligationId 不能声明不同义务合同：${issue.obligationId}`)
+    }
+    contractsByObligationId.set(issue.obligationId, identity)
+  }
+  return normalized
 }

 function normalizePlanReviewCloseWhen(value, field) {
--- before/owner-workflow-plugin/test/model.test.mjs
+++ candidate/owner-workflow-plugin/test/model.test.mjs
@@ -944,14 +944,14 @@
     summary: '需要决策',
     issues: [],
     decisionQuestions: ['是否允许真实外部服务？'],
-  }).decisionQuestions, ['是否允许真实外部服务？'])
+  }, { allowLegacyObligations: true }).decisionQuestions, ['是否允许真实外部服务？'])
   assert.deepEqual(planReviewResult({
     contract: 'DSH_PLAN_REVIEW_V1',
     status: 'needs_discovery',
     summary: '需要调查',
     issues: [],
     discoveryQuestions: ['仓库是否已有测试 harness？'],
-  }).discoveryQuestions, ['仓库是否已有测试 harness？'])
+  }, { allowLegacyObligations: true }).discoveryQuestions, ['仓库是否已有测试 harness？'])
   assert.throws(() => planReviewResult({ status: 'passed' }), /计划审查结果契约/u)
   assert.throws(() => planReviewResult({
     contract: 'DSH_PLAN_REVIEW_V1', status: 'failed', summary: '失败', issues: [],
@@ -969,6 +969,53 @@
     issues: [{ severity: 'high', title: '边界遗漏', detail: '测试未覆盖异常路径', suggestion: '补充回归测试' }],
   }).issues, ['[high] 边界遗漏：测试未覆盖异常路径 建议：补充回归测试'])
   assert.throws(() => implementationReviewResult({ status: 'passed' }), /实现审查结果契约/u)
+})
+
+test('新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取', () => {
+  const incompleteIssue = {
+    severity: 'high',
+    title: '缺少关闭合同',
+    detail: '必须补齐。',
+    suggestion: '重新提交。',
+  }
+  const raw = {
+    contract: 'DSH_PLAN_REVIEW_V1',
+    status: 'needs_revision',
+    summary: '缺少义务合同',
+    issues: [incompleteIssue],
+  }
+  assert.throws(() => planReviewResult(raw), /来源|sourceId|targetTaskIds|closeWhen|关闭/u)
+  assert.equal(planReviewResult(raw, { allowLegacyObligations: true }).issues[0].title, '缺少关闭合同')
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1',
+    status: 'needs_discovery',
+    summary: '只有自由文本问题',
+    issues: [],
+    discoveryQuestions: ['仓库是否已有测试 harness？'],
+  }), /结构化 issues|closeWhen/u)
+  assert.throws(() => planReviewResult({
+    contract: 'DSH_PLAN_REVIEW_V1',
+    status: 'needs_revision',
+    summary: '同 ID 不同合同',
+    issues: [
+      {
+        ...incompleteIssue,
+        obligationId: 'AC-16-proof',
+        sourceId: 'AC-16',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+      },
+      {
+        ...incompleteIssue,
+        obligationId: 'AC-16-proof',
+        sourceId: 'AC-16',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'integration' },
+      },
+    ],
+  }), /同一.*义务|obligationId.*合同/u)
 })

 test('带计划上下文时验证转交目标所有者和文件范围', () => {
--- before/owner-workflow-plugin/test/control.test.mjs
+++ candidate/owner-workflow-plugin/test/control.test.mjs
@@ -474,6 +474,59 @@
     const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
     assert.equal(saved.status, 'running')
     assert.equal(saved.ownerRuns['T1:api'].status, 'awaiting_finish')
+  } finally {
+    await fixture.runtime.dispose()
+    await removeFixtureRoot(fixture.root)
+  }
+})
+
+for (const version of ['evidence-lease-v1', 'evidence-lease-v2']) test(`R03 同 digest ${version} 的已批准 Owner 启动与恢复边界`, async () => {
+  const fixture = await supervisorControlFixture()
+  try {
+    const { state, registryDigest } = await preparePlanReviewRecoveryState(fixture)
+    state.registryDigest = registryDigest
+    state.status = 'approved'
+    state.planApproved = true
+    state.planReview = { contract: 'DSH_PLAN_REVIEW_V1', status: 'passed', summary: '当前 active plan 已通过', issues: [] }
+    state.planReviewDigest = state.planDigest
+    state.tasks = createTaskState(state.plan)
+    state.planConvergence = {
+      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
+      runtimeVersion: version,
+      history: [{ candidatePlanDigest: state.planDigest }],
+      obligations: [{ id: 'pending-only', status: 'open', title: '仅阻断待审批 revision', targetTaskIds: ['T1'] }],
+      closureBlockers: [{ id: 'pending-only', reason: 'closure_evidence_missing' }],
+      unsupportedNewObligations: [],
+      identityConflicts: [],
+    }
+    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
+    fixture.runtime.createOwnerEntry = async () => ({
+      branch: 'dsh/owner/test/api', worktree: fixture.root, baseCommit: state.workflowHead,
+    })
+    fixture.runtime.runOwnerEntry = async () => ({
+      branch: 'dsh/owner/test/api', worktree: fixture.root, baseCommit: state.workflowHead,
+      commitSha: state.workflowHead, sessionId: 'owner-t02-boundary', report: { summary: '已启动 active plan', changes: [], tests: [] },
+    })
+    if (version === 'evidence-lease-v2') {
+      await assert.rejects(fixture.runtime.runExternalOwner(fixture.agent, state.id, 'T1', 'api', undefined, { deferFinish: true }), /未关闭的证据义务/u)
+      await assert.rejects(fixture.runtime.recoverOwner(fixture.agent, state.id, 'T1', 'api'), /未关闭的证据义务/u)
+      return
+    }
+    const result = await fixture.runtime.runExternalOwner(fixture.agent, state.id, 'T1', 'api', undefined, { deferFinish: true })
+    assert.equal(result.phase, 'synced')
+    const saved = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    assert.equal(saved.status, 'running')
+    assert.equal(saved.ownerRuns['T1:api'].status, 'awaiting_finish')
+    saved.ownerRuns['T1:api'].status = 'completed'
+    await writeFile(fixture.statePath, `${JSON.stringify(saved, null, 2)}\n`, 'utf8')
+    let recovered = false
+    fixture.runtime.runExternalOwner = async () => { recovered = true; return {} }
+    fixture.runtime.finishOwner = async () => ({ phase: 'completed' })
+    await fixture.runtime.recoverOwner(fixture.agent, state.id, 'T1', 'api')
+    assert.equal(recovered, true)
+    const unchanged = JSON.parse(await readFile(fixture.statePath, 'utf8'))
+    assert.equal(unchanged.planConvergence.runtimeVersion, 'evidence-lease-v1')
+    assert.equal(unchanged.planConvergence.obligations[0].status, 'open')
   } finally {
     await fixture.runtime.dispose()
     await removeFixtureRoot(fixture.root)
@@ -3794,6 +3847,11 @@
         title: '缺少 Rust 验证',
         detail: '计划会修改 Rust 模块但没有 cargo test。',
         suggestion: '增加固定 Rust 测试。',
+        obligationId: 'ac-rust-t1-cargo-binding',
+        sourceId: 'AC-RUST-VERIFY',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'cargo-test' },
       }],
     }
     const result = runtime.submitPlanReview(reviewer, review)
@@ -3843,6 +3901,11 @@
               title: '缺少 Rust 验证',
               detail: '修改 Rust 模块却没有绑定固定验证。',
               suggestion: '增加 cargo test。',
+              obligationId: 'ac-rust-t1-cargo-binding',
+              sourceId: 'AC-RUST-VERIFY',
+              sourceVersion: 'R4',
+              targetTaskIds: ['T1'],
+              closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'cargo-test' },
             }],
           }
     }
@@ -4326,9 +4389,14 @@
       summary: 'Runner 应自动重建普通修订',
       issues: [{
         severity: 'medium',
-        title: '依赖顺序可直接修正',
-        detail: '一个独立叶子存在不必要依赖。',
-        suggestion: '删除不必要依赖后重新完整审查。',
+        title: 'T1 必须保持 unit fixed verification 绑定',
+        detail: '当前候选必须为 T1 绑定 unit fixed verification。',
+        suggestion: '确认 T1 的 unit 绑定后重新完整审查。',
+        obligationId: 'ac32-t1-unit-binding',
+        sourceId: 'AC-32',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
       }],
     }
     // 模拟从旧版状态恢复：旧候选没有证据义务账本，由 Runtime 首次审查时自动迁移。
@@ -4338,11 +4406,20 @@
       const options = args[4]
       if (options.role === 'planner') return plannerRunChild(...args)
       assert.equal(options.role, 'plan-reviewer')
+      const planDigestMatch = args[2].match(/当前 planDigest：([a-f0-9]{64})/u)
+      assert.notEqual(planDigestMatch, null)
       return {
         contract: 'DSH_PLAN_REVIEW_V1',
         status: 'passed',
         summary: 'Runner 重建后的候选可执行',
         issues: [],
+        obligationClosures: [{
+          obligationId: 'ac32-t1-unit-binding',
+          kind: 'plan_verification_binding',
+          taskId: 'T1',
+          verificationId: 'unit',
+          planDigest: planDigestMatch[1],
+        }],
       }
     }
     const driven = await runtime.drivePendingPlanRevision(agent, undefined, { source: 'runner-daemon' })
@@ -4460,24 +4537,31 @@
       summary: '固定验收义务仍待裁决',
       issues: [{
         severity: 'high',
-        title: '完成条件缺少独立证据',
-        detail: '当前完成条件无法由固定验证证明。',
-        suggestion: '由 Arbiter 判断候选是否已经满足验收边界。',
+        title: 'T1 必须绑定当前 unit fixed verification',
+        detail: '当前计划必须把 T1 与 unit fixed verification 明确绑定。',
+        suggestion: '由 Arbiter 根据 Runtime 的计划绑定证据裁决。',
+        obligationId: 'ac32-t1-unit-binding',
+        sourceId: 'AC-32',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
       }],
       targetTaskIds: ['T1'],
     }
     state.planReviewDigest = state.planDigest
     state.planConvergence = {
       contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
-      runtimeVersion: 'evidence-lease-v1',
+      runtimeVersion: 'evidence-lease-v2',
       cycleId: 'initial-cycle',
       evidenceDigest: 'evidence-a',
       obligations: [{
-        id: 'obligation-1',
+        id: 'ac32-t1-unit-binding',
         category: 'acceptance-evidence',
         severity: 'high',
-        title: '完成条件缺少独立证据',
+        title: 'T1 必须绑定当前 unit fixed verification',
+        source: { id: 'AC-32', version: 'R4' },
         targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
         status: 'open',
       }],
       unsupportedNewObligations: [],
@@ -4510,6 +4594,13 @@
         status: 'passed',
         summary: '冻结义务已经满足，不新增问题',
         issues: [],
+        obligationClosures: [{
+          obligationId: 'ac32-t1-unit-binding',
+          kind: 'plan_verification_binding',
+          taskId: 'T1',
+          verificationId: 'unit',
+          planDigest: state.planDigest,
+        }],
       }
     }

@@ -4664,9 +4755,14 @@
       summary: '第一轮仍缺少验证',
       issues: [{
         severity: 'high',
-        title: '缺少固定验证',
-        detail: '当前计划没有覆盖关键验收。',
-        suggestion: '增加固定验证。',
+        title: 'T1 的 unit fixed verification 必须有当前执行结果',
+        detail: '关键验收要求 T1 的 unit fixed verification 有当前成功结果。',
+        suggestion: '执行并持久化 T1 的 unit fixed verification 结果。',
+        obligationId: 'ac32-t1-unit-result',
+        sourceId: 'AC-32',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
       }],
     }
     const blockedState = JSON.parse(await readFile(statePath, 'utf8'))
@@ -4685,9 +4781,14 @@
           summary: '仍需继续修订',
           issues: [{
             severity: 'medium',
-            title: '验收仍不完整',
-            detail: '还缺少一个边界用例。',
-            suggestion: '补充边界验证。',
+            title: 'T1 的 unit fixed verification 必须有当前执行结果',
+            detail: '关键验收要求 T1 的 unit fixed verification 有当前成功结果。',
+            suggestion: '执行并持久化 T1 的 unit fixed verification 结果。',
+            obligationId: 'ac32-t1-unit-result',
+            sourceId: 'AC-32',
+            sourceVersion: 'R4',
+            targetTaskIds: ['T1'],
+            closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
           }],
         }
       }
@@ -4783,7 +4884,7 @@

     let valid = false
     let plannerCalls = 0
-    runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
+    runtime.runChild = async (_agent, _cwd, prompt, _signal, options) => {
       if (options?.role === 'reviewer') {
         return {
           contract: 'DSH_OWNER_PLANNING_ADVICE_V1',
@@ -5306,7 +5407,7 @@
     })
     let plannerCalls = 0
     let reviewerCalls = 0
-    runtime.runChild = async (_agent, _cwd, _prompt, _signal, options) => {
+    runtime.runChild = async (_agent, _cwd, prompt, _signal, options) => {
       if (options?.role === 'planner') {
         plannerCalls += 1
         return planResponse(plannerCalls, plannerCalls === 1 ? registryOperation : null)
@@ -5320,9 +5421,14 @@
               summary: `第 ${reviewerCalls} 轮审查要求修订`,
               issues: [{
                 severity: 'high',
-                title: '验收仍需收敛',
-                detail: '用完整状态链验证计划修订。',
-                suggestion: '修订后重新独立审查。',
+                title: 'T1 必须保持 unit fixed verification 绑定',
+                detail: '完整状态链要求 T1 绑定当前计划中的 unit fixed verification。',
+                suggestion: '确认 T1 的 unit 绑定后重新独立审查。',
+                obligationId: 'ac32-t1-unit-binding',
+                sourceId: 'AC-32',
+                sourceVersion: 'R4',
+                targetTaskIds: ['T1'],
+                closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
               }],
             }
           : {
@@ -5330,6 +5436,17 @@
               status: 'passed',
               summary: '计划审查通过',
               issues: [],
+              obligationClosures: [{
+                obligationId: 'ac32-t1-unit-binding',
+                kind: 'plan_verification_binding',
+                taskId: 'T1',
+                verificationId: 'unit',
+                planDigest: (() => {
+                  const planDigestMatch = prompt.match(/当前 planDigest：([a-f0-9]{64})/u)
+                  assert.notEqual(planDigestMatch, null)
+                  return planDigestMatch[1]
+                })(),
+              }],
             }
       }
       if (options?.role === 'reviewer') {
--- before/owner-workflow-plugin/test/convergence.test.mjs
+++ candidate/owner-workflow-plugin/test/convergence.test.mjs
@@ -7,6 +7,7 @@
   planStructureDigest,
   reconcileReviewConvergence,
   reviewIssueObligation,
+  reviewObligations,
   reviewRequiresUserAuthority,
   selectFailureRecovery,
   workflowEvidenceDigest,
@@ -34,7 +35,17 @@
   return {
     status,
     summary: detail,
-    issues: title === undefined ? [] : [{ severity: 'high', title, detail, suggestion: '修复问题' }],
+    issues: title === undefined ? [] : [{
+      obligationId: 'test-review-obligation',
+      sourceId: 'test-review-source',
+      sourceVersion: 'R4',
+      targetTaskIds: ['T1'],
+      closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+      severity: 'high',
+      title,
+      detail,
+      suggestion: '修复问题',
+    }],
     targetTaskIds: title === undefined ? [] : ['T1'],
   }
 }
@@ -94,7 +105,17 @@
     summary: '新增依赖来源要求',
     issues: [
       { ...fixedVerification, title: '固定验证入口仍缺失' },
-      { severity: 'high', title: '依赖来源不完整', detail: '缺少 registry 与 integrity', suggestion: '增加来源' },
+      {
+        obligationId: 'ac16-dependency-source',
+        sourceId: 'AC-16',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'registry' },
+        severity: 'high',
+        title: '依赖来源不完整',
+        detail: '缺少 registry 与 integrity',
+        suggestion: '增加来源',
+      },
     ],
     targetTaskIds: ['T1'],
   }
@@ -250,11 +271,79 @@
   })
   const titleCategoryBefore = reviewIssueObligation({
     title: 'Owner scope 仍然不明', detail: '同一条非展示要求。', suggestion: '补齐确定性证明。',
-  })
+  }, {}, { allowLegacyObligations: true })
   const titleCategoryAfter = reviewIssueObligation({
     title: '固定 verification 仍然不明', detail: '同一条非展示要求。', suggestion: '补齐确定性证明。',
-  })
-  assert.equal(titleCategoryBefore.id, titleCategoryAfter.id)
+  }, {}, { allowLegacyObligations: true })
+  assert.notEqual(titleCategoryBefore.id, titleCategoryAfter.id)
+})
+
+test('展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝', () => {
+  const base = {
+    obligationId: 'AC-16-unit',
+    sourceId: 'AC-16',
+    sourceVersion: 'R4',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high',
+    detail: '保留固定验证绑定。',
+    suggestion: '绑定 unit。',
+  }
+  const withTaskLikeTitle = reviewIssueObligation({ ...base, title: '说明中提到 T2 但目标仍是 T1' })
+  const retitled = reviewIssueObligation({ ...base, title: 'ordinary Title wording changed' })
+  assert.deepEqual(withTaskLikeTitle.targetTaskIds, ['T1'])
+  assert.equal(withTaskLikeTitle.id, retitled.id)
+  assert.throws(() => reviewObligations({
+    issues: [
+      base,
+      { ...base, closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'integration' } },
+    ],
+  }), /同一.*义务|obligationId.*合同/u)
+})
+
+test('已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告', () => {
+  const resolved = reviewIssueObligation({
+    obligationId: 'legacy-acceptance',
+    sourceId: 'AC-16',
+    sourceVersion: 'R4',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high',
+    title: '旧义务',
+    detail: '同一合同。',
+    suggestion: '无。',
+  })
+  const previous = {
+    contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
+    cycleId: candidate().cycleId,
+    evidenceDigest: 'evidence-a',
+    obligations: [{ ...resolved, status: 'resolved', resolvedAt: '2026-01-01T00:00:00.000Z' }],
+  }
+  const next = reconcileReviewConvergence({
+    previous,
+    candidate: candidate(),
+    review: {
+      status: 'passed',
+      summary: '重复报告了已解决义务',
+      issues: [{
+        obligationId: 'legacy-acceptance',
+        sourceId: 'AC-16',
+        sourceVersion: 'R4',
+        targetTaskIds: ['T1'],
+        closeWhen: { kind: 'plan_verification_binding', taskId: 'T1', verificationId: 'unit' },
+        severity: 'high',
+        title: '文案已改写',
+        detail: '同一合同。',
+        suggestion: '无。',
+      }],
+    },
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:01:00.000Z',
+  })
+  assert.equal(next.obligations.length, 1)
+  assert.equal(next.obligations[0].status, 'resolved')
+  assert.equal(next.unsupportedNewObligations.length, 0)
+  assert.equal(next.nextStrategy, 'awaiting_approval')
 })

 test('遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等', () => {
@@ -337,6 +426,65 @@
   })
   assert.equal(replayed.obligations.length, 1)
   assert.equal(replayed.obligations[0].status, 'resolved')
+})
+
+test('任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果', () => {
+  const issue = {
+    obligationId: 'AC-32-current-result',
+    sourceId: 'AC-32',
+    sourceVersion: 'R4',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high',
+    title: '需要当前验证结果',
+    detail: '验证结果不能来自旧内容。',
+    suggestion: '提供当前结果。',
+  }
+  const initial = reconcileReviewConvergence({
+    candidate: candidate(),
+    review: { status: 'needs_revision', summary: '需要当前验证结果', issues: [issue] },
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:00:00.000Z',
+  })
+  const closeReview = {
+    status: 'passed',
+    summary: '请求关闭',
+    issues: [],
+    obligationClosures: [{
+      obligationId: initial.obligations[0].id,
+      kind: 'task_verification_result',
+      taskId: 'T1',
+      verificationId: 'unit',
+      planDigest: initial.history[0].candidatePlanDigest,
+    }],
+  }
+  const baseResult = {
+    taskId: 'T1',
+    verificationId: 'unit',
+    planDigest: initial.history[0].candidatePlanDigest,
+    passed: true,
+    exitCode: 0,
+    contentDigest: 'content-a',
+  }
+  const stale = reconcileReviewConvergence({
+    previous: initial,
+    candidate: candidate(),
+    review: closeReview,
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:01:00.000Z',
+    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, taskVerificationResults: [baseResult] },
+  })
+  assert.equal(stale.obligations[0].status, 'open')
+  assert.equal(stale.closureBlockers[0].reason, 'closure_evidence_unverified')
+  const current = reconcileReviewConvergence({
+    previous: stale,
+    candidate: candidate(),
+    review: closeReview,
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:02:00.000Z',
+    runtimeEvidence: { planDigest: initial.history[0].candidatePlanDigest, taskVerificationResults: [{ ...baseResult, current: true }] },
+  })
+  assert.equal(current.obligations[0].status, 'resolved')
 })

 test('旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定', () => {
@@ -369,3 +517,53 @@
   assert.equal(next.inheritedAcrossCycle, true)
   assert.notEqual(next.nextStrategy, 'awaiting_approval')
 })
+
+test('显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入', () => {
+  const legacyIssue = {
+    obligationId: 'legacy-contract-free',
+    targetTaskIds: ['T1'],
+    severity: 'high',
+    title: '历史义务',
+    detail: '旧合同没有关闭条件。',
+    suggestion: '保留记录。',
+  }
+  const legacy = reviewIssueObligation(legacyIssue, {}, { allowLegacyObligations: true })
+  const next = reconcileReviewConvergence({
+    previous: {
+      contract: 'DSH_WORKFLOW_CONVERGENCE_V1',
+      cycleId: candidate().cycleId,
+      evidenceDigest: 'evidence-a',
+      obligations: [{ ...legacy, status: 'resolved', resolvedAt: '2026-01-01T00:00:00.000Z' }],
+    },
+    candidate: candidate(),
+    review: { status: 'passed', summary: '重复读取旧记录', issues: [legacyIssue] },
+    evidenceDigest: 'evidence-a',
+    time: '2026-01-01T00:01:00.000Z',
+    allowLegacyObligations: true,
+  })
+  assert.equal(next.obligations.length, 1)
+  assert.equal(next.obligations[0].status, 'resolved')
+  assert.equal(next.unsupportedNewObligations.length, 0)
+})
+
+
+test('旧字符串与问题列表按原文保留不同路径的要求身份', () => {
+  const options = { allowLegacyObligations: true }
+  const first = reviewIssueObligation('检查 src/alpha.ts', {}, options)
+  const second = reviewIssueObligation('检查 src/beta.ts', {}, options)
+  assert.notEqual(first.id, second.id)
+  assert.equal(first.title, '检查 src/alpha.ts')
+  for (const kind of ['decision', 'discovery']) {
+    const review = {
+      status: `needs_${kind}`,
+      issues: [],
+      [`${kind}Questions`]: ['检查 src/alpha.ts？', '检查 src/beta.ts？'],
+    }
+    const result = reconcileReviewConvergence({
+      previous: undefined, candidate: candidate(), review,
+      allowLegacyObligations: true,
+    })
+    assert.equal(result.obligations.length, 2)
+    assert.notEqual(result.obligations[0].id, result.obligations[1].id)
+  }
+})
--- before/owner-workflow-plugin/test/security.test.mjs
+++ candidate/owner-workflow-plugin/test/security.test.mjs
@@ -7,6 +7,7 @@
 import { execFile } from 'node:child_process'
 import { promisify } from 'node:util'
 import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
+import { reconcileReviewConvergence } from '../src/convergence.mjs'
 import { commitFiles, head, statusRecords } from '../src/git.mjs'
 import { ownerResult } from '../src/model.mjs'

@@ -334,6 +335,142 @@
       enforcement: 'full',
       passed: true,
     })
+  } finally {
+    await fixture.cleanup()
+  }
+})
+
+test('F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据', async () => {
+  const fixture = await ownerVerificationFixture()
+  let exec = fixture.exec
+  const issue = {
+    obligationId: 'f02-current-unit-result',
+    sourceId: 'F02',
+    sourceVersion: 'R4 5.10',
+    targetTaskIds: ['T1'],
+    closeWhen: { kind: 'task_verification_result', taskId: 'T1', verificationId: 'unit' },
+    severity: 'high',
+    title: 'T1 必须以当前固定验证结果关闭 F02',
+    detail: 'Reviewer 只能提交当前 T1/unit 的关闭请求，Runtime 必须重新核验真实 Owner 记录。',
+    suggestion: '重新运行 T1 的 unit 固定验证。',
+  }
+  const readWorkflowState = async () => JSON.parse(await readFile(fixture.statePath, 'utf8'))
+  const writeWorkflowState = async update => {
+    const state = await readWorkflowState()
+    update(state)
+    await writeFile(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
+    return state
+  }
+  const produce = () => fixture.runtime.recordBoundVerification({
+    task_id: 'T1',
+    verification_id: 'unit',
+    description: '为 F02 提供当前 Owner 固定验证记录',
+  }, exec)
+  const evidence = async () => {
+    const state = await readWorkflowState()
+    assert.equal(state.planDigest, candidate.planDigest, 'F02 的每次实时重验保持同一 planDigest')
+    return fixture.runtime.planReviewEvidence(state, state.plan, state.planDigest, exec.signal)
+  }
+  const state = await readWorkflowState()
+  const candidate = {
+    cycleId: 'f02-current-verification-cycle',
+    planDigest: state.planDigest,
+    planStructureDigest: 'f02-current-verification-structure',
+    strategy: 'diagnose',
+  }
+  const initial = reconcileReviewConvergence({
+    candidate,
+    review: {
+      status: 'needs_revision',
+      summary: 'F02 等待当前 T1/unit 验证结果',
+      issues: [issue],
+      targetTaskIds: ['T1'],
+    },
+    evidenceDigest: 'f02-initial-evidence',
+    time: '2026-09-10T00:00:00.000Z',
+  })
+  const closureReview = {
+    status: 'passed',
+    summary: 'Reviewer 请求使用当前 T1/unit 验证结果关闭 F02',
+    issues: [],
+    targetTaskIds: ['T1'],
+    obligationClosures: [{
+      obligationId: issue.obligationId,
+      kind: 'task_verification_result',
+      taskId: 'T1',
+      verificationId: 'unit',
+      planDigest: candidate.planDigest,
+    }],
+  }
+  const reconcile = (runtimeEvidence, time) => reconcileReviewConvergence({
+    previous: initial,
+    candidate,
+    review: closureReview,
+    evidenceDigest: 'f02-realtime-evidence',
+    time,
+    runtimeEvidence,
+  })
+  const assertEmptyAndOpen = async (label, time) => {
+    const current = await evidence()
+    assert.equal(current.planDigest, candidate.planDigest, `${label} 保留候选计划绑定`)
+    assert.deepEqual(current.taskVerificationResults, [], `${label} 不得投影过期或失败的宿主证据`)
+    const convergence = reconcile(current, time)
+    assert.equal(convergence.obligations[0].status, 'open', `${label} 不能关闭 F02 义务`)
+  }
+  const assertCurrentAndClosed = async (result, time) => {
+    const current = await evidence()
+    assert.deepEqual(current.planBindings, [{ taskId: 'T1', verificationId: 'unit' }])
+    assert.deepEqual(current.taskVerificationResults, [{ ...result, current: true }])
+    const convergence = reconcile(current, time)
+    assert.equal(convergence.obligations[0].status, 'resolved')
+    assert.equal(convergence.obligations[0].resolution.kind, 'task_verification_result')
+    assert.equal(convergence.obligations[0].resolution.contentDigest, result.contentDigest)
+  }
+
+  try {
+    let result = await produce()
+    await assertCurrentAndClosed(result, '2026-09-10T00:01:00.000Z')
+
+    await writeFile(join(fixture.worktree, 'src', 'owned', 'value.mjs'), 'export const value = 2\n', 'utf8')
+    await assertEmptyAndOpen('真实 worktree 内容变化', '2026-09-10T00:02:00.000Z')
+    result = await produce()
+    await assertCurrentAndClosed(result, '2026-09-10T00:03:00.000Z')
+
+    await writeWorkflowState(next => { next.tasks[0].writeGeneration = 1 })
+    await assertEmptyAndOpen('同 planDigest 的写入代次变化', '2026-09-10T00:04:00.000Z')
+    result = await produce()
+    await assertCurrentAndClosed(result, '2026-09-10T00:05:00.000Z')
+
+    const rotatedSessionId = 'owner-verification-session-rotated'
+    await writeWorkflowState(next => {
+      next.tasks[0].executorId = rotatedSessionId
+      next.ownerRuns['T1:security-owner'].sessionId = rotatedSessionId
+    })
+    await assertEmptyAndOpen('同 planDigest 的 Owner session 变化', '2026-09-10T00:06:00.000Z')
+    fixture.runtime.activeOwners.delete('owner-verification-session')
+    fixture.runtime.activeOwners.set(rotatedSessionId, fixture.active)
+    exec = { agent: ownerAgent(rotatedSessionId, fixture.worktree), signal: undefined }
+    result = await produce()
+    await assertCurrentAndClosed(result, '2026-09-10T00:07:00.000Z')
+
+    await writeWorkflowState(next => {
+      next.tasks[0].verificationResults.unit.argv = ['node', '--test', 'test/unbound.test.mjs']
+    })
+    await assertEmptyAndOpen('同 planDigest 的固定 argv 绑定变化', '2026-09-10T00:08:00.000Z')
+    result = await produce()
+    await assertCurrentAndClosed(result, '2026-09-10T00:09:00.000Z')
+
+    for (const [label, hostEvidence] of [
+      ['timedOut', { timedOut: true }],
+      ['aborted', { aborted: true }],
+      ['background', { kind: 'background' }],
+      ['ok:false', { ok: false }],
+    ]) {
+      await writeWorkflowState(next => Object.assign(next.tasks[0].verificationResults.unit, hostEvidence))
+      await assertEmptyAndOpen(`同 planDigest 的 ${label} 宿主证据`, `2026-09-10T00:10:${label.length.toString().padStart(2, '0')}Z`)
+      result = await produce()
+      await assertCurrentAndClosed(result, `2026-09-10T00:11:${label.length.toString().padStart(2, '0')}Z`)
+    }
   } finally {
     await fixture.cleanup()
   }

````

## 正式测试结果

````json
{
  "candidate": "2026-09-10T08:18:37.089358+00:00",
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
      "start": "2026-09-10T08:18:37.198729+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:18:37.268741+00:00",
      "counts": {
        "tests": 14,
        "pass": 14,
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
      "start": "2026-09-10T08:18:37.269413+00:00",
      "timeoutSeconds": 180,
      "exitCode": 1,
      "timedOut": false,
      "end": "2026-09-10T08:19:22.773859+00:00",
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
      "suite": "model",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/model.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:22.775665+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:22.921030+00:00",
      "counts": {
        "tests": 49,
        "pass": 49,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    },
    {
      "suite": "orchestrator-documents-native",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/orchestrator-documents-native.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:22.921865+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:23.878086+00:00",
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
      "suite": "runner",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/runner.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:23.878854+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:24.506212+00:00",
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
      "suite": "plan-revision",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/plan-revision.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:24.507186+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:24.626355+00:00",
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
      "start": "2026-09-10T08:19:24.627527+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:24.732913+00:00",
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
      "suite": "plugin",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/plugin.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:24.734435+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:24.883608+00:00",
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
      "start": "2026-09-10T08:19:24.884432+00:00",
      "timeoutSeconds": 180,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:36.513777+00:00",
      "counts": {
        "tests": 38,
        "pass": 24,
        "fail": 0,
        "cancelled": 0,
        "skipped": 14,
        "todo": 0
      }
    },
    {
      "suite": "verification",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/verification.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T08:19:36.514551+00:00",
      "timeoutSeconds": 60,
      "exitCode": 0,
      "timedOut": false,
      "end": "2026-09-10T08:19:36.590489+00:00",
      "counts": {
        "tests": 10,
        "pass": 10,
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
  "at": "2026-09-10T08:21:40.203725+00:00",
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
        "stdout": " M .gitignore\n M README.md\n M deepseek-harness\n M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md\n M docs/OWNER-WORKFLOW-V2-MIGRATION.md\n M docs/SYNAPSE-DYNAMIC-DAG.md\n M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md\n M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md\n M owner-workflow-plugin/README.md\n M owner-workflow-plugin/README.zh.md\n M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml\n M owner-workflow-plugin/client.js\n M owner-workflow-plugin/cordis.patch.yml\n M owner-workflow-plugin/dashboard-host.mjs\n M owner-workflow-plugin/index.js\n M owner-workflow-plugin/package.json\n M owner-workflow-plugin/scripts/build-client.mjs\n M owner-workflow-plugin/src/agent-policy.mjs\n M owner-workflow-plugin/src/client-runtime.js\n M owner-workflow-plugin/src/dashboard-page.mjs\n M owner-workflow-plugin/src/dashboard.mjs\n M owner-workflow-plugin/src/external-runner.mjs\n M owner-workflow-plugin/src/git.mjs\n M owner-workflow-plugin/src/memory.mjs\n M owner-workflow-plugin/src/model.mjs\n M owner-workflow-plugin/src/operation.mjs\n M owner-workflow-plugin/src/owner-agent.mjs\n M owner-workflow-plugin/src/owner-boundary.mjs\n M owner-workflow-plugin/src/owner-submission.mjs\n M owner-workflow-plugin/src/plan-revision.mjs\n M owner-workflow-plugin/src/registry.mjs\n M owner-workflow-plugin/src/runtime.mjs\n M owner-workflow-plugin/src/skills.mjs\n M owner-workflow-plugin/src/supervisor.mjs\n M owner-workflow-plugin/src/verification.mjs\n M owner-workflow-plugin/src/workflow-conversation.mjs\n M owner-workflow-plugin/test/client-bundle.test.mjs\n M owner-workflow-plugin/test/control.test.mjs\n M owner-workflow-plugin/test/dashboard-host.test.mjs\n M owner-workflow-plugin/test/dashboard.test.mjs\n M owner-workflow-plugin/test/git.test.mjs\n M owner-workflow-plugin/test/launcher.test.mjs\n M owner-workflow-plugin/test/memory.test.mjs\n M owner-workflow-plugin/test/model.test.mjs\n M owner-workflow-plugin/test/plan-revision.test.mjs\n M owner-workflow-plugin/test/plugin.test.mjs\n M owner-workflow-plugin/test/registry.test.mjs\n M owner-workflow-plugin/test/resilience.test.mjs\n M owner-workflow-plugin/test/runner.test.mjs\n M owner-workflow-plugin/test/security.test.mjs\n M owner-workflow-plugin/test/supervisor.test.mjs\n M owner-workflow-plugin/test/verification.test.mjs\n M package.json\n M start-owner-workflow.sh\n?? .dsh-workflow/.gitignore\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027\n?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029\n?? .zvec-grep/files.zvec/2/scalar.0.ipc\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073\n?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075\n?? .zvec-grep/files.zvec/LOCK\n?? .zvec-grep/files.zvec/del.1\n?? .zvec-grep/files.zvec/idmap.0/000004.log\n?? .zvec-grep/files.zvec/idmap.0/000008.sst\n?? .zvec-grep/files.zvec/idmap.0/CURRENT\n?? .zvec-grep/files.zvec/idmap.0/IDENTITY\n?? .zvec-grep/files.zvec/idmap.0/LOCK\n?? .zvec-grep/files.zvec/idmap.0/LOG\n?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/files.zvec/manifest.3\n?? .zvec-grep/index.zvec/0/embedding.index.5.proxima\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029\n?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031\n?? .zvec-grep/index.zvec/0/scalar.0.ipc\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052\n?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017\n?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023\n?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025\n?? .zvec-grep/index.zvec/LOCK\n?? .zvec-grep/index.zvec/del.0\n?? .zvec-grep/index.zvec/idmap.0/000004.log\n?? .zvec-grep/index.zvec/idmap.0/000008.sst\n?? .zvec-grep/index.zvec/idmap.0/CURRENT\n?? .zvec-grep/index.zvec/idmap.0/IDENTITY\n?? .zvec-grep/index.zvec/idmap.0/LOCK\n?? .zvec-grep/index.zvec/idmap.0/LOG\n?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005\n?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007\n?? .zvec-grep/index.zvec/manifest.3\n?? .zvec-grep/manifest.json\n?? CONTEXT.md\n?? docs/ORCHESTRATOR-DOCUMENTS.md\n?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md\n?? docs/analysis/2026-09-10-dsh-matt/analysis.md\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log\n?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs\n?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md\n?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log\n?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md\n?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json\n?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd\n?? docs/specs/main-thread-owner-workflow/progress.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-01/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-02/report.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/evidence.md\n?? docs/specs/main-thread-owner-workflow/rounds/round-03/report.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md\n?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md\n?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md\n?? owner-workflow-plugin/.dsh-workflow/.gitignore\n?? owner-workflow-plugin/src/convergence.mjs\n?? owner-workflow-plugin/src/orchestrator-documents.mjs\n?? owner-workflow-plugin/src/project-layout.mjs\n?? owner-workflow-plugin/src/workflow-state.mjs\n?? owner-workflow-plugin/test/convergence.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs\n?? owner-workflow-plugin/test/orchestrator-documents.test.mjs\n?? owner-workflow-plugin/test/project-layout.test.mjs\n?? owner-workflow-plugin/test/workflow-state.test.mjs\n?? test.md\n",
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

## 正式测试编排脚本

````python
from pathlib import Path
import json,hashlib,subprocess,datetime,difflib,os,signal
r=Path('/Volumes/LargeStorage/code/DSH-Workflow'); e=Path(Path('/tmp/dsh-round-03-evidence-path').read_text())
node='/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node'
def timestamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hashes():
 files=list((r/'owner-workflow-plugin/src').glob('*'))+list((r/'owner-workflow-plugin/test').glob('*.test.mjs'))+[r/'owner-workflow-plugin/index.js']
 files += [r/'deepseek-harness'/p for p in ['vendor/cordis/lib/index.js','packages/core/system-prompt/lib/index.js','packages/core/tools/lib/index.js','packages/fs/fs-local/lib/index.js','packages/fs/fs-observation-policy/lib/index.js','packages/fs/tool-fs/lib/index.js']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
c={'at':timestamp(),'scope':'T-02 / AC-16, AC-32, round-02 F-02..F-07 repairs','hashes':hashes()}
(e/'candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2))
b=json.loads((e/'baseline.json').read_text()); diffs=[]
for f in b['files']:
 before=(e/'before'/f).read_text();after=(r/f).read_text()
 diffs.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='before/'+f,tofile='candidate/'+f))
(e/'round.diff').write_text(''.join(diffs))
results=[]
for suite in ['convergence','control','model','orchestrator-documents-native','runner','plan-revision','workflow-state','plugin','security','verification']:
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

## control-development-01.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (247.385208ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (933.159375ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (562.369333ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (594.178666ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (613.407167ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (544.329958ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (265.327042ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (434.848375ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (322.298041ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (733.36425ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (569.768667ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (546.665209ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.523792ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (647.370958ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (564.775084ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.939417ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (751.355583ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (891.741208ms)
✔ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (285.434417ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (789.777833ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (541.691583ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (564.15175ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (502.014375ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (571.175875ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (593.656041ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (653.58375ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (402.844834ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (358.655625ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (20.431208ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1902.779833ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (451.907708ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (461.1535ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (437.53725ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (494.752ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (246.018042ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (326.673875ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (320.495708ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (329.133583ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (388.247125ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (410.965792ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (330.95625ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (416.100833ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (1033.156333ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (774.072333ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (313.315083ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (558.766917ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (213.178709ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (222.343709ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (282.532542ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (1.548958ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.121125ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.1375ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (575.284125ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (607.205916ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (691.405708ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (207.983083ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (681.787709ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (774.152959ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (1430.733458ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (677.168792ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (880.900625ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.092959ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.019709ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.014375ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.013792ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.098333ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.035708ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (346.884167ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (731.908ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (444.814125ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (454.43625ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (469.449625ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.472334ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.843041ms)
✖ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.274291ms)
✖ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (379.360458ms)
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (396.167417ms)
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (380.602042ms)
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (388.53925ms)
✖ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1420.111084ms)
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (429.410041ms)
✖ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (361.826584ms)
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (368.587458ms)
✖ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (708.042292ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (1000.374167ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (670.040291ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (484.219417ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1800.120958ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (19.017792ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (16.937083ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.046125ms) # SKIP
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (1742.975792ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (2364.327625ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (880.062958ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1263.506ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (457.554834ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (531.952167ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (461.125334ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (533.942709ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (399.954875ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (672.877041ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (901.234208ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (287.432458ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (147.763459ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (120.020875ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (119.462125ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (292.870125ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (115.815958ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (117.26075ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (117.950709ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (314.037833ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.514584ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (679.956417ms)
ℹ tests 113
ℹ suites 0
ℹ pass 95
ℹ fail 11
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 54898.8755

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:3827:1
✖ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.274291ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at Object.submitPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:7912:26)
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:3852:28)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)

test at owner-workflow-plugin/test/control.test.mjs:3873:1
✖ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (379.360458ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:3903:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:3929:1
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (396.167417ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:3993:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4009:1
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (380.602042ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4103:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4118:1
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (388.53925ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4150:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4182:1
✖ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1420.111084ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'needs_revision'
  - 'passed'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4403:12)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'needs_revision',
    expected: 'passed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/control.test.mjs:4426:1
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (429.410041ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4467:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4478:1
✖ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (361.826584ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'needs_revision'
  - 'passed'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4570:12)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'needs_revision',
    expected: 'passed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/control.test.mjs:4584:1
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (368.587458ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.arbitrateCurrentPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:7954:33)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4697:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4710:1
✖ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (708.042292ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4778:26)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:5326:1
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (1742.975792ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:5427:25)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## directed-green-identity-contract-rerun.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.386083ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.472417ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.239125ms)
✔ 只有真正的外部授权问题才请求用户 (0.1365ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.899208ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (1.084125ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.409625ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.3015ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.233292ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.370041ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.234875ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.097875ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.145625ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.93725ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (4.614667ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.687292ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.635959ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.01ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.797208ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.824875ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (4.970208ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.714583ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.179ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.398375ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.482791ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.49725ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.376459ms)
✔ V2 计划拒绝未绑定的验证 ID (0.448ms)
✔ V2 work task 必须绑定至少一个 required verification (0.399167ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.2485ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.389167ms)
✔ V2 计划拒绝任务依赖环 (0.384917ms)
✔ V2 计划拒绝空验证 argv (0.207542ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.293208ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.594042ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.264625ms)
✔ V2 计划拒绝字符串验证 argv (0.442875ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.075834ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.036625ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.117708ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.042084ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.049959ms)
✔ V2 计划拒绝 review 任务的 write (0.283625ms)
✔ V2 计划拒绝 verify 任务的 write (0.374ms)
✔ V2 计划原样保留 done 验收文本 (0.387ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.272958ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.486917ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.543417ms)
✔ 所有者范围支持目录范围和排除范围 (0.229875ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.160208ms)
✔ 计划拒绝循环和未知 Owner (0.073875ms)
✔ 计划拒绝所有者范围重叠 (0.155125ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.30875ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.248541ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.480167ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.631833ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.810958ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.687958ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.182916ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.227292ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.488042ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.492417ms)
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.821834

````

## directed-green-identity-contract.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (1.686542ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.946042ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.225375ms)
✔ 只有真正的外部授权问题才请求用户 (0.127208ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.97375ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (0.653958ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.383875ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.271292ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.19025ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.3ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.371584ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.126334ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.23675ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.894375ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (3.883167ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.771958ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.6755ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.008416ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.244584ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.621417ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (5.135416ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (1.447625ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.20275ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.346458ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.327875ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.544291ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.373459ms)
✔ V2 计划拒绝未绑定的验证 ID (0.352833ms)
✔ V2 work task 必须绑定至少一个 required verification (0.486042ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.291666ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.319791ms)
✔ V2 计划拒绝任务依赖环 (0.48175ms)
✔ V2 计划拒绝空验证 argv (0.221084ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.212625ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.7015ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.111458ms)
✔ V2 计划拒绝字符串验证 argv (0.284417ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.045541ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.028959ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.096042ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.031333ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.051666ms)
✔ V2 计划拒绝 review 任务的 write (0.229667ms)
✔ V2 计划拒绝 verify 任务的 write (0.214292ms)
✔ V2 计划原样保留 done 验收文本 (0.315834ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.256958ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.569375ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.444917ms)
✔ 所有者范围支持目录范围和排除范围 (0.225458ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.251792ms)
✔ 计划拒绝循环和未知 Owner (0.08525ms)
✔ 计划拒绝所有者范围重叠 (0.177667ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.508667ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.311375ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.201375ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.712959ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.685167ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.846667ms)
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.528959ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.261541ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.386667ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.285541ms)
ℹ tests 62
ℹ suites 0
ℹ pass 61
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 110.270167

✖ failing tests:

test at owner-workflow-plugin/test/model.test.mjs:974:1
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.528959ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /来源|targetTaskIds|closeWhen|关闭/u. Input:
  
  'Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:987:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
        at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
        at Array.map (<anonymous>)
        at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
        at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
        at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:987:23
        at getActual (node:assert:611:5)
        at strict.throws (node:assert:759:24)
        at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:987:10)
        at Test.runInAsyncScope (node:async_hooks:214:14)
        at Test.run (node:internal/test_runner/test:1106:25),
    expected: /来源|targetTaskIds|closeWhen|关闭/u,
    operator: 'throws',
    diff: 'simple'
  }

````

## first-red-identity-contract.log

````text
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (2.166833ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.947084ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.257458ms)
✔ 只有真正的外部授权问题才请求用户 (0.183916ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (0.99825ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (0.2865ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.3695ms)
✖ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.646ms)
✖ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.29075ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.309833ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.08725ms)
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (5.275375ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (5.398375ms)
✔ Composite 只允许未开始且没有业务提交的 work task (1.6555ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (5.88475ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (2.823167ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (3.65175ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (3.761125ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (5.246084ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (2.148791ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.215916ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.460333ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.479417ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.44425ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.337541ms)
✔ V2 计划拒绝未绑定的验证 ID (0.465542ms)
✔ V2 work task 必须绑定至少一个 required verification (0.448333ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.244583ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.485792ms)
✔ V2 计划拒绝任务依赖环 (0.413083ms)
✔ V2 计划拒绝空验证 argv (0.215833ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.255625ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (2.790167ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.103083ms)
✔ V2 计划拒绝字符串验证 argv (0.219833ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.044792ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.027542ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.095583ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.032458ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.051417ms)
✔ V2 计划拒绝 review 任务的 write (0.228625ms)
✔ V2 计划拒绝 verify 任务的 write (0.2135ms)
✔ V2 计划原样保留 done 验收文本 (0.41625ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.238625ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.424917ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.543333ms)
✔ 所有者范围支持目录范围和排除范围 (0.275084ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.185166ms)
✔ 计划拒绝循环和未知 Owner (0.086042ms)
✔ 计划拒绝所有者范围重叠 (0.191125ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.436708ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.327583ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.181708ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.622792ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.789333ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.875292ms)
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.442291ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.29675ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.48925ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.582916ms)
ℹ tests 60
ℹ suites 0
ℹ pass 57
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 102.147583

✖ failing tests:

test at owner-workflow-plugin/test/convergence.test.mjs:261:1
✖ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.646ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      'T1',
  +   'T2'
    ]
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/convergence.test.mjs:274:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ 'T1', 'T2' ],
    expected: [ 'T1' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/convergence.test.mjs:284:1
✖ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.29075ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  1 !== 0
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/convergence.test.mjs:325:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 1,
    expected: 0,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/model.test.mjs:974:1
✖ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.442291ms)
  AssertionError [ERR_ASSERTION]: Missing expected exception.
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/model.test.mjs:987:10)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:788:18)
      at Test.postRun (node:internal/test_runner/test:1235:19)
      at Test.run (node:internal/test_runner/test:1163:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /来源|targetTaskIds|closeWhen|关闭/u,
    operator: 'throws',
    diff: 'simple'
  }

````

## formal-control.log

````text
✔ 外部控制桥可以驱动 ping 和 status，并在运行时释放后清理 (148.851292ms)
✔ 真实审查入口把未关闭义务的 passed 降级，并拒绝激活 (585.06725ms)
✔ pending revision 的 open 义务不阻断仍有效的 active plan Owner 启动 (347.408167ms)
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (375.292917ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (382.936834ms)
✔ Supervisor create 只持久 reservation，必须由外置 runner 显式 execute 才启动 Owner (318.850167ms)
✔ Supervisor 首次启动保留计划修订迁移后的已完成任务 (176.125417ms)
✔ Supervisor 重启后直接结算已有固定提交，不重新启动 Owner (276.481167ms)
✔ Supervisor 遇到结构化 handoff 时进入局部重规划，不重跑只读验证任务 (222.673416ms)
✔ Runner daemon 自动发现 approved Workflow 并驱动 Harness 内 Owner 子代理 (465.902375ms)
✔ planning-recover 控制动作安全补绑缺失 digest 并原地恢复 Reviewer (347.091292ms)
✔ planning-recover 不会把旧 planDigest 的恢复次数继承到新 DAG (341.295375ms)
✔ Planner 子代理报告通道失效时直接唤醒主会话，避免状态已变但会话没有入口 (0.304209ms)
✔ Harness 重启后会向根会话幂等补发计划批准通知 (403.620417ms)
✔ 计划批准通知只投递到持久化的 Workflow 根会话 (543.140667ms)
✔ Planner 已提交结构化计划后立即结束等待，不受结束确认重试影响 (0.752ms)
✔ planning-recover 会重建仍有修订预算的 Planner，而不是把 review_failed 当作终态 (482.025334ms)
✔ 统一 workflow-drive 会恢复无需用户授权的 needs_decision Owner 会诊修订 (506.946125ms)
✔ 自治事故检测到新 Runtime 证据后由纯脚本 probe 续期并恢复 (185.470833ms)
✔ 修订预算耗尽会持久通知主线程和 Runner，批准扩展后自动恢复同一 Planner (508.509167ms)
✔ 重启前只标记 main-steer 已送达的待决策会重新直接打开原生问询 (360.522917ms)
✔ 用户终止自动规划后由只读子代理总结并返回主线程讨论 (359.136834ms)
✔ 重启后把旧版自定义扩额意见迁移为总结并退回主线程讨论 (310.679834ms)
✔ planning-recover 在 plan digest 与 live Registry 不匹配时拒绝自愈 (316.663542ms)
✔ 计划审查驱动失败会落盘诊断并允许 watchdog 有界重试 (375.272667ms)
✔ Runner daemon 自动唤醒失败的计划审查且不启动 Supervisor (396.648083ms)
✔ Runner 启动前可从固定提交重建尚未执行且已丢失的 Workflow worktree (286.149833ms)
✔ V2 控制桥拒绝 legacy owner 调度动作，唯一入口是 Supervisor (225.970084ms)
✔ runtime.dispose 阻止新 Supervisor dispatch 并等待已登记 dispatch 终态 (20.874833ms)
✔ Supervisor create 持久 reservation，并用真实 runExternalOwner 两阶段结算到 completed (1240.109667ms)
✔ Supervisor 查询会在 Runtime 重启后重建控制桥，供新的外置 runner 显式 recover (283.999875ms)
✔ Supervisor Owner 启动失败由自治恢复重排，不把工程故障写成用户决策 (293.496625ms)
✔ DSH_PLAN_V2 的 repair_owner 保留为意图提示，Runtime 按证据策略重新进入 DAG (302.854375ms)
✔ Supervisor inspect 只返回有限宿主字段，未知控制动作关闭处理 (346.078666ms)
✔ Supervisor 主会话通知只有真正 followup 成功后才标记 delivered (183.889083ms)
✔ Supervisor await_event 以持久游标阻塞等待，并在超时后记录一次受控观察 (252.439459ms)
✔ 任务达到 onTimeout.afterMs 后切换自治恢复策略而不是交给用户 (268.906708ms)
✔ Owner 恢复后使用本次运行时间重置超时基线，不沿用旧 reservation 时间 (257.788458ms)
✔ 持续产生心跳的长任务按进展续租，不因总运行时间被误杀 (257.040792ms)
✔ Supervisor receipt 绑定持久 revision，且 blocked workflow 不能确认旧 create (275.101291ms)
✔ Supervisor create receipt 绑定实际 planDigest，旧 ACK 拒绝且 workflow 不变 (213.612167ms)
✔ Supervisor stop receipt 绑定实际 planDigest，旧 stop 拒绝且 workflow 不变 (262.416792ms)
✔ blocked、failed、cancelled workflow 都不能把 stop 保存为 completed (626.506417ms)
✔ cancel 结算活动记录、清理临时分支与 worktree，并幂等保留审计状态 (503.104417ms)
✔ cancel 的持久路径记录异常时 fail-closed，不能删除项目根目录或基础分支 (198.058708ms)
✔ cancelled workflow 拒绝 Supervisor start，finalized workflow 拒绝 cancel (338.256417ms)
✔ 启用 Owner 工作模式后，主会话写入会被拒绝 (189.17675ms)
✔ 只读审计在脏工作区中运行，不创建 workflow 分支或 worktree (136.955167ms)
✔ workflow_recover 可以重建旧缺陷遗留的空 Supervisor task records (165.7305ms)
✔ 只读子代理继承完整工具集并只设置 read-only 沙箱 (0.804125ms)
✔ Owner 子代理策略继承完整工具并使用 workspace-write (0.064875ms)
✔ Operation 子代理继承完整工具但项目文件使用 read-only 沙箱 (0.041583ms)
✔ 历史 V1 计划即使 digest 匹配也不能批准执行 (361.992458ms)
✔ 批准修订计划时自动恢复旧 Runtime 丢失的已完成任务状态 (346.581458ms)
✔ 计划修订冻结 ownerRuns 已完成任务，只迁移新增 repair 与最终 verify (459.68225ms)
✔ 计划批准拒绝缺失的 live Registry，即使缓存 digest 匹配 (174.24225ms)
✔ 计划批准拒绝 live Registry 内容漂移，并由 registry_status 暴露 live digest (439.249625ms)
✔ 计划批准在 digest 已重新绑定时仍拒绝 Owner 定义漂移 (601.582333ms)
✔ finalize 会把 workflow 分支合并回启动分支并清理 worktree (921.865458ms)
✔ Implementation Review 必须读取实际 workflow HEAD 并保存审查结果 (423.022041ms)
✔ Implementation Review 问题自动转换为带自治批准策略的 repair PlanRevision (611.743958ms)
﹣ 旧版 Owner 持久子线程兼容测试（已由按任务回收模型替代） (0.111542ms) # SKIP
﹣ 旧版 Owner Shell 白名单测试（已由 worktree 与提交关卡替代） (0.021125ms) # SKIP
﹣ 旧版 Owner 逐写入包装测试（已由提交关卡替代） (0.014334ms) # SKIP
﹣ 旧版 owner_bash 快照测试（正式验证现在由 owner_submit 自动执行） (0.014917ms) # SKIP
﹣ 旧版多轮修复提示测试（现在由 owner_submit 在同一子线程返回错误） (0.01275ms) # SKIP
﹣ 旧版 Owner 结果文本结算测试（受保护路径由 owner_submit 提交关卡覆盖） (0.012125ms) # SKIP
✔ Owner Registry 提案在没有活动任务时只保存待审批提案 (296.373333ms)
✔ Owner 设定与批准只能由绑定的 Workflow 主线程执行 (715.200667ms)
✔ 规划器输出 Registry operation 时只保存结构化建议，不写正式 Registry，并由运行时绑定正式 digest (437.870042ms)
✔ 规划器的 proposal 包装会兼容为直接 Registry operation (442.164792ms)
✔ 规划器可一次提交完整 Owner Registry batch 并按最终快照绑定全部 Owner (482.8955ms)
✔ 规划提交只接受当前规划子代理的一次结构化结果 (0.471042ms)
✔ one-shot Planner 在 workflow_plan_submit 时即时校验并允许原线程修正 (0.725ms)
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (0.268083ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (436.325625ms)
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (376.75025ms)
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (378.14325ms)
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (380.244542ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1559.336459ms)
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (373.715375ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (359.011875ms)
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (344.920459ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1015.168167ms)
✔ 非法修订候选保留原计划并自动切换恢复策略，修复后继续审查 (661.7365ms)
✔ 计划修订并发调用复用 single-flight，并用新版超时策略恢复旧 180 秒失败预算 (478.024625ms)
✔ 计划修订拒绝使用不属于当前 planDigest 的旧审查结果 (332.832791ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1485.924333ms)
✔ Harness agent/status 持久化运行中、空闲和关闭生命周期 (18.93425ms)
✔ one-shot Reviewer 返回结果后立即持久化 closed，不在会话树中伪装成 idle 工作 (17.463916ms)
﹣ 旧版次数驱动 continuable Planner mock（已由证据租约、Arbiter 与完整 Workflow 集成测试替代） (0.04975ms) # SKIP
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (4579.858834ms)
✔ 取消功能 Workflow 后项目级 Owner Registry 仍被后续 Workflow 直接复用 (1716.644042ms)
✔ 旧 Workflow 中已批准但未进入基础分支的 Registry 会在继续流程时迁移 (869.305625ms)
✔ 新建 Workflow 会先迁移已取消旧 Workflow 中最新获批的固定 Owner (1174.741666ms)
✔ 规划器首轮提交不满足契约时，运行时会带校验错误重试一次 (436.069ms)
✔ 规划器只选择 Owner ID，Runtime 从正式 Registry 注入完整定义 (528.041ms)
✔ Planner 伪造宽 scope 不能绕过正式 Registry 的 task.write 边界 (461.72425ms)
✔ handoff 重规划 prompt 只声明 V2 任务计划契约 (490.226125ms)
✔ 规划器不能用未登记 Owner 绕过 Registry 提案审批 (370.391375ms)
✔ Registry 批准要求完全匹配 digest，写入 workflow worktree 并使旧计划审查失效 (670.602125ms)
✔ V2 Registry 批准后的 registry_pending_plan 可以原地重新规划 (899.771041ms)
✔ 运行中任务存在时拒绝 Registry 提案与批准 (290.989416ms)
✔ 主工具公开 cancel 描述且保留 status 旧动作 (152.454541ms)
✔ 旧聚合入口不再暴露或执行计划修订与规划恢复 (118.668166ms)
✔ 旧聚合入口拒绝 start，强制使用带 preflight digest 的单职责工具 (118.238ms)
✔ workflow_git_inspect 只提供受限 Git 证据且拒绝 .git 内部路径 (293.20875ms)
✔ Owner 结构化请求工具只暴露 request_subgraph 和 request_handoff 的最小字段 (122.124334ms)
✔ 公开 Owner 工具只保留提交关卡、宿主授权桥和结构化协调入口 (118.312875ms)
✔ 主工具 cancel 缺少 workflow_id 时拒绝 (118.388667ms)
✔ 主工具 cancel 返回 cancelled，随后 status 返回 cancelled (314.939875ms)
✔ 主工具只暴露 Registry 审批动作，不保留旧 Owner 直写动作 (0.393459ms)
✔ DSH_PLAN_V1 所有控制桥和外置执行入口拒绝但 status 可读 (722.622625ms)
ℹ tests 113
ℹ suites 0
ℹ pass 101
ℹ fail 5
ℹ cancelled 0
ℹ skipped 7
ℹ todo 0
ℹ duration_ms 45477.964625

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:3939:1
✖ Reviewer 不能要求 abstract decision 删除必填 Owner 会诊字段，必须重试为 decision (376.75025ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4003:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4019:1
✖ Reviewer 判定 needs_split 后，Owner 会诊参与目标节点的递归拆分 (378.14325ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4113:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4128:1
✖ Reviewer 判定 needs_decision 后停止自动修订并把问题总结回主线程 (380.244542ms)
  Error: 新的 needs_decision 审查必须通过结构化 issues 提供来源、目标和 closeWhen
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1520:11)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4160:22)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4450:1
✖ 同类审查问题连续出现时，Runtime 强制 Reviewer 从 needs_revision 升级分类 (373.715375ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
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
✖ Arbiter 可以把 Runtime 已知的 abstract 节点转入拆分而不误判为新问题 (344.920459ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
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
✔ 证据义务冻结后，相同语义问题不会因改写标题被当成新进展 (1.566792ms)
✔ 没有新 Runtime 证据时，Reviewer 新增问题进入仲裁而不是扩大冻结集合 (0.423125ms)
✔ 新 Runtime 证据允许吸收新义务，但不会关闭被遗漏的旧义务 (0.2405ms)
✔ 只有真正的外部授权问题才请求用户 (0.126375ms)
✔ 失败分类选择不同的自治恢复策略而不是统一 await_user (1.018166ms)
✔ Workflow 证据摘要只随可核验任务或 Runtime facts 变化 (0.683583ms)
✔ 稳定义务身份绑定来源、目标和解除条件，不能把同类同节点要求合并 (0.400167ms)
✔ 展示文案不得参与义务目标或身份，同 ID 的不同合同必须在接收时拒绝 (0.296083ms)
✔ 已解决的旧义务重复出现时保持 resolved，不作为新义务重新报告 (0.214417ms)
✔ 遗漏和 passed 都不能关闭义务；只有 Runtime 核验的当前版本解除证据才能关闭且重复幂等 (0.298125ms)
✔ 任务验证关闭只接受 Runtime 标记为当前、通过且绑定候选版本的结果 (0.2285ms)
✔ 旧义务缺少关闭合同时保持 open，并拒绝 Reviewer 自报的替代决定 (0.0965ms)
✔ 显式 legacy 读取路径保留同一缺关闭合同的已解决义务，不重新引入 (0.099ms)
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (0.200208ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.698459

````

## formal-model.log

````text
✔ 展开 Composite 后保留父外部依赖、后继依赖父且子图 entry/exit 可达 (7.95675ms)
✔ Composite 可递归拆分，直到所有 abstract 节点变成可执行叶子 (4.625666ms)
✔ Composite 只允许未开始且没有业务提交的 work task (2.057125ms)
✔ Composite 拒绝 ID 冲突、内部环、不可达 entry/exit、越界 Owner 和未绑定验证 (6.384708ms)
✔ 局部 delta 使被修改任务、Review 和依赖后继失效，并清空旧执行证据 (1.961125ms)
✔ 局部 delta 要求明确 carryForward，且不允许改写已完成任务或固定提交 (4.177208ms)
✔ 局部 delta 的失效闭包包含 Composite 父任务和父任务后继 (4.035792ms)
✔ Composite 子任务不能成为父任务外部依赖，delta 也不能改变 Registry 或删除固定提交证据 (5.447792ms)
✔ Plan delta 拒绝 V1 并规范化新增 V2 任务 (2.262667ms)
✔ V2 计划在构建自动机前拒绝超长 scope glob (0.322708ms)
✔ V2 计划在构建自动机前拒绝字面字符种类过多的 write glob (0.758083ms)
✔ V2 计划拒绝超出单层 Owner scope 的递归 write (0.594166ms)
✔ V2 计划拒绝与 Owner exclude 相交的 write (0.614167ms)
✔ V2 计划拒绝用单层通配符扩大问号 Owner scope (0.402583ms)
✔ V2 计划拒绝未绑定的验证 ID (0.45175ms)
✔ V2 work task 必须绑定至少一个 required verification (0.57075ms)
✔ 渐进式 DAG 允许 abstract work 暂不绑定写入和验证，并标记为不可执行 (0.369167ms)
✔ V2 计划拒绝未定义的 decomposition 状态并列出允许值 (0.386459ms)
✔ V2 计划拒绝任务依赖环 (0.586875ms)
✔ V2 计划拒绝空验证 argv (0.295042ms)
✔ V2 计划拒绝用 argv 字段替代 run 并返回可修复错误 (0.243292ms)
✔ V2 验证 cwd 只接受受限仓库相对目录并规范化保存 (3.191375ms)
✔ V2 计划拒绝把 legacy stages 或 completedStages 带入执行模型 (0.161709ms)
✔ V2 计划拒绝字符串验证 argv (0.604542ms)
✔ V2 生命周期使用固定 workflow 和 task 状态 (0.14575ms)
✔ 任务停止状态只接受固定的 reason/action 配对 (0.056917ms)
✔ 任务停止拒绝未定义的 reason/action 配对 (0.152166ms)
✔ 任务停止接受 input_missing/provide_input 配对 (0.051167ms)
✔ 任务停止接受其余固定 reason/action 配对 (0.078625ms)
✔ V2 计划拒绝 review 任务的 write (0.340916ms)
✔ V2 计划拒绝 verify 任务的 write (0.309917ms)
✔ V2 计划原样保留 done 验收文本 (0.503666ms)
✔ V1 历史计划可读取运行时目录范围且不可执行 (0.306208ms)
✔ V2 计划规范化显式角色，并按完成的依赖返回可执行任务 (0.722542ms)
✔ V2 就绪计算跳过运行中和已停止的根任务，并保留并行根任务顺序 (0.797042ms)
✔ 所有者范围支持目录范围和排除范围 (0.472667ms)
✔ 所有者范围正确处理问号、单层通配符和目录边界 (0.208417ms)
✔ 计划拒绝循环和未知 Owner (0.124833ms)
✔ 计划拒绝所有者范围重叠 (0.171417ms)
✔ V2 计划拒绝运行时管理目录的 Owner scope (0.50025ms)
✔ 父 Owner 排除完整子模块后允许合法拆分 (0.295875ms)
✔ 局部 exclude 不能掩盖父 scope 剩余区域的重叠 (0.39225ms)
✔ 所有者范围正确区分文件、目录和相邻路径 (0.64075ms)
✔ 所有者范围的问号和递归通配符参与重叠判断 (0.9885ms)
✔ 规划和所有者结果契约未知时按关闭处理 (0.775708ms)
✔ 新计划审查义务必须有显式来源、目标和可核验关闭合同，旧记录只能显式读取 (0.192584ms)
✔ 带计划上下文时验证转交目标所有者和文件范围 (0.224875ms)
✔ Owner 结果可以提出结构化长期记忆，但不能直接引用运行时目录 (0.388833ms)
✔ V2 计划规范化任务优先级和显式失败策略，并拒绝不完整修复策略 (1.321584ms)
ℹ tests 49
ℹ suites 0
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 114.611041

````

## formal-orchestrator-documents-native.log

````text
✔ 真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护 (85.90675ms)
▶ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档
  ✔ 会话位于项目根 (365.39675ms)
  ✔ 会话位于 docs 子目录 (364.592333ms)
✔ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档 (731.069458ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 927.805

````

## formal-plan-revision.log

````text
✔ PlanRevision 只保存精简的不可变计划快照 (1.852833ms)
✔ Workflow 只接受单根普通 fork 会话树中的 Intent 来源 (1.467ms)
✔ 只有 finalize 或完整取消清理才释放项目的唯一 Workflow 槽位 (0.251ms)
✔ Revision 变更只把权限收窄、Owner 变化和删除视为硬中止 (4.410625ms)
✔ 计划修订保留完成结果，只重新检查语义变化的节点 (0.536375ms)
✔ Planner 改写历史文案时冻结已完成 task，只执行新增 repair 与最终 verify (3.034959ms)
✔ 旧运行自然结束后先执行新增前置，再把旧结果重新排入待检查 (0.910333ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 83.034292

````

## formal-plugin.log

````text
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (1.969708ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.222458ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.111875ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.551208ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.256416ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.312541ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.133833ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.292042ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.542208ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.10275ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.369542ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 117.288791

````

## formal-runner.log

````text
✔ runner 对恢复错误使用固定分类，不把模型或控制桥错误混为同一种超时 (1.358333ms)
✔ runner daemon 参数只启用确定性工作区扫描且不要求 workflow-id (0.395291ms)
✔ runner daemon 发现可执行 Workflow 与需要恢复的卡住计划审查 (29.370208ms)
✔ runner daemon 并发唤醒多个卡住的规划且停止时持久化 attempt (103.650375ms)
✔ runner 不读取本地 workflow 状态，只执行 Supervisor 指定动作并逐个按 actionId ACK (80.245334ms)
✔ runner 只把 supervisor-inspect 的有限宿主观察回传给对应 ACK (83.608833ms)
✔ runner 让 Runtime 真正投递 notify 后才停止本次运行 (66.2165ms)
✔ runner 对未知 Supervisor 动作关闭处理且不发送派生请求 (61.964334ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 592.279459

````

## formal-security.log

````text
✔ Owner 不再使用工具白名单，完整能力由 worktree 和提交关卡承接 (134.324292ms)
✔ recordBoundVerification 把绑定验证结果写入 active、task 状态和日志 (378.808917ms)
✔ F02 的 task_verification_result 只接受实时重新核验的 Owner 固定验证证据 (1706.580334ms)
✔ 旧 Flutter 计划从唯一受控 test/write/pubspec 链推导 flutter_app，并用于同一计划全部 Flutter 验证 (614.853667ms)
✔ 旧 Flutter 计划的 allowed-once 重试复用同一 snapshotRoot/flutter_app (421.48675ms)
✔ 旧 Flutter 计划没有唯一 Flutter test/write/pubspec 证据时 fail-closed (411.370583ms)
✔ 验证快照保留相对符号链接，不再制造虚假的 contentDigest 漂移 (327.483042ms)
✔ 固定验证快照和内容摘要跳过 Git 忽略的构建产物 (348.756708ms)
✔ 固定验证快照保留被忽略的 node_modules CLI，但不把依赖计入提交内容 (351.431583ms)
✔ 固定验证被 workspace-write 拒绝后由 Owner 现场原生授权并精确重试一次 (411.989917ms)
✔ 固定验证获批后 Owner 绑定失效时不执行宿主重试 (306.835458ms)
✔ 固定验证失败会持久化并返回有界 stdout 与 stderr (330.356125ms)
✔ required verification result 必须绑定当前 V2 plan/task/Owner/session/status (425.984833ms)
✔ persisted Owner completed/awaiting/committed 快路径必须重验 V2 证据和现场 (823.260667ms)
﹣ 旧版普通文本 Owner 结果状态漂移测试（owner_submit 已在子线程内固定结果） (0.101083ms) # SKIP
✔ recordBoundVerification 拒绝不匹配 active/task、未绑定和未知 verification (202.31125ms)
✔ recordBoundVerification 对非 full 或非零 exit status 持久化负面证据并失败 (516.53625ms)
﹣ 旧版 Owner 手工验证缺失测试（owner_submit 现在自动执行固定验证） (0.092ms) # SKIP
﹣ 旧版 owner_write 写入代次测试（已由 contentDigest 提交关卡替代） (0.035333ms) # SKIP
﹣ 旧版 owner_edit 写入代次测试（已由 contentDigest 提交关卡替代） (0.025458ms) # SKIP
﹣ 旧版 owner_write 相同内容代次测试（逐写入包装已移除） (0.017792ms) # SKIP
✔ owner_verify 执行期间计划代次和真实 worktree 漂移时拒绝记录成功 (324.558708ms)
✔ owner_verify 忽略其他 Supervisor 记账造成的全局 revision 变化 (328.433583ms)
✔ owner_verify 执行固定验证前必须确认 shell 为 workspace-write (212.997917ms)
✔ owner_verify 对宿主失败证据持久化负面结果并拒绝通过 (1302.987958ms)
﹣ 旧版 Owner 逐写入范围测试（worktree 沙箱与提交关卡已有替代测试） (0.0685ms) # SKIP
﹣ 旧版 Owner 写入包装链接测试（最终提交关卡覆盖受保护现场） (0.017833ms) # SKIP
﹣ 旧版 Owner 写入包装长期记忆测试（最终提交关卡覆盖） (0.014541ms) # SKIP
﹣ 旧版 Owner 写入包装 Registry 测试（最终提交关卡覆盖） (0.011208ms) # SKIP
﹣ 旧版 Owner 写入包装大小写路径测试（最终提交关卡覆盖） (0.015916ms) # SKIP
✔ Owner scope 过宽时提交前后二次检查都拒绝 Owner Registry 的大小写路径别名 (369.707708ms)
✔ Owner scope 过宽时提交检查拒绝 .owner-workflow 路径 (369.044333ms)
﹣ 旧版 Owner Shell 命令白名单测试（Owner 现在使用正常 Harness Shell） (0.063125ms) # SKIP
﹣ 旧版 owner_bash 沙箱测试（固定验证仍保留快照证据） (0.018333ms) # SKIP
﹣ 旧版 owner_bash 副本测试（Owner 本身已位于隔离 worktree） (0.016583ms) # SKIP
﹣ 旧版逐写入操作日志测试（现在记录最终功能摘要和真实 diff） (0.0125ms) # SKIP
✔ 提交代理禁用 Git hook 并在提交后再次校验 Owner 文件范围 (633.246333ms)
✔ Owner scope 内的 Git 忽略构建产物不会进入提交，也不阻断结算 (228.858917ms)
ℹ tests 38
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 14
ℹ todo 0
ℹ duration_ms 11600.620959

````

## formal-verification.log

````text
✔ 固定 argv 解析复制并冻结目录定义，拒绝非 argv 输入 (0.85075ms)
✔ 绑定验证原样传递固定 argv 与 cwd，忽略调用者伪造的 argv (0.378791ms)
✔ Shell 缺少 exitCode 时按 ok 确定性归一化，异常载体仍 fail closed (0.251958ms)
✔ 绑定验证保留声明 cwd，旧验证缺省时只使用仓库根目录 (0.088167ms)
✔ 未知或未绑定验证 ID 在创建快照前拒绝 (0.204375ms)
✔ 验证结果包含固定 contentDigest 与可序列化证据字段 (0.347542ms)
✔ 验证结果仅在 contentDigest 完全相同时有效 (0.104334ms)
✔ 通过结果必须同时具备 full enforcement 与零 exitCode 证据 (0.152292ms)
✔ 主代理原生允许一次可以作为 approved-host 固定验证证据 (0.108625ms)
✔ ok:false、超时、中止或后台宿主证据绝不能成为 passed:true (0.266166ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 49.327084

````

## formal-workflow-state.log

````text
✔ mixed needs_decision 的失败 Planning Driver 仍由统一决策器恢复 (1.133ms)
✔ 真正外部授权的 needs_decision 只形成一次显式等待 (0.231542ms)
✔ Runner 生命周期由同一决策表覆盖执行、审查、修复和最终合并 (0.298417ms)
✔ 新 repair 候选不会继承上一轮 awaiting_approval 而绕过 Reviewer (0.115709ms)
✔ 旧 repair 候选缺少 approvalPolicy 时仍按内部 Intent 自治批准 (0.548209ms)
✔ pending handoff 在 running 状态也优先进入局部重规划 (0.256708ms)
✔ 已重规划 handoff 的新 DAG 不受旧 awaiting_main_discussion 阶段阻塞 (0.211375ms)
✔ 失败与阻塞现场不会从 Runner 视野中静默消失 (0.32175ms)
✔ 任务计数与唯一 Workflow 槽位使用同一纯状态语义 (0.367084ms)
✔ 代表性非终态都必须给出 command 或显式 wait，禁止静默空洞 (0.541958ms)
✔ 持久状态交叉空间中的每个组合都收敛为 command、wait、terminal 或 invariant (1.303541ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62.626958

````

## legacy-strings-development-green.log

````text
✔ 旧字符串与问题列表按原文保留不同路径的要求身份 (2.634084ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 42.399792

````

## r03-control-full-corrected.log

````text
✔ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (4739.627834ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4847.705709

````

## r03-control-targeted-post.log

````text
✔ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (2.408125ms)
✔ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (450.6615ms)
✔ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1538.579708ms)
✔ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (374.276292ms)
✔ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (1061.388666ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1490.729875ms)
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (2104.646625ms)
ℹ tests 7
ℹ suites 0
ℹ pass 6
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7134.77075

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:5374:1
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (2104.646625ms)
  ReferenceError: prompt is not defined
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:5445:43
      at runtime.runChild (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:5448:19)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3014:36)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:5500:26)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## r03-control-targeted-pre.log

````text
✖ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (1.884875ms)
✖ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (402.532708ms)
✖ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1205.47675ms)
✖ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (354.976875ms)
✖ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (523.716ms)
✔ 规划契约失败返回完整 Workflow ID，并在同一现场有界恢复 (1679.938667ms)
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (1647.750958ms)
ℹ tests 7
ℹ suites 0
ℹ pass 1
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5933.048792

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:3827:1
✖ 计划审查提交只接受当前 Plan Reviewer 的合法结构化结果 (1.884875ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at Object.submitPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:7912:26)
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:3852:28)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1106:25)
      at Test.start (node:internal/test_runner/test:1003:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:358:17)

test at owner-workflow-plugin/test/control.test.mjs:3873:1
✖ 计划 Reviewer 首轮状态非法时自动携带错误重试并保存结构化问题 (402.532708ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:3903:20)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:4182:1
✖ awaiting_main_discussion 接收明确 Intent 后可以生成 PlanRevision 候选 (1205.47675ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'needs_revision'
  - 'passed'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4403:12)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'needs_revision',
    expected: 'passed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/control.test.mjs:4478:1
✖ 冻结义务无进展时由独立 Arbiter 裁决而不是请求用户扩额 (354.976875ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'needs_revision'
  - 'passed'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4570:12)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'needs_revision',
    expected: 'passed',
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/control.test.mjs:4710:1
✖ 计划修订次数只作遥测，无进展时切换策略而不是请求扩额 (523.716ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:4778:26)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

test at owner-workflow-plugin/test/control.test.mjs:5326:1
✖ 完整 Workflow 从预检经过多轮计划审查、Supervisor、Owner 到最终交付 (1647.750958ms)
  Error: planReview.issues[0] 新义务必须提供 sourceId 与 sourceVersion
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1559:15
      at Array.map (<anonymous>)
      at normalizePlanReviewIssues (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1537:28)
      at planReviewResult (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/model.mjs:1515:18)
      at requestValidatedPlanReview (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:3028:22)
      at async Object.reviewPlan (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:8017:22)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:5427:25)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7)

````

## r03-f07-green.log

````text
✔ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (365.591208ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (332.566583ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 802.628625

````

## r03-f07-red.log

````text
✖ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (341.165833ms)
✔ R03 同 digest evidence-lease-v2 的已批准 Owner 启动与恢复边界 (332.930458ms)
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 778.3515

✖ failing tests:

test at owner-workflow-plugin/test/control.test.mjs:483:67
✖ R03 同 digest evidence-lease-v1 的已批准 Owner 启动与恢复边界 (341.165833ms)
  Error: Owner 执行被未关闭的证据义务阻断：pending-only(closure_evidence_missing)
      at assertConvergenceActivationAllowed (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:2821:9)
      at validateOwnerStartState (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:2677:3)
      at file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:11606:31
      at async Object.withOwnerLease (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:4587:24)
      at async file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:11574:13
      at async Object.withWorkflowLock (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:9125:16)
      at async file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:11569:11
      at async Object.runExternalOwner (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/src/runtime.mjs:11780:16)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/control.test.mjs:515:20)
      at async Test.run (node:internal/test_runner/test:1113:7)

````

## 非原始stdout的观察记录 legacy-strings-development-first-error.txt

````text
First targeted test failed (exit 1): TypeError Cannot read properties of undefined (reading obligations), control assertion incorrectly used result.ledger.obligations at convergence.test.mjs:566. Reconcile returns ledger directly; corrected assertion to result.obligations. Tool output preserved here as diagnostic description, not full raw stdout.

````

## 非原始stdout的观察记录 read-only-review-observation.txt

````text
独立代理只读审查确认 P1：obligationId 可省略，来源/目标/条件相同的不同要求可能合并并继承 resolved。正式结果后复核控制夹具：绑定正例只证明 T1/unit 静态关系，不能当作原宽泛业务/拆分要求通过；5 失败与缺失合同一致，无额外确认生产 P1/P2。未修改源码或运行额外测试。

````

## 非原始stdout的观察记录 security-development-observation.txt

````text
子代理报告：开发阶段 F02 定向 1 通过（约 2.16 秒）；security 全组 24 通过、14 跳过（约 11.2 秒）。原始 stdout 仅在子代理工具历史，未落盘。本记录不是原始日志，不计入正式测试总数；正式 security 将在冻结候选后独立采集。

````
