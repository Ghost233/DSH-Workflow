# 第 1 轮 T-01 原始证据

范围：R4 / T-01 / AC-26、AC-30。当前工作区源码直接测试，未创建开发分支或替代工作区。以下是本轮保存的原始记录；计数沿用 Node，父测试/子测试按其输出统计。

## 起始版本与原有现场

起始时间：2026-09-10T06:51:15.373Z。

### .

分支：`main`；HEAD：`154914064f5ceb2f8eb413865e10a54e8ffbc663`。

```text
 M .gitignore
 M README.md
 M deepseek-harness
 M docs/OWNER-WORKFLOW-TECHNICAL-ROUTE.md
 M docs/OWNER-WORKFLOW-V2-MIGRATION.md
 M docs/SYNAPSE-DYNAMIC-DAG.md
 M docs/superpowers/plans/2026-08-20-owner-workflow-v2.md
 M docs/superpowers/specs/2026-08-20-owner-workflow-v2-design.md
 M owner-workflow-plugin/README.md
 M owner-workflow-plugin/README.zh.md
 M owner-workflow-plugin/agent-presets/owner-workflow/agent.cordis.yml
 M owner-workflow-plugin/client.js
 M owner-workflow-plugin/cordis.patch.yml
 M owner-workflow-plugin/dashboard-host.mjs
 M owner-workflow-plugin/index.js
 M owner-workflow-plugin/package.json
 M owner-workflow-plugin/scripts/build-client.mjs
 M owner-workflow-plugin/src/agent-policy.mjs
 M owner-workflow-plugin/src/client-runtime.js
 M owner-workflow-plugin/src/dashboard-page.mjs
 M owner-workflow-plugin/src/dashboard.mjs
 M owner-workflow-plugin/src/external-runner.mjs
 M owner-workflow-plugin/src/git.mjs
 M owner-workflow-plugin/src/memory.mjs
 M owner-workflow-plugin/src/model.mjs
 M owner-workflow-plugin/src/operation.mjs
 M owner-workflow-plugin/src/owner-agent.mjs
 M owner-workflow-plugin/src/owner-boundary.mjs
 M owner-workflow-plugin/src/owner-submission.mjs
 M owner-workflow-plugin/src/plan-revision.mjs
 M owner-workflow-plugin/src/registry.mjs
 M owner-workflow-plugin/src/runtime.mjs
 M owner-workflow-plugin/src/skills.mjs
 M owner-workflow-plugin/src/supervisor.mjs
 M owner-workflow-plugin/src/verification.mjs
 M owner-workflow-plugin/src/workflow-conversation.mjs
 M owner-workflow-plugin/test/client-bundle.test.mjs
 M owner-workflow-plugin/test/control.test.mjs
 M owner-workflow-plugin/test/dashboard-host.test.mjs
 M owner-workflow-plugin/test/dashboard.test.mjs
 M owner-workflow-plugin/test/git.test.mjs
 M owner-workflow-plugin/test/launcher.test.mjs
 M owner-workflow-plugin/test/memory.test.mjs
 M owner-workflow-plugin/test/model.test.mjs
 M owner-workflow-plugin/test/plan-revision.test.mjs
 M owner-workflow-plugin/test/plugin.test.mjs
 M owner-workflow-plugin/test/registry.test.mjs
 M owner-workflow-plugin/test/resilience.test.mjs
 M owner-workflow-plugin/test/runner.test.mjs
 M owner-workflow-plugin/test/security.test.mjs
 M owner-workflow-plugin/test/supervisor.test.mjs
 M owner-workflow-plugin/test/verification.test.mjs
 M package.json
 M start-owner-workflow.sh
?? .dsh-workflow/.gitignore
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/000004.log
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/CURRENT
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/IDENTITY
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOCK
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/LOG
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000027
?? .zvec-grep/files.zvec/1/scalar.index.1.rocksdb/OPTIONS-000029
?? .zvec-grep/files.zvec/2/scalar.0.ipc
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000004.log
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000030.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000031.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000032.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000033.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000034.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000076.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/000078.sst
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/CURRENT
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/IDENTITY
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOCK
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/LOG
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/MANIFEST-000005
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000073
?? .zvec-grep/files.zvec/2/scalar.index.1.rocksdb/OPTIONS-000075
?? .zvec-grep/files.zvec/LOCK
?? .zvec-grep/files.zvec/del.1
?? .zvec-grep/files.zvec/idmap.0/000004.log
?? .zvec-grep/files.zvec/idmap.0/000008.sst
?? .zvec-grep/files.zvec/idmap.0/CURRENT
?? .zvec-grep/files.zvec/idmap.0/IDENTITY
?? .zvec-grep/files.zvec/idmap.0/LOCK
?? .zvec-grep/files.zvec/idmap.0/LOG
?? .zvec-grep/files.zvec/idmap.0/MANIFEST-000005
?? .zvec-grep/files.zvec/idmap.0/OPTIONS-000007
?? .zvec-grep/files.zvec/manifest.3
?? .zvec-grep/index.zvec/0/embedding.index.5.proxima
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000004.log
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000021.sst
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000025.sst
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000033.sst
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/000034.sst
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/CURRENT
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/IDENTITY
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOCK
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/LOG
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/MANIFEST-000005
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000029
?? .zvec-grep/index.zvec/0/fts.2.rocksdb/OPTIONS-000031
?? .zvec-grep/index.zvec/0/scalar.0.ipc
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000004.log
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000026.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000027.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000028.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000029.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000055.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000056.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000057.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/000059.sst
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/CURRENT
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/IDENTITY
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOCK
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/LOG
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/MANIFEST-000005
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000052
?? .zvec-grep/index.zvec/0/scalar.index.1.rocksdb/OPTIONS-000054
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/000004.log
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/CURRENT
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/IDENTITY
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOCK
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/LOG
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/MANIFEST-000005
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000017
?? .zvec-grep/index.zvec/1/fts.2.rocksdb/OPTIONS-000019
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/000004.log
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/CURRENT
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/IDENTITY
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOCK
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/LOG
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/MANIFEST-000005
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000023
?? .zvec-grep/index.zvec/1/scalar.index.1.rocksdb/OPTIONS-000025
?? .zvec-grep/index.zvec/LOCK
?? .zvec-grep/index.zvec/del.0
?? .zvec-grep/index.zvec/idmap.0/000004.log
?? .zvec-grep/index.zvec/idmap.0/000008.sst
?? .zvec-grep/index.zvec/idmap.0/CURRENT
?? .zvec-grep/index.zvec/idmap.0/IDENTITY
?? .zvec-grep/index.zvec/idmap.0/LOCK
?? .zvec-grep/index.zvec/idmap.0/LOG
?? .zvec-grep/index.zvec/idmap.0/MANIFEST-000005
?? .zvec-grep/index.zvec/idmap.0/OPTIONS-000007
?? .zvec-grep/index.zvec/manifest.3
?? .zvec-grep/manifest.json
?? CONTEXT.md
?? docs/ORCHESTRATOR-DOCUMENTS.md
?? docs/adr/0001-main-thread-spec-ticket-owner-execution.md
?? docs/analysis/2026-09-10-dsh-matt/analysis.md
?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.log
?? docs/analysis/2026-09-10-dsh-matt/convergence-repro.mjs
?? docs/analysis/2026-09-10-dsh-matt/discussion-record.md
?? docs/analysis/2026-09-10-dsh-matt/existing-tests.log
?? docs/analysis/2026-09-10-dsh-matt/owner-led-workflow-proposal.md
?? docs/analysis/2026-09-10-dsh-matt/source-fingerprints.json
?? docs/analysis/2026-09-10-dsh-matt/workflow.mmd
?? docs/specs/main-thread-owner-workflow/progress.md
?? docs/specs/main-thread-owner-workflow/tickets/t-01-document-root-identity.md
?? docs/specs/main-thread-owner-workflow/tickets/t-02-obligation-closure.md
?? docs/specs/main-thread-owner-workflow/tickets/t-03-verified-progress.md
?? docs/specs/main-thread-owner-workflow/tickets/t-04-decision-classification.md
?? docs/specs/main-thread-owner-workflow/tickets/t-05-planning-references.md
?? docs/specs/main-thread-owner-workflow/tickets/t-06-public-owner-request.md
?? docs/specs/main-thread-owner-workflow/tickets/t-07-planning-transaction-proof.md
?? docs/specs/main-thread-owner-workflow/tickets/t-08-owner-session-proof.md
?? docs/specs/main-thread-owner-workflow/tickets/t-09-durable-budget-proof.md
?? docs/specs/main-thread-owner-workflow/tickets/t-10-owner-history-recovery.md
?? docs/specs/main-thread-owner-workflow/tickets/t-11-acceptance-runner-contract.md
?? docs/specs/main-thread-owner-workflow/tickets/t-12-acceptance-runner-completion.md
?? docs/superpowers/specs/2026-09-10-main-thread-spec-ticket-owner-dag-design.md
?? owner-workflow-plugin/.dsh-workflow/.gitignore
?? owner-workflow-plugin/src/convergence.mjs
?? owner-workflow-plugin/src/orchestrator-documents.mjs
?? owner-workflow-plugin/src/project-layout.mjs
?? owner-workflow-plugin/src/workflow-state.mjs
?? owner-workflow-plugin/test/convergence.test.mjs
?? owner-workflow-plugin/test/orchestrator-documents-native.test.mjs
?? owner-workflow-plugin/test/orchestrator-documents.test.mjs
?? owner-workflow-plugin/test/project-layout.test.mjs
?? owner-workflow-plugin/test/workflow-state.test.mjs
?? test.md
```

