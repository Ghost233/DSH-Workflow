# Tobs 与当前 DSH 运行时的兼容性核对

## 结论与核对范围

Tobs 1.6.1 的插件服务可以表达此前设计需要的 Bot、Schedule、Assignment 和工具扩展。但它不能直接作为当前 DSH 0.2.2-rc.1 的已验证兼容版本。发布物仍调用已移除的 `tools.presentAs()`；首次创建 Bot Agent 时会进入这条调用。自研插件能够注册工具，不代表 Tobs 自身会话能够启动。[Tobs 1.6.1 Agent setup](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L864)、[DSH 0.2.2 工具执行器](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/index.ts#L325)。

固定上游提交 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab` 已包含 DSH 0.2.2 适配。其官方产品打包脚本也把 `0.2.2-rc.1` 列为产品 DSH 版本。可研究的引入路线是：保持上游源码原样，按官方构建和打包流程生成候选包集，再由项目集成层装配。该路线尚未完成构建或真实会话验收。[上游兼容模块](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/native-agent-compat.ts)、[产品版本与打包入口](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/product-artifacts.mjs#L17)。

核对基准：

| 对象 | 固定来源 |
| --- | --- |
| 当前产品运行时 | 根目录 `dsh-runtime.json`，`@deepseek-ai/dsh@0.2.2-rc.1`，npm 来源及完整 integrity |
| 本地 DSH 源码 | `deepseek-harness`，提交 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`，工作区版本 `0.2.2-rc.1` |
| Tobs 已发布版本 | 实际 npm `@botharness/tobs`、`deepseekbot`、`@botharness/core` 的 `1.6.1` 元数据和 tarball |
| DSH 实际发布接口 | 实际 npm `@deepseek-ai/dsh-agent`、`dsh-tools`、`dsh-scope` 和 `dsh-schedule` 的 `0.2.2-rc.1` tarball |
| Tobs 待选上游源码 | 提交 `2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab`，仅用于比较；不以移动的 main 作为交付版本 |

本次执行了 HTTP 只读查询、发布包静态读取和本地源码比较。没有安装主机依赖、运行第三方服务或修改上游源码。文中的兼容判断分为明确接口事实、确定的接口冲突和待运行验证项。

## 已发布包的加载方式

### 正确的包身份与入口

`@botharness/tobs@1.6.1` 是 DSH bundle，不是能直接作为 Host 插件导入的 JavaScript 根入口。它声明 `dsh.bundle.patch: ./cordis.im.patch.yml`。`deepseekbot@1.6.1` 也携带同一份产品补丁。应选一个产品 bundle，避免同时装配两次。[Tobs npm 元数据](https://registry.npmjs.org/@botharness%2Ftobs/1.6.1)、[deepseekbot npm 元数据](https://registry.npmjs.org/deepseekbot/1.6.1)。

真实补丁包含以下顶层组件。标识必须保留，不能统一重命名成一个 `project-tobs` 入口。

| Loader entry ID | 模块 | 关键配置或作用 |
| --- | --- | --- |
| `xmanrui-dsh-im` | `@botharness/im-provider` | 产品自己的 IM Provider |
| `botharness-core` | `@botharness/core` | `agentPreset: deepseekbot` |
| `botharness-client` | `@botharness/ui` | Tobs Web 客户端 |
| `botharness-browser` | `@botharness/browser` | `headless: true` |
| `botharness-computer` | `@botharness/computer` | `target: local` |
| `preset-deepseekbot` | `@deepseek-ai/dsh-agent-preset` | 预设 `config.id: deepseekbot`，包含自己的嵌套插件列表 |

以上来自实际 Tobs tarball 的 `package/cordis.im.patch.yml`。来源：[Tobs 1.6.1 tarball](https://registry.npmjs.org/@botharness/tobs/-/tobs-1.6.1.tgz)。

项目清单可以用 `package: @botharness/tobs` 表示产品，用 `entryId: botharness-core` 表示核心状态检查目标。但产品本身没有单一 Host 入口；实际装配必须读取原版 bundle。若新增 `bundle: native` 字段，应把它定义为项目集成层功能，按原始多入口补丁装配，并单独报告组件状态。1.6.1 只可用于复现冲突，不能因清单已加入而标为可用。

### 补丁序列化与包子路径

发布补丁有两处 `!!js`，用于在 Windows 与其他平台之间选择 Shell。没有函数值，也没有 `./` 或 `../` 插件模块路径。嵌套预设引用 `deepseekbot/dist/subagent-control.mjs`，因此 legacy 产品包仍是完整产品依赖的一部分。[发布 tarball](https://registry.npmjs.org/@botharness/tobs/-/tobs-1.6.1.tgz)。

使用 DSH 的 `bundlePatchPaths()` 和 `loadOverlayPatches()` 读取补丁。原生 YAML 标签把表达式保留为 `{ __jsExpr: string }`，因此原生解析结果可再经过 JSON 序列化。禁止预先把表达式求值成当前构建机的布尔值。这样才能保留交付到其他平台后的判断。[bundle 路径解析](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/app-boot/src/profile.ts#L69)、[原生补丁读取](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/app-boot/src/index.ts#L536)、[标签构造](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/vendor/include/src/index.ts#L16)、[表达式识别](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/vendor/loader/src/config/utils.ts#L24)。

现有 `scripts/project-plugins.mjs` 的旧路径要求第三方包可解析根入口和 `/client`，并要求 bundle 只插入一行。Tobs 的包装包不满足这些要求。`macos-launcher/runtime/startup-plugins.mjs` 已使用 DSH 原生多入口装配，但启动状态汇总还需将产品映射到真实组件，不能按包装包名寻找唯一 fiber。这是项目集成层要处理的差异，不属于第三方源码修补。

### 服务与类型依赖

Tobs core 的必需注入服务为 `tools`、`systemPrompt`、`sessions`、`agents`、`agentDefaultModel`、`llm` 和 `credentials`。工作区、审批、Web、IM 等能力还有各自的可选或延迟依赖。应装配原版产品补丁并保留正常 DSH 基础 profile，不能以伪造这些服务的对象代替完整加载验收。[core inject](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L334)。

实际 npm `@botharness/core@1.6.1` 根出口指向 `dist/index.mjs`，tarball 同时提供 `dist/index.d.mts`，声明明确导出 `BotHarnessCore`。可从这个根包引用服务类型。`@botharness/tobs` 包装包不提供对应类型入口，也不能深层导入其不存在的 core 源码路径。NodeNext 对 `.mjs` 旁边 `.d.mts` 的具体编译接入仍需项目工具链检查。[core npm 元数据及 tarball 地址](https://registry.npmjs.org/@botharness%2Fcore/1.6.1)。

## 接缝核对

| 接缝 | 1.6.1 的事实 | DSH 0.2.2 下的判断 |
| --- | --- | --- |
| `core.contributeBotAgentSetup` | 同时覆盖 Orchestrator 和 Assignment，提供实际 Agent、`botSlug`、`rootRole` | 源码接缝存在；只有 Tobs 自身 setup 成功后才有业务意义 |
| Agent-local `tools.register` | 返回准确注销函数；Tobs 自己用 hook 注册 `cloud_work` | 0.2.2 保留 scoped register；自研工具应使用 0.2.2 的 output schema/render 和实际 Agent 身份 |
| `core.schedules.create/runNow` | Tobs 自己的持久 Schedule；支持禁用记录的手动触发 | API 形状未变。算法代码打入产品包，不依赖 Host Schedule 服务来承接每次唤醒 |
| `core.runtime` | 查询、停止、Bot 收件与 Assignment 等服务存在 | Tobs 首次 Agent setup 受旧工具呈现接口阻塞，不能直接验收通过 |
| Workspace 与 Grant | Tobs 自己维护 Grant；通过 Host workspace registry 准备工作区 | Host 的 `create(path,title?)` 仍存在；注册路径不等于授权 Grant，需真实文件读写验收 |
| Model Plan | Tobs 可存 Orchestrator 和 Assignment 模型计划 | 0.2.2 的 Agent 模型状态发生变化，旧安装函数的额外参数不再生效，需兼容版本验收 |

来源：[Tobs setup hook 与服务](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L458)、[Tobs hook 使用示例](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/plugin.ts#L1647)、[DSH scoped tool register](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/index.ts#L117)、[Schedule 类型](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L93)、[Workspace create](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/workspace/workspace/src/index.ts#L238)。

专用唤醒 Schedule 可设 `enabled:false`，由插件在收到持久事件后调用 `runNow`。自动 tick 只选 `enabled=1`，手动路径不检查 enabled、locked 或未来 target；仍拒绝暂停、删除或不可用的 Bot。合并唤醒只代表待办信号，自研队列仍需分页读取、消费回执、租约恢复和重新唤醒。[自动筛选](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L530)、[手动路径](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/schedules/bot-schedules.ts#L702)。

## 明确的 0.2.2 冲突

### 工具呈现与执行

发布的 Tobs core 在两个 Agent setup 路径中调用 `agentCtx.tools.presentAs('native')`。实际 `@deepseek-ai/dsh-tools@0.2.2-rc.1` 的 JavaScript 和声明均没有此方法，改由 `setExecutor(executor)` 提供执行器。无兼容修改时，调用处会出现 `TypeError`。[Tobs Orchestrator setup](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L887)、[Assignment setup](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L3720)、[DSH 0.2.2 实际包](https://registry.npmjs.org/@deepseek-ai%2Fdsh-tools/0.2.2-rc.1)。

Tobs 1.6.1 的部分 direct 工具调用仍向 `tools.execute` 传递单次 `{callId,name,arguments}`。0.2.2 接收 `ToolBatchInput`，返回 `ToolBatchResult`。这也是明确的形状差异，不能通过增加自研业务工具消除。[Tobs 单次调用](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L3608)、[DSH 批次执行](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/index.ts#L375)。

### 模型状态

1.6.1 调用 `installModelSelection(agentCtx, selection)`。0.2.2 函数只接收 `agentCtx`，用于安装模型切换通知；实际选择由 `agent.model.select()` 记录。JavaScript 会忽略多余参数，因此此问题不一定立即报错，但不能据此认定模型计划正确应用。[旧调用](https://github.com/BotHarness/DeepSeekBot/blob/v1.6.1/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L875)、[新安装函数](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent/src/model-selection.ts#L157)。

固定上游提交的 `native-agent-compat.ts` 已针对三处变化提供适配：安装 `NativeToolExecutor`、转换批次调用、调用 `agent.model.select()`。这些属于上游已有源码，不能复制成项目专用兼容补丁。[官方适配模块](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/core/src/runtime/native-agent-compat.ts)。

## 可复现的上游引入候选

截至本次只读查询，`@botharness/tobs`、`@botharness/core` 和 `deepseekbot` 的 npm `latest`、`next` 都指向 `1.6.1`。没有可直接安装的 0.2.2 兼容预发布版本。GitHub 最新 Release `v1.6.1` 没有 assets。[Tobs tags](https://registry.npmjs.org/@botharness%2Ftobs)、[core tags](https://registry.npmjs.org/@botharness%2Fcore)、[legacy tags](https://registry.npmjs.org/deepseekbot)、[Release](https://api.github.com/repos/BotHarness/DeepSeekBot/releases/latest)。

官方 npm 候选工作流会上传 `npm-candidate-<runId>`，保留期为 3 天。查询到最近成功的准备任务是 11 月 7 日的 `42354419129`，提交 `81a45d3a2091c2c6323801fc4c2898929ecf0f2e`；当前 artifact 列表仅剩验收报告，没有候选 tgz。当前固定提交的最近产物只有性能报告，未找到能直接采用的官方预构建产品包。[准备工作流](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/.github/workflows/npm-prerelease-prepare.yml)、[任务产物列表](https://api.github.com/repos/BotHarness/DeepSeekBot/actions/runs/42354419129/artifacts)。

可执行的候选构建流程来自上游工作流：

1. 获取固定提交的干净上游源码，使用其 `.node-version` 的 Node `v24.21.0` 和 `packageManager` 的 pnpm `12.4.2`。
2. 在隔离构建环境执行 `pnpm install --frozen-lockfile`、上游检查和 `pnpm build`。
3. 取得官方 `product-artifacts.mjs` 固定的 IM Provider 源码提交 `bb0c7956896f5f5845950a0707837cd7938a11b3`，按工作流准备依赖。
4. 原样运行 `node scripts/npm-prerelease.mjs prepare --version <明确标注的本地候选版本> --provider-source <固定 Provider 源码目录> --output <全新产物目录>`。
5. 保存整组 tgz、`artifacts.json`、`release-plan.json`、源码提交、构建环境与每个产物的 integrity。把候选版本标成项目构建的上游源码产物，不冒充 npm 正式发布。
6. 在项目自己的装配层支持这组本地产物或受控产物源，保留原版包名、依赖关系和 bundle。交付锁定本次产物 hash，启动时不重新构建或解析移动版本。

来源：[构建版本](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/package.json)、[Node 版本](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/.node-version)、[固定 Provider 与完整包集打包](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/product-artifacts.mjs)、[prepare 命令](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/npm-prerelease.mjs#L477)。

### 官方准备流程的命令顺序

以下命令交给主线程在项目指定的隔离构建环境执行，本次未执行。路径均为新建的依赖构建目录。示例 `1.6.1-upstream.2e0562f1` 是项目本地候选标识，不是上游 npm 发布版本。

```sh
upstream_dir=/build/tobs-upstream
provider_dir=/build/tobs-im-provider
artifact_dir=/build/tobs-candidate-artifacts
candidate_version=1.6.1-upstream.2e0562f1

git clone --no-checkout https://github.com/BotHarness/BotHarness.git "$upstream_dir"
git -C "$upstream_dir" checkout --detach 2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab
cd "$upstream_dir"
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm rebuild puppeteer
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build

provider_sha=$(node --input-type=module -e 'import {productImProvider} from "./scripts/product-artifacts.mjs"; process.stdout.write(productImProvider.upstream.source)')
test "$provider_sha" = bb0c7956896f5f5845950a0707837cd7938a11b3
git clone --no-checkout https://github.com/DoodleBears/dsh-im.git "$provider_dir"
git -C "$provider_dir" checkout --detach "$provider_sha"
npm ci --ignore-scripts --prefix "$provider_dir"

node scripts/npm-prerelease.mjs prepare \
  --version "$candidate_version" \
  --provider-source "$provider_dir" \
  --output "$artifact_dir"
```

Provider 仓库地址来自上游准备工作流的第二次 checkout，提交来自同一固定提交中的产品元数据。打包脚本还会验证 Provider 的 `package.json`、`package-lock.json` 和运行源码摘要；不能用同名 npm 包或另一个主干提交替代。[官方工作流](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/.github/workflows/npm-prerelease-prepare.yml#L49)、[输入摘要校验](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/product-artifacts.mjs#L105)。

`prepare` 会构建并打包产品指定的 IM Provider、取得固定的 cloudflared 资源、校验包集并验证打包 CLI。它不发布 npm 包。若这些第三方步骤失败，应保留失败输出。不得为继续构建改写上游脚本、Provider 源码或校验摘要。

### 产物清单与安装

`artifacts.json` 的实际形状由官方脚本生成，以下仅展示字段，不手工填写摘要：

```json
{
  "productVersion": "1.6.1-upstream.2e0562f1",
  "dsh": "0.2.2-rc.1",
  "providerRuntime": {
    "name": "@botharness/im-provider",
    "version": "4.32.0-botharness.27",
    "source": "bb0c7956896f5f5845950a0707837cd7938a11b3"
  },
  "artifacts": [
    {
      "name": "@botharness/core",
      "version": "1.6.1-upstream.2e0562f1",
      "filename": "botharness-core-1.6.1-upstream.2e0562f1.tgz",
      "integrity": "<官方脚本计算的 sha512>"
    }
  ],
  "platformArtifacts": []
}
```

正式清单还包含其余产品包、Provider 的完整来源摘要和所有平台资源；不能仅保留示例中的 core。`release-plan.json` 额外记录源码 SHA、脏状态、产品 DSH、发布顺序和 `artifacts.json` 的 SHA-256。[清单生成](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/product-artifacts.mjs#L377)、[准备计划](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/npm-prerelease.mjs#L495)。

候选产品的包间依赖使用相同的精确候选版本。仅安装一个 Tobs tgz 会让包管理器向 npm 查找尚未发布的同版本子包。官方 `packagedProfileManifest()` 会加入本地产品包，`packagedWorkspaceSettings()` 会为全部产品包和平台包设置精确版本到 `file:<tgz>` 的 override。项目集成应保留这项语义，随后调用或等价执行 `verifyPackagedProfile()`。[官方本地产物装配](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/packaged-profile.mjs#L149)、[全部产物 override](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/scripts/packaged-profile.mjs#L225)。

官方本地产物 profile 同时安装两个 CLI 包，但只把 `deepseekbot` 放进 bundle 列表；这与“每个产品只装配一次”的要求一致。项目若以 `@botharness/tobs` 作为清单产品名，应把原版 bundle 路径及组件状态保存在项目装配记录中。

现有 `source: git` 安装路径不能直接安装这个 monorepo 产品。仓库根包叫 `botharness`，是 private `0.0.0` 工作区；真实产品在子目录，并使用 `link:` 工作区依赖。项目当前元数据检查读取仓库根 `package.json`，要求名称等于清单包名，再执行普通 Git 依赖安装。直接填 `@botharness/tobs` 加仓库提交会在这条边界失败。需要项目产物装配能力，不需要修改上游包清单。[上游根包](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/package.json)、[子包](https://github.com/BotHarness/DeepSeekBot/blob/2e0562f1fb222b1edf1bf4d8bd442a9c10a27cab/packages/tobs/package.json)。

## 最小真实加载检查

以下是实施后的建议门禁，本次未执行。使用独立临时 `DSH_HOME` 和固定 0.2.2-rc.1，避免读取用户现有 Bot 和业务数据库。

| 检查 | 通过证据 |
| --- | --- |
| 产物身份 | 原始包清单、版本、完整 integrity、源码提交与发布计划一致 |
| 原生 bundle 解析 | 六个顶层组件及原始 ID 保留；两处 `__jsExpr` 仍为表达式；`deepseekbot` 预设和包子路径可解析 |
| Host 初始加载 | 真正 import/apply 产品组件，读取 Loader fiber 状态及完整原始错误；仅 `--dump-config` 不能替代 |
| Bot Agent 建立 | 在隔离 fixture 模型上建立 Orchestrator，确认 Tobs hook 已执行、自研工具出现且真实调用身份正确 |
| Assignment 建立 | 授权临时项目目录，创建 Assignment 并完成一次工具调用和汇报；只有 Orchestrator 成功不算通过 |
| 模型计划 | 切换负责人和 Assignment 路由，核对实际 request header，而非仅核对保存的配置 |
| Schedule | disabled、locked 的专用记录可 runNow；暂停 Bot 拒绝唤醒；合并事件后自有队列仍可完整处理 |
| Grant 与回收 | 未授权目录拒绝访问；撤销后拒绝后续使用；卸载自研工具后不存在有效残留调用 |

本机 `macos-launcher/node_modules` 当前仍可见 `@deepseek-ai/dsh`、`dsh-agent` 和 `dsh-tools` 的 `0.2.1-alpha.1`，与根目录目标不一致。该目录不能作为 0.2.2 的通过证据。检查前应确认测试使用的真实 npm runtime anchor、包版本和 Node；`macos-launcher/runtime/npm-runtime-pin.mjs` 与 `scripts/test-runtime.mjs` 可用于确定边界。DSH 0.2.2 的 Node 门槛为 `>=24.9.0`。[实际 npm DSH 元数据](https://registry.npmjs.org/@deepseek-ai%2Fdsh/0.2.2-rc.1)。

第三方加载、构建或测试失败应保留原始输出，记录具体受影响功能。不得通过补写 `presentAs`、替换第三方执行器、改 Tobs/DSH 源码或把配置保存成功当作运行成功来通过验收。