### deepseek-harness

分支：`master`；HEAD：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

```text
 M packages/host/apiproxy/src/fetch/client.ts
 M packages/host/apiproxy/tests/client-handler.spec.ts
```

### dsh-synapse

分支：`detached`；HEAD：`97f8c432de875d97bf7a5e4d675f8010f7b34556`。

```text
(clean)
```

### owner-workflow-plugin/vendor/dsh-approve-for-me

分支：`main`；HEAD：`a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`。

```text
(clean)
```

## 固定候选

33 个相关源码/测试文件和 6 个实际加载的 Harness 构建入口已记录内容指纹；正式测试前后无漂移。原生测试使用已构建 lib，未运行构建或使用 git archive HEAD。

```json
{
  "at": "2026-09-10T06:54:23.653Z",
  "head": "154914064f5ceb2f8eb413865e10a54e8ffbc663",
  "scope": "T-01 / AC-26, AC-30",
  "sources": {
    "owner-workflow-plugin/src/agent-policy.mjs": "a8151dd3637105ba78ec400cfe21fe0a707c5fad79084b3249c99aa96320157b",
    "owner-workflow-plugin/src/client-runtime.js": "827e99f07b8d5a3f6e6df8bae71867ce2c8a0f318737a235f9a51a49b13a2d90",
    "owner-workflow-plugin/src/convergence.mjs": "f388c9508c7b92847bede176b808aff78fdd02a79ed649bbb1f647116109a344",
    "owner-workflow-plugin/src/dashboard-page.mjs": "457340df7fed006f189914a40b7a28e456c975b90ed6cae26374dc92f22c2582",
    "owner-workflow-plugin/src/dashboard.mjs": "6046206027436567ad71880b80edd63dec76bc6c273b54fb25b4ce2660c676fb",
    "owner-workflow-plugin/src/exact-command.mjs": "23232a500c74a6456f53f8d95a212287c35f3f6f7511d09bcbbf3792f48d6a88",
    "owner-workflow-plugin/src/external-runner.mjs": "5926b4e15819df617e301d390d21088e20ab06663a7207261444886457705343",
    "owner-workflow-plugin/src/git.mjs": "54e62266e808c08b1d181832e0802fce8432059bb14fb980005c964bb71ed842",
    "owner-workflow-plugin/src/intent.mjs": "db833b7a502cc61c4da97936b82e8a6a1cfdb54a0ca2cb283cc76b1b258bd620",
    "owner-workflow-plugin/src/memory.mjs": "b7f04c732870432d1289ed1276a0769bffeccf5c8e62da13611ce823c036d631",
    "owner-workflow-plugin/src/model.mjs": "5b93efe34fbe9fb78e1d0b400c6bff1b658ed90a8a3bae5e396a662275de0e5e",
    "owner-workflow-plugin/src/operation-approval.mjs": "a560f127dda1fc36d380614be86908e9c7a0a26b6706d106af6db7565164bc60",
    "owner-workflow-plugin/src/operation.mjs": "7e4b4c065cb5c193b2ab83966d4c214bebd3adcd4d7d3496948c9b4ce856b6a3",
    "owner-workflow-plugin/src/orchestrator-documents.mjs": "c63c7760ae50dfcb398b861ac906836e0c646e3d96725c9c3082d11c4036c919",
    "owner-workflow-plugin/src/owner-agent.mjs": "7249b0297a6b99e338b5069e2c08293afdc8ac9bf5cfca3017194dc5b482cbc6",
    "owner-workflow-plugin/src/owner-boundary.mjs": "307599a1e6dba3f2214fcee610d74f7552fcea4facbcbbe16e22a95c80adcace",
    "owner-workflow-plugin/src/owner-host-command.mjs": "fac216ff1e680d3492beee8490541c6ce3246182414bc6b531d1772ca496d400",
    "owner-workflow-plugin/src/owner-lifecycle.mjs": "ad0f043fb59dc1837763c7be429586d49caa5c306e9b029f42723276182183d7",
    "owner-workflow-plugin/src/owner-submission.mjs": "784122aab6dde4e9a44170ecdc72b37fbdaaf6d9ffeec8d1dced670b390252cb",
    "owner-workflow-plugin/src/plan-revision.mjs": "14d87958cbfcaaec0b98b9af2433bccc7b678680db6eddc9d760a78b9cf19af5",
    "owner-workflow-plugin/src/project-layout.mjs": "76dc22aa989789b61f2c1eba433a66a558ba9ea1f34219431579454b1a66ec4a",
    "owner-workflow-plugin/src/registry.mjs": "3e80f02957635159645e20e03e7f0818fefdb01876de79c953a00d6583d28a54",
    "owner-workflow-plugin/src/runtime.mjs": "4260600a1c5551e58027632277f88cbb65ecff6243a6d2ba7134e3b1f2b6b597",
    "owner-workflow-plugin/src/skills.mjs": "7520c41c9219dd93666ac2bbbe8390bc748bf317ad8f6c38f3f0b4b10772b959",
    "owner-workflow-plugin/src/supervisor.mjs": "57d665112fa471c1adb5e2810ee06813355a1a9e7ff4a3a1dda313b048322898",
    "owner-workflow-plugin/src/verification.mjs": "ece159d95577c6891a8fc0fa3a930e8abae2c3ef811b430b5997974328a88264",
    "owner-workflow-plugin/src/workflow-conversation.mjs": "7d0bab4e9aafc24db9a587c24c2dce18ec8eac925bb9a7cfbaaa65c927345757",
    "owner-workflow-plugin/src/workflow-state.mjs": "441102865e2b756046d7dbb126f829019878aee06b0bc084359fafa80525613d",
    "owner-workflow-plugin/index.js": "79f0be42eff17d500c55c353c2304143ca16ff480ca61f1b8168bc35f4d19730",
    "owner-workflow-plugin/test/orchestrator-documents.test.mjs": "33f8a47ebaea62a07a1cfeabd4e7265d63aed43a471c75e085c431100a05da1d",
    "owner-workflow-plugin/test/orchestrator-documents-native.test.mjs": "b2137bbac36c5671f23b5b422a108f35568f5d3bf2c4c31309212372943c9ef2",
    "owner-workflow-plugin/test/agent-policy.test.mjs": "066971a6dc8a0870a9ee91bc51436c3efecea06429c426495dc1981ef19d3fa4",
    "owner-workflow-plugin/test/plugin.test.mjs": "8b6447ac2d55554614d8234f0984d835e6d52b225cc1062408a8d6ec46e386d3"
  },
  "nativeBuilds": {
    "deepseek-harness/vendor/cordis/lib/index.js": "1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5",
    "deepseek-harness/packages/core/system-prompt/lib/index.js": "7f7307f6fa8c28d60a2e628d2c94c1a08c2a7bdb6f00602323556e1962fa4811",
    "deepseek-harness/packages/core/tools/lib/index.js": "47de95d14493dbd22d1a3ade14890fc99d7232db4e363f2190c9063b030dd029",
    "deepseek-harness/packages/fs/fs-local/lib/index.js": "9f31b7d19bee8ca0a51f0ef2fd6d4dc0c9bd0b10cc8378ea75a90beb134d32bb",
    "deepseek-harness/packages/fs/fs-observation-policy/lib/index.js": "e36b54cdb5c6fa01ccfa29f0433753e810ec1ac29a6a22be349d66b77eb64b03",
    "deepseek-harness/packages/fs/tool-fs/lib/index.js": "7ddcf5c2a267076f5154b220aa73a165cbc7257db8dd6a8644bd5ac86842b878"
  }
}
```

## 本轮增量

以本轮起始内容为基线，不是整个脏工作区相对 HEAD 的 diff。

```diff
--- before/owner-workflow-plugin/src/orchestrator-documents.mjs
+++ candidate/owner-workflow-plugin/src/orchestrator-documents.mjs
@@ -1,5 +1,5 @@
 import { lstatSync, realpathSync } from 'node:fs'
-import { isAbsolute, join, relative, resolve, sep } from 'node:path'
+import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

 const ROOT_DOCUMENTS = ['CONTEXT.md', 'CONTEXT-MAP.md']
 const DOCUMENT_DIRECTORIES = ['docs/adr', 'docs/specs']
@@ -28,12 +28,20 @@
     const canonicalRoot = realpathSync(root)
     const canonicalCwd = realpathSync(cwd)
     if (!within(canonicalRoot, canonicalCwd)) return undefined
-    const requested = resolve(canonicalCwd, filePath)
-    // Permit the project's own symlink alias (e.g. /var vs /private/var), not links below it.
-    const path = within(resolve(root), requested)
-      ? resolve(canonicalRoot, relative(resolve(root), requested))
-      : requested
-    if (!within(canonicalRoot, path)) return undefined
+    // Git may bind the real root while the session retains its original alias.
+    // Trust only ancestor spellings whose filesystem identity is that exact root.
+    const rootSpellings = new Set([resolve(root), canonicalRoot])
+    for (let ancestor = resolve(cwd); ; ancestor = dirname(ancestor)) {
+      if (realpathSync(ancestor) === canonicalRoot) rootSpellings.add(ancestor)
+      if (ancestor === dirname(ancestor)) break
+    }
+    const requested = resolve(cwd, filePath)
+    // The outermost matching root preserves internal links (including links back
+    // to the root) in the suffix, so the checks below can still reject them.
+    const spelling = [...rootSpellings].sort((left, right) => left.length - right.length)
+      .find(candidate => within(candidate, requested))
+    if (spelling === undefined) return undefined
+    const path = resolve(canonicalRoot, relative(spelling, requested))
     const rel = relative(canonicalRoot, path).split(sep).join('/')
     const parts = rel.split('/')
     if (parts.some(part => part.startsWith('.'))
--- before/owner-workflow-plugin/test/orchestrator-documents.test.mjs
+++ candidate/owner-workflow-plugin/test/orchestrator-documents.test.mjs
@@ -119,3 +119,31 @@
   assert.equal(runtime.checkToolExecution(call('src/code.mjs')), undefined)
   assert.equal(runtime.checkFilesystemWrite({ displayPath: join(root, 'src/code.mjs') }, call('src/code.mjs')), undefined)
 })
+
+test('真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝', async t => {
+  const { parent, root } = await fixture(t)
+  const canonicalRoot = await realpath(root)
+  const alias = join(parent, 'project-alias')
+  await symlink(canonicalRoot, alias)
+  await mkdir(join(root, 'docs/specs'), { recursive: true })
+  const check = (cwd, filePath) => orchestratorDocumentPath({ root: canonicalRoot, cwd, filePath })
+  const target = join(canonicalRoot, 'docs/specs/spec.md')
+  assert.equal(check(alias, join(alias, 'docs/specs/spec.md')), target)
+  assert.equal(check(join(alias, 'docs'), join(alias, 'docs/specs/spec.md')), target)
+  assert.equal(check(join(alias, 'docs'), 'specs/spec.md'), target)
+  assert.equal(check(alias, target), target)
+
+  await symlink(canonicalRoot, join(root, 'self'))
+  await symlink(join(canonicalRoot, 'docs/specs'), join(root, 'docs/shortcut'))
+  await symlink(join(parent, 'missing'), join(root, 'docs/specs/dangling.md'))
+  await writeFile(join(root, 'source'), 'code')
+  await link(join(root, 'source'), join(root, 'docs/specs/hard.md'))
+  for (const file of ['self/docs/specs/spec.md', 'docs/shortcut/spec.md', 'docs/specs/dangling.md',
+    'docs/specs/hard.md', 'docs/specs/AGENTS.md', 'docs/analysis/report.md',
+    'docs/superpowers/specs/spec.md', 'docs/superpowers/plans/plan.md', '.scratch/topic/issues/T-01.md']) {
+    assert.equal(check(alias, join(alias, file)), undefined, file)
+  }
+  assert.equal(check(join(alias, 'docs/shortcut'), 'spec.md'), undefined, 'relative cwd must not hide an internal link')
+  assert.equal(check(join(alias, 'self'), 'docs/specs/spec.md'), undefined, 'self link must not become a new root')
+  assert.equal(check(alias, join(parent, 'sibling/docs/specs/spec.md')), undefined)
+})
--- before/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs
+++ candidate/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs
@@ -1,12 +1,13 @@
 import test from 'node:test'
 import assert from 'node:assert/strict'
-import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
+import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
+import { execFileSync } from 'node:child_process'
 import { tmpdir } from 'node:os'
 import { join } from 'node:path'
 import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
 import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

-test('真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护', async t => {
+async function nativeModules(t) {
   const modules = [
     '../../deepseek-harness/vendor/cordis/lib/index.js',
     '../../deepseek-harness/packages/core/system-prompt/lib/index.js',
@@ -19,7 +20,13 @@
   for (const path of modules) {
     try { await access(new URL(path, import.meta.url)) } catch { t.skip('需要已构建的 deepseek-harness'); return }
   }
-  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = await Promise.all(modules.map(path => import(path)))
+  return Promise.all(modules.map(path => import(path)))
+}
+
+test('真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护', async t => {
+  const modules = await nativeModules(t)
+  if (modules === undefined) return
+  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
   const root = await mkdtemp(join(tmpdir(), 'dsh-native-main-docs-'))
   const ctx = new Context()
   const fibers = []
@@ -57,3 +64,73 @@
   assert.equal((await call('write', { file_path: join(root, 'src/code.js'), content: 'code' })).isError, true)
   await assert.rejects(access(join(root, 'src/code.js')), { code: 'ENOENT' })
 })
+
+test('真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档', async t => {
+  const modules = await nativeModules(t)
+  if (modules === undefined) return
+  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
+  for (const nested of [false, true]) await t.test(nested ? '会话位于 docs 子目录' : '会话位于项目根', async t => {
+    const parent = await mkdtemp(join(tmpdir(), 'dsh-preflight-docs-'))
+    const project = join(parent, 'project')
+    const alias = join(parent, 'project-alias')
+    await mkdir(join(project, 'docs'), { recursive: true })
+    const canonicalRoot = await realpath(project)
+    await symlink(canonicalRoot, alias)
+    const git = args => execFileSync('git', args, { cwd: project, stdio: 'pipe', timeout: 10_000 })
+    git(['init', '-b', 'main'])
+    git(['config', 'user.email', 'document-fixture@example.invalid'])
+    git(['config', 'user.name', 'Document fixture'])
+    await writeFile(join(project, 'README.md'), 'fixture')
+    git(['add', 'README.md'])
+    git(['commit', '-m', 'fixture'])
+
+    const ctx = new Context()
+    const fibers = []
+    const runtime = createOwnerWorkflowRuntime({}, {})
+    const agent = { id: 'preflight-main', session: { id: 'preflight-main', header: { cwd: nested ? join(alias, 'docs') : alias } },
+      ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
+    const disposers = []
+    t.after(async () => {
+      for (const dispose of disposers) dispose?.()
+      for (const fiber of fibers.reverse()) await fiber.dispose()
+      await runtime.dispose()
+      await rm(parent, { recursive: true, force: true })
+    })
+    fibers.push(await ctx.plugin(SystemPrompt.default))
+    fibers.push(await ctx.plugin(Tools.default))
+    fibers.push(await ctx.plugin(LocalFs.default, { cwd: project }))
+    fibers.push(await ctx.plugin(FsPolicy))
+    fibers.push(await ctx.plugin(ToolFs))
+    disposers.push(...registerOrchestratorDocumentGuards(ctx, runtime))
+    disposers.push(ctx.tools.guard(exec => runtime.checkToolExecution(exec)))
+
+    const preflight = await runtime.preflightWorkflow(agent)
+    assert.equal(preflight.root, canonicalRoot)
+    assert.equal(preflight.canStart, true)
+    assert.notEqual(preflight.root, alias)
+    let count = 0
+    const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
+      callId: `preflight-docs-${++count}`, signal: new AbortController().signal })
+    const paths = [join(alias, 'docs/specs/topic/spec.md'), join(canonicalRoot, 'docs/specs/topic/spec.md'),
+      nested ? 'specs/topic/spec.md' : 'docs/specs/topic/spec.md']
+    const created = await call('write', { file_path: paths[0], content: 'draft-0' })
+    assert.equal(created.isError, false, JSON.stringify(created))
+    for (const [index, file_path] of paths.entries()) {
+      assert.equal((await call('read', { file_path })).isError, false)
+      assert.equal((await call('edit', { file_path, old_string: `draft-${index}`, new_string: `draft-${index + 1}` })).isError, false)
+      assert.equal((await call('write', { file_path, content: `draft-${index + 1}` })).isError, false)
+      assert.equal(await readFile(paths[1], 'utf8'), `draft-${index + 1}`)
+    }
+    // Equivalent spellings share observation identity; an external edit still invalidates it.
+    await writeFile(paths[1], 'external change')
+    assert.equal((await call('edit', { file_path: paths[0], old_string: 'draft-3', new_string: 'stale' })).isError, true)
+    assert.equal(await readFile(paths[1], 'utf8'), 'external change')
+    await symlink(join(canonicalRoot, 'docs/specs'), join(project, 'docs/shortcut'))
+    for (const file of ['docs/shortcut/blocked.md', 'src/code.js', 'docs/analysis/report.md']) {
+      assert.equal((await call('write', { file_path: join(alias, file), content: 'blocked' })).isError, true, file)
+    }
+    await assert.rejects(access(join(project, 'docs/specs/blocked.md')), { code: 'ENOENT' })
+    // This fix does not bypass the existing clean-base gate for newly written documents.
+    assert.equal((await runtime.preflightWorkflow(agent)).canStart, false)
+  })
+})
```

## 被修改文件的候选内容

保留源码快照，便于在后续工作继续修改未提交文件后复核本轮证据。

### owner-workflow-plugin/src/orchestrator-documents.mjs

起始 SHA-256：`4f09355a232a16d82d8881ee970d52e1342d2580b6517eb3ef4264db9ff10362`。

```javascript
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const ROOT_DOCUMENTS = ['CONTEXT.md', 'CONTEXT-MAP.md']
const DOCUMENT_DIRECTORIES = ['docs/adr', 'docs/specs']
const GOVERNANCE_FILES = new Set(['agents.md', 'claude.md', 'skill.md'])

export const ORCHESTRATOR_DOCUMENT_GUIDANCE = [
  '需求讨论、术语/ADR、Spec、Ticket 和进度文档由主线程直接维护；此文档入口优先于 audit、Operation 和开发 Workflow，不因保存文档启动 DAG 或追加实施确认。',
  `使用原生 write/edit；允许项目根目录的 ${ROOT_DOCUMENTS.join('、')}，以及 ${DOCUMENT_DIRECTORIES.map(path => `${path}/**/*.md`).join('、')}。优先使用绝对路径，在允许范围内沿用已有文档；write 会创建所需父目录，编辑前先读取现有文件。`,
  'grilling 本身没有固定落盘目录；domain-modeling 将术语写入 CONTEXT.md、架构决定写入 docs/adr/，多上下文索引用 CONTEXT-MAP.md。Ghost Matt Spec/Ticket 默认使用 docs/specs/<主题>/spec.md、tickets/<编号>-<标题>.md 和 progress.md；范围外的旧文档只作为读取来源，不自动扩展写入权限。',
  '文档权限不包含 AGENTS.md、CLAUDE.md、SKILL.md、业务代码、Registry 或运行状态；不通过 Shell、补丁工具、链接或沙箱升级扩展范围。文档中的进度只是记录，执行状态以 Runtime 为准。',
].join('\n')

function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Resolve a local documentation target, rejecting links and ambiguous traversal before mutation. */
export function orchestratorDocumentPath({ root, cwd, filePath }) {
  if (typeof root !== 'string' || !isAbsolute(root)
    || typeof cwd !== 'string' || !isAbsolute(cwd)
    || typeof filePath !== 'string' || filePath.trim() === ''
    || filePath.includes('\0') || filePath.includes('\\')
    || filePath.split('/').includes('..')) return undefined
  try {
    const canonicalRoot = realpathSync(root)
    const canonicalCwd = realpathSync(cwd)
    if (!within(canonicalRoot, canonicalCwd)) return undefined
    // Git may bind the real root while the session retains its original alias.
    // Trust only ancestor spellings whose filesystem identity is that exact root.
    const rootSpellings = new Set([resolve(root), canonicalRoot])
    for (let ancestor = resolve(cwd); ; ancestor = dirname(ancestor)) {
      if (realpathSync(ancestor) === canonicalRoot) rootSpellings.add(ancestor)
      if (ancestor === dirname(ancestor)) break
    }
    const requested = resolve(cwd, filePath)
    // The outermost matching root preserves internal links (including links back
    // to the root) in the suffix, so the checks below can still reject them.
    const spelling = [...rootSpellings].sort((left, right) => left.length - right.length)
      .find(candidate => within(candidate, requested))
    if (spelling === undefined) return undefined
    const path = resolve(canonicalRoot, relative(spelling, requested))
    const rel = relative(canonicalRoot, path).split(sep).join('/')
    const parts = rel.split('/')
    if (parts.some(part => part.startsWith('.'))
      || parts.some(part => GOVERNANCE_FILES.has(part.toLowerCase()))) return undefined
    const allowed = ROOT_DOCUMENTS.includes(rel)
      || (rel.endsWith('.md') && DOCUMENT_DIRECTORIES.some(dir => rel.startsWith(`${dir}/`)))
    if (!allowed) return undefined
    let current = canonicalRoot
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index])
      let stat
      try { stat = lstatSync(current) } catch (error) {
        if (error.code === 'ENOENT') continue
        return undefined
      }
      if (stat.isSymbolicLink()) return undefined
      if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink > 1) return undefined
    }
    return path
  } catch {
    return undefined
  }
}

/** Guard the resolved native target, then retain the native read-before-write/CAS policy. */
export function registerOrchestratorDocumentGuards(ctx, runtime) {
  return ['fs/write-intent', 'fs/edit-intent'].map(event => ctx.on(event, (target, actor, next) => {
    const sessionId = actor?.agent?.id ?? actor?.agent?.session?.header?.id
    if (!runtime.activeOwners.has(sessionId) && !runtime.agentRoles.has(sessionId)) {
      const decision = runtime.checkFilesystemWrite(target, actor, ctx)
      if (decision?.kind === 'deny') throw new Error(decision.reason)
    }
    return next()
  }, { global: true, prepend: true }))
}
```

### owner-workflow-plugin/test/orchestrator-documents.test.mjs

起始 SHA-256：`dc486a088710f26f2d43e4d1a2761a3847ae6e618b8d0f36ab420cb1943a1339`。

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { orchestratorDocumentPath, registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'dsh-main-docs-'))
  const root = join(parent, 'project')
  await mkdir(root)
  const runtime = createOwnerWorkflowRuntime({}, {})
  const agent = { id: 'main-docs', session: { header: { cwd: root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
  runtime.orchestratorRoots.set(agent.id, root)
  t.after(async () => { await runtime.dispose(); await rm(parent, { recursive: true, force: true }) })
  const call = (file, name = 'write', extra = {}) => ({ agent, name, arguments: { file_path: join(root, file), ...extra } })
  return { parent, root, runtime, agent, call }
}

test('主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行', async t => {
  const { root, runtime, call } = await fixture(t)
  const hooks = new Map()
  const disposers = registerOrchestratorDocumentGuards({
    fs: { processPath: target => target.targetKey },
    on(event, callback, options) { assert.deepEqual(options, { global: true, prepend: true }); hooks.set(event, callback); return () => hooks.delete(event) },
  }, runtime)
  for (const file of ['CONTEXT.md', 'CONTEXT-MAP.md', 'docs/adr/0001.md', 'docs/specs/feature/spec.md',
    'docs/specs/feature/tickets/T-01.md', 'docs/specs/feature/progress.md']) {
    const actor = call(file)
    assert.equal(runtime.checkToolExecution(actor), undefined, file)
    const target = { targetKey: actor.arguments.file_path, displayPath: file }
    const createIntent = { kind: 'create' }
    assert.equal(await hooks.get('fs/write-intent')(target, actor, () => createIntent), createIntent)
    await mkdir(join(actor.arguments.file_path, '..'), { recursive: true })
    await writeFile(actor.arguments.file_path, 'draft')
    actor.name = 'edit'
    assert.equal(runtime.checkToolExecution(actor), undefined)
    const editIntent = { version: 'observed-version' }
    assert.equal(await hooks.get('fs/edit-intent')(target, actor, () => editIntent), editIntent)
    await assert.rejects(async () => hooks.get('fs/edit-intent')(target, actor, () => { throw new Error('stale observation') }), /stale observation/)
    assert.equal(await readFile(join(root, file), 'utf8'), 'draft')
  }
  for (const dispose of disposers) dispose()
  assert.equal(hooks.size, 0)
})

test('文档例外不放开代码、治理文件、状态、升级参数和其他写入工具', async t => {
  const { root, runtime, call } = await fixture(t)
  for (const file of ['README.md', 'src/app.mjs', 'docs/other.md', 'docs/specs/run.js',
    'docs/specs/AGENTS.md', 'docs/adr/CLAUDE.md', 'docs/specs/SKILL.md',
    'docs/specs/.codex/policy.md', '.owner-workflow/owners.md', '.dsh-workflow/state.md', '.git/config',
    'docs/superpowers/specs/design.md', 'docs/superpowers/plans/plan.md',
    'docs/analysis/session/discussion-record.md', '.scratch/feature/issues/T-01.md',
    '.scratch/feature/other.md', 'docs/specs/../../src/app.md']) {
    assert.match(runtime.checkToolExecution(call(file)), /主会话不能直接调用/, file)
    assert.equal(runtime.checkFilesystemWrite({ displayPath: join(root, file) }, call(file)).kind, 'deny', file)
  }
  for (const name of ['bash', 'pwsh', 'apply_patch', 'str_replace_editor', 'mcp__filesystem__write_file']) {
    assert.match(runtime.checkToolExecution(call('CONTEXT.md', name)), /主会话不能直接调用/)
  }
  assert.match(runtime.checkToolExecution(call('CONTEXT.md', 'write', { sandbox_permissions: 'danger-full-access' })), /主会话不能直接调用/)
  assert.match(runtime.checkToolExecution({ ...call('CONTEXT.md'), arguments: {} }), /主会话不能直接调用/)
})

test('解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入', async t => {
  const { root, runtime, call } = await fixture(t)
  const hooks = new Map()
  registerOrchestratorDocumentGuards({ fs: { processPath: target => target.targetKey },
    on(event, callback) { hooks.set(event, callback) } }, runtime)
  const actor = call('docs/specs/spec.md')
  assert.equal(runtime.checkToolExecution(actor), undefined)
  assert.throws(() => hooks.get('fs/write-intent')({ targetKey: actor.arguments.file_path }, { ...actor, name: 'custom_writer' },
    () => assert.fail('non-native mutation reached provider')), /主会话只能/)
  for (const path of [join(root, 'src/code.md'), join(root, 'docs/specs/other.md')]) {
    assert.throws(() => hooks.get('fs/write-intent')({ displayPath: actor.arguments.file_path, targetKey: path }, actor,
      () => assert.fail('denied target reached provider')), /主会话只能/)
  }
  await mkdir(join(root, 'src'), { recursive: true })
  await mkdir(join(root, 'docs'), { recursive: true })
  await symlink(join(root, 'src'), join(root, 'docs/specs'))
  assert.throws(() => hooks.get('fs/write-intent')({ displayPath: actor.arguments.file_path, targetKey: actor.arguments.file_path }, actor,
    () => assert.fail('link reached provider')), /主会话只能/)
})

test('路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标', async t => {
  const { parent, root } = await fixture(t)
  const check = filePath => orchestratorDocumentPath({ root, cwd: root, filePath })
  assert.equal(check('CONTEXT.md'), join(await realpath(root), 'CONTEXT.md'))
  assert.equal(check(join(parent, 'other/docs/specs/spec.md')), undefined)
  assert.equal(check('docs/specs/../specs/spec.md'), undefined)
  assert.equal(check('docs\\specs\\spec.md'), undefined)
  await mkdir(join(root, 'docs/specs'), { recursive: true })
  await writeFile(join(root, 'source'), 'code')
  await link(join(root, 'source'), join(root, 'docs/specs/hard.md'))
  await symlink(join(parent, 'missing'), join(root, 'docs/specs/dangling.md'))
  await symlink(join(root, 'source'), join(root, 'docs/specs/soft.md'))
  await mkdir(join(root, 'docs/specs/directory.md'))
  for (const file of ['hard.md', 'dangling.md', 'soft.md', 'directory.md']) assert.equal(check(`docs/specs/${file}`), undefined)
  const alias = join(parent, 'alias')
  await symlink(root, alias)
  assert.equal(orchestratorDocumentPath({ root: alias, cwd: alias, filePath: join(alias, 'CONTEXT.md') }), join(await realpath(root), 'CONTEXT.md'))
  assert.equal(orchestratorDocumentPath({ root, cwd: join(root, 'docs'), filePath: 'specs/new.md' }), join(await realpath(root), 'docs/specs/new.md'))
  assert.equal(orchestratorDocumentPath({ root, cwd: parent, filePath: join(root, 'CONTEXT.md') }), undefined)
})

test('只读子代理不继承文档例外，Owner 和停用模式沿用原策略', async t => {
  const { root, runtime, agent, call } = await fixture(t)
  for (const role of ['planner', 'plan-reviewer', 'reviewer', 'memory-curator', 'memory-reviewer', 'operator']) {
    runtime.agentRoles.set(agent.id, { role, workflowRoot: root })
    assert.match(runtime.checkFilesystemWrite({ displayPath: join(root, 'CONTEXT.md') }, call('CONTEXT.md')).reason, /只读/)
  }
  runtime.agentRoles.delete(agent.id)
  runtime.activeOwners.set(agent.id, { owner: { id: 'docs-owner' }, worktree: root })
  assert.equal(runtime.checkToolExecution(call('src/code.mjs')), undefined)
  runtime.activeOwners.delete(agent.id)
  agent.ctx = undefined
  assert.equal(runtime.checkToolExecution(call('src/code.mjs')), undefined)
  assert.equal(runtime.checkFilesystemWrite({ displayPath: join(root, 'src/code.mjs') }, call('src/code.mjs')), undefined)
})

test('真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝', async t => {
  const { parent, root } = await fixture(t)
  const canonicalRoot = await realpath(root)
  const alias = join(parent, 'project-alias')
  await symlink(canonicalRoot, alias)
  await mkdir(join(root, 'docs/specs'), { recursive: true })
  const check = (cwd, filePath) => orchestratorDocumentPath({ root: canonicalRoot, cwd, filePath })
  const target = join(canonicalRoot, 'docs/specs/spec.md')
  assert.equal(check(alias, join(alias, 'docs/specs/spec.md')), target)
  assert.equal(check(join(alias, 'docs'), join(alias, 'docs/specs/spec.md')), target)
  assert.equal(check(join(alias, 'docs'), 'specs/spec.md'), target)
  assert.equal(check(alias, target), target)

  await symlink(canonicalRoot, join(root, 'self'))
  await symlink(join(canonicalRoot, 'docs/specs'), join(root, 'docs/shortcut'))
  await symlink(join(parent, 'missing'), join(root, 'docs/specs/dangling.md'))
  await writeFile(join(root, 'source'), 'code')
  await link(join(root, 'source'), join(root, 'docs/specs/hard.md'))
  for (const file of ['self/docs/specs/spec.md', 'docs/shortcut/spec.md', 'docs/specs/dangling.md',
    'docs/specs/hard.md', 'docs/specs/AGENTS.md', 'docs/analysis/report.md',
    'docs/superpowers/specs/spec.md', 'docs/superpowers/plans/plan.md', '.scratch/topic/issues/T-01.md']) {
    assert.equal(check(alias, join(alias, file)), undefined, file)
  }
  assert.equal(check(join(alias, 'docs/shortcut'), 'spec.md'), undefined, 'relative cwd must not hide an internal link')
  assert.equal(check(join(alias, 'self'), 'docs/specs/spec.md'), undefined, 'self link must not become a new root')
  assert.equal(check(alias, join(parent, 'sibling/docs/specs/spec.md')), undefined)
})
```

### owner-workflow-plugin/test/orchestrator-documents-native.test.mjs

起始 SHA-256：`1f2f81ae6e0babb9f636c2eb5c712a6b474a3fba213c7c040ae3b785b32c89c2`。

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOwnerWorkflowRuntime } from '../src/runtime.mjs'
import { registerOrchestratorDocumentGuards } from '../src/orchestrator-documents.mjs'

async function nativeModules(t) {
  const modules = [
    '../../deepseek-harness/vendor/cordis/lib/index.js',
    '../../deepseek-harness/packages/core/system-prompt/lib/index.js',
    '../../deepseek-harness/packages/core/tools/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-local/lib/index.js',
    '../../deepseek-harness/packages/fs/fs-observation-policy/lib/index.js',
    '../../deepseek-harness/packages/fs/tool-fs/lib/index.js',
  ]
  // The plugin's unit suite also runs without the optional built Harness checkout.
  for (const path of modules) {
    try { await access(new URL(path, import.meta.url)) } catch { t.skip('需要已构建的 deepseek-harness'); return }
  }
  return Promise.all(modules.map(path => import(path)))
}

test('真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护', async t => {
  const modules = await nativeModules(t)
  if (modules === undefined) return
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-main-docs-'))
  const ctx = new Context()
  const fibers = []
  const runtime = createOwnerWorkflowRuntime({}, {})
  const agent = { id: 'native-main', session: { header: { cwd: root } },
    ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
  runtime.orchestratorRoots.set(agent.id, root)
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
    await runtime.dispose()
    await rm(root, { recursive: true, force: true })
  })
  fibers.push(await ctx.plugin(SystemPrompt.default))
  fibers.push(await ctx.plugin(Tools.default))
  fibers.push(await ctx.plugin(LocalFs.default, { cwd: root }))
  fibers.push(await ctx.plugin(FsPolicy))
  fibers.push(await ctx.plugin(ToolFs))
  registerOrchestratorDocumentGuards(ctx, runtime)
  ctx.tools.guard(exec => runtime.checkToolExecution(exec))
  let count = 0
  const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
    callId: `docs-${++count}`, signal: new AbortController().signal })
  const file_path = join(root, 'docs/specs/feature/spec.md')
  assert.equal((await call('write', { file_path, content: 'draft' })).isError, false)
  assert.equal(await readFile(file_path, 'utf8'), 'draft')
  assert.equal((await call('read', { file_path })).isError, false)
  assert.equal((await call('edit', { file_path, old_string: 'draft', new_string: 'ready' })).isError, false)
  assert.equal(await readFile(file_path, 'utf8'), 'ready')
  await writeFile(file_path, 'external edit')
  assert.equal((await call('edit', { file_path, old_string: 'ready', new_string: 'stale' })).isError, true)
  assert.equal(await readFile(file_path, 'utf8'), 'external edit')
  await writeFile(join(root, 'CONTEXT.md'), 'existing, unread')
  assert.equal((await call('write', { file_path: join(root, 'CONTEXT.md'), content: 'overwrite' })).isError, true)
  assert.equal(await readFile(join(root, 'CONTEXT.md'), 'utf8'), 'existing, unread')
  assert.equal((await call('write', { file_path: join(root, 'src/code.js'), content: 'code' })).isError, true)
  await assert.rejects(access(join(root, 'src/code.js')), { code: 'ENOENT' })
})

test('真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档', async t => {
  const modules = await nativeModules(t)
  if (modules === undefined) return
  const [{ Context }, SystemPrompt, Tools, LocalFs, FsPolicy, ToolFs] = modules
  for (const nested of [false, true]) await t.test(nested ? '会话位于 docs 子目录' : '会话位于项目根', async t => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-preflight-docs-'))
    const project = join(parent, 'project')
    const alias = join(parent, 'project-alias')
    await mkdir(join(project, 'docs'), { recursive: true })
    const canonicalRoot = await realpath(project)
    await symlink(canonicalRoot, alias)
    const git = args => execFileSync('git', args, { cwd: project, stdio: 'pipe', timeout: 10_000 })
    git(['init', '-b', 'main'])
    git(['config', 'user.email', 'document-fixture@example.invalid'])
    git(['config', 'user.name', 'Document fixture'])
    await writeFile(join(project, 'README.md'), 'fixture')
    git(['add', 'README.md'])
    git(['commit', '-m', 'fixture'])

    const ctx = new Context()
    const fibers = []
    const runtime = createOwnerWorkflowRuntime({}, {})
    const agent = { id: 'preflight-main', session: { id: 'preflight-main', header: { cwd: nested ? join(alias, 'docs') : alias } },
      ctx: { get: name => name === 'agentPresets' ? { composedPreset: () => 'owner-workflow' } : undefined } }
    const disposers = []
    t.after(async () => {
      for (const dispose of disposers) dispose?.()
      for (const fiber of fibers.reverse()) await fiber.dispose()
      await runtime.dispose()
      await rm(parent, { recursive: true, force: true })
    })
    fibers.push(await ctx.plugin(SystemPrompt.default))
    fibers.push(await ctx.plugin(Tools.default))
    fibers.push(await ctx.plugin(LocalFs.default, { cwd: project }))
    fibers.push(await ctx.plugin(FsPolicy))
    fibers.push(await ctx.plugin(ToolFs))
    disposers.push(...registerOrchestratorDocumentGuards(ctx, runtime))
    disposers.push(ctx.tools.guard(exec => runtime.checkToolExecution(exec)))

    const preflight = await runtime.preflightWorkflow(agent)
    assert.equal(preflight.root, canonicalRoot)
    assert.equal(preflight.canStart, true)
    assert.notEqual(preflight.root, alias)
    let count = 0
    const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
      callId: `preflight-docs-${++count}`, signal: new AbortController().signal })
    const paths = [join(alias, 'docs/specs/topic/spec.md'), join(canonicalRoot, 'docs/specs/topic/spec.md'),
      nested ? 'specs/topic/spec.md' : 'docs/specs/topic/spec.md']
    const created = await call('write', { file_path: paths[0], content: 'draft-0' })
    assert.equal(created.isError, false, JSON.stringify(created))
    for (const [index, file_path] of paths.entries()) {
      assert.equal((await call('read', { file_path })).isError, false)
      assert.equal((await call('edit', { file_path, old_string: `draft-${index}`, new_string: `draft-${index + 1}` })).isError, false)
      assert.equal((await call('write', { file_path, content: `draft-${index + 1}` })).isError, false)
      assert.equal(await readFile(paths[1], 'utf8'), `draft-${index + 1}`)
    }
    // Equivalent spellings share observation identity; an external edit still invalidates it.
    await writeFile(paths[1], 'external change')
    assert.equal((await call('edit', { file_path: paths[0], old_string: 'draft-3', new_string: 'stale' })).isError, true)
    assert.equal(await readFile(paths[1], 'utf8'), 'external change')
    await symlink(join(canonicalRoot, 'docs/specs'), join(project, 'docs/shortcut'))
    for (const file of ['docs/shortcut/blocked.md', 'src/code.js', 'docs/analysis/report.md']) {
      assert.equal((await call('write', { file_path: join(alias, file), content: 'blocked' })).isError, true, file)
    }
    await assert.rejects(access(join(project, 'docs/specs/blocked.md')), { code: 'ENOENT' })
    // This fix does not bypass the existing clean-base gate for newly written documents.
    assert.equal((await runtime.preflightWorkflow(agent)).canStart, false)
  })
})
```

## 实现阶段的首次失败与定向验证

此阶段允许调试。red.log 的 4 个失败统计包含失败父测试；根会话、子目录会话和路径策略反例均在旧实现上失败。随后一次修改路径策略，定向验证通过，才固定候选进入正式测试。

### red.log

```text
✔ 真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护 (80.830791ms)
▶ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档
  ✖ 会话位于项目根 (207.250375ms)
  ✖ 会话位于 docs 子目录 (194.095625ms)
✖ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档 (402.77825ms)
✔ 主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行 (14.682083ms)
✔ 文档例外不放开代码、治理文件、状态、升级参数和其他写入工具 (3.149917ms)
✔ 解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入 (2.576959ms)
✔ 路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标 (3.373541ms)
✔ 只读子代理不继承文档例外，Owner 和停用模式沿用原策略 (1.119375ms)
✖ 真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝 (2.6595ms)
ℹ tests 10
ℹ suites 0
ℹ pass 6
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 597.052584

✖ failing tests:

test at owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:72:47
✖ 会话位于项目根 (207.250375ms)
  AssertionError [ERR_ASSERTION]: {"isError":true,"error":{"message":"Owner 工作模式已启用，主会话不能直接调用 write；代码修改交给 Owner，非编码执行交给 Operator"},"content":[{"type":"text","text":"Error: Owner 工作模式已启用，主会话不能直接调用 write；代码修改交给 Owner，非编码执行交给 Operator"}]}
  
  true !== false
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:117:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:72:39)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:72:47
✖ 会话位于 docs 子目录 (194.095625ms)
  AssertionError [ERR_ASSERTION]: {"isError":true,"error":{"message":"Owner 工作模式已启用，主会话不能直接调用 write；代码修改交给 Owner，非编码执行交给 Operator"},"content":[{"type":"text","text":"Error: Owner 工作模式已启用，主会话不能直接调用 write；代码修改交给 Owner，非编码执行交给 Operator"}]}
  
  true !== false
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:117:12)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/orchestrator-documents-native.test.mjs:72:39)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at owner-workflow-plugin/test/orchestrator-documents.test.mjs:123:1
✖ 真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝 (2.6595ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + undefined
  - '/private/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-main-docs-B1EKM3/project/docs/specs/spec.md'
  
      at TestContext.<anonymous> (file:///Volumes/LargeStorage/code/DSH-Workflow/owner-workflow-plugin/test/orchestrator-documents.test.mjs:131:10)
      at async Test.run (node:internal/test_runner/test:1113:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:788:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: '/private/var/folders/pk/4_rtp5211139hr72f5z3yv2c0000gn/T/dsh-main-docs-B1EKM3/project/docs/specs/spec.md',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### targeted.log

```text
✔ 真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护 (58.805792ms)
▶ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档
  ✔ 会话位于项目根 (354.232584ms)
  ✔ 会话位于 docs 子目录 (521.504625ms)
✔ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档 (876.715417ms)
✔ 主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行 (21.682958ms)
✔ 文档例外不放开代码、治理文件、状态、升级参数和其他写入工具 (6.42375ms)
✔ 解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入 (6.062125ms)
✔ 路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标 (9.55625ms)
✔ 只读子代理不继承文档例外，Owner 和停用模式沿用原策略 (1.322125ms)
✔ 真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝 (9.345916ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1049.953167
```

## 正式测试元数据

每个独立套件外层超时 60 秒，逐项执行并保留退出码，不首败退出；正式测试期间不修改代码、断言或规格。

```json
{
  "candidate": "2026-09-10T06:54:23.653Z",
  "results": [
    {
      "suite": "orchestrator-documents",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/orchestrator-documents.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T06:55:06.361Z",
      "end": "2026-09-10T06:55:06.527Z",
      "exitCode": 0,
      "signal": null,
      "error": null,
      "counts": {
        "tests": 6,
        "pass": 6,
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
      "start": "2026-09-10T06:55:06.528Z",
      "end": "2026-09-10T06:55:07.341Z",
      "exitCode": 0,
      "signal": null,
      "error": null,
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
      "suite": "agent-policy",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/agent-policy.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T06:55:07.341Z",
      "end": "2026-09-10T06:55:07.405Z",
      "exitCode": 0,
      "signal": null,
      "error": null,
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
      "suite": "plugin",
      "command": [
        "/Users/admin/.local/share/fnm/node-versions/v24.12.0/installation/bin/node",
        "--test",
        "--test-force-exit",
        "owner-workflow-plugin/test/plugin.test.mjs"
      ],
      "cwd": "/Volumes/LargeStorage/code/DSH-Workflow",
      "start": "2026-09-10T06:55:07.405Z",
      "end": "2026-09-10T06:55:07.539Z",
      "exitCode": 0,
      "signal": null,
      "error": null,
      "counts": {
        "tests": 11,
        "pass": 11,
        "fail": 0,
        "cancelled": 0,
        "skipped": 0,
        "todo": 0
      }
    }
  ],
  "drift": []
}
```

### orchestrator-documents

```text
✔ 主线程可在启动 DAG 前创建和修改所有约定文档，原生观察策略继续执行 (17.793667ms)
✔ 文档例外不放开代码、治理文件、状态、升级参数和其他写入工具 (6.212583ms)
✔ 解析路径二次校验阻止冒充 displayPath、目标漂移和链接换入 (2.768ms)
✔ 路径绑定到项目和会话，允许根目录别名，拒绝软硬链接和无效目标 (4.422125ms)
✔ 只读子代理不继承文档例外，Owner 和停用模式沿用原策略 (0.822417ms)
✔ 真实 root 与会话根别名混用时只归一化项目根，保留内部链接拒绝 (5.232542ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 139.179958
```

### orchestrator-documents-native

```text
✔ 真实 Harness write/read/edit 链保存文档，并保留观察和冲突保护 (51.49325ms)
▶ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档
  ✔ 会话位于项目根 (318.454875ms)
  ✔ 会话位于 docs 子目录 (320.873959ms)
✔ 真实 Git 预检后，Harness 接受根别名、真实路径和相对路径的同一文档 (640.162ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 787.262084
```

### agent-policy

```text
✔ 子代理继承完整工具集，角色只决定文件沙箱模式 (0.78525ms)
✔ Planner 与 Reviewer 隐藏无效升级字段，并对同一失败搜索执行有界熔断 (0.349833ms)
✔ Operator 的重复搜索同样使用成功缓存和两次失败熔断 (0.598958ms)
✔ 主代理禁止直接开发，Owner 和 Operator 不使用工具白名单 (0.410291ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 38.028208
```

### plugin

```text
✔ 插件注册主编排工具、全局守卫和九个中文 Skill (1.940875ms)
✔ 提交 Intent 后明确询问是否重新规划，继续讨论时不唤醒 Planner (0.194542ms)
✔ 用户在 Intent 问询中选择现在重新规划时只唤醒一次 Planner (0.082708ms)
✔ PlanRevision 只有根会话原生问询明确同意后才切换 (0.404458ms)
✔ 取消 Workflow 只有原生问询明确同意后才丢弃临时现场 (0.195625ms)
✔ 计划修订额度只有原生问询明确同意后才扩展当前 Workflow (0.35975ms)
✔ 工作流批准只接受原生问询中的明确同意，并保留不同意与自定义意见 (0.144792ms)
✔ 只读审计完成后由原生问询决定是否自动进入 preflight 与 workflow_start (0.299291ms)
✔ Registry 与计划批准在原生问询同意前绝不修改 Runtime (0.480375ms)
✔ Web 客户端宿主模式不注册 Agent 工具、Skill 或提示词 (0.106291ms)
✔ Owner 工作流提示要求新 Flutter 验证显式 cwd，且不提供 Quick (0.484875ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 107.073459
```
