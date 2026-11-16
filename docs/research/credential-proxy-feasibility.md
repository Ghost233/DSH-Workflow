# 凭证注入代理（credential-injecting proxy）用于 hub-bot 的可行性调研

- 调研工单：Ghost233/DSH-Workflow#85（地图 #79「hub-bot v2 — always-on agent 演进」研究工单）
- 调研日期：2026-11-16；调研人：wayfinder research 子代理（research-credproxy）
- 产出性质：**事实报告，不含设计决定**。可行性与代价如实记录，取舍归地图。
- 路径缩写：
  - `DSH` = `/Applications/Ghost DSH Station.app/Contents/Resources`（DSH 0.2.2-rc.3 检出，只读）
  - `HB` = `DSH-Workflow.worktrees/62-hub-bot-plugin/hub-bot-plugin/src`（只读）
  - `LARK` = `DSH-Workflow.worktrees/62-hub-bot-plugin/hub-bot-plugin/node_modules/@larksuiteoapi/node-sdk/lib/index.js`（@larksuiteoapi/node-sdk 1.76.0 发布 bundles，只读）

## 1. 调研对象的原文（一手来源）

Anthropic《Building always-on agents》<https://claude.com/resources/articles/building-always-on-agents>，
Permissions 节的 Credential store 段（2026-11-16 抓取全文，逐字）：

> **Credential store**: Always-on agents often need sensitive user credentials like passwords or access
> tokens to be useful. The recommended pattern is **a proxy outside the agent's environment that adds
> credentials to outgoing requests**. The agent sends requests without credentials, and the proxy injects
> the real credentials before forwarding.

中译：凭证存根——always-on agent 往往要持有用户凭证才有用。推荐模式是**一个在 agent 环境之外的代理，
由它在出站请求上注入凭证**：agent 发出的请求不带凭证，代理在转发前注入真凭证。

该模式成立的前提（本文据此逐条核对）：**(a)** 存在一条「agent 环境」与「环境外代理」之间的真实边界
——agent 够不到代理持有的秘密；**(b)** 出站流量可被代理中介（自愿或被强制）；**(c)** 不带凭证的
请求对 agent 仍然有用（目标服务接受代理注入后的请求）。

## 2. 现状核实（含对工单所述事实的修正）

### 2.1 飞书侧——与工单所述一致

- 凭证落盘 `<stateDir>/feishu-credentials.json`，写入 `{mode: 0o600}` 并补 `chmodSync(file, 0o600)`
  （`HB/feishu.js:114-119`）。实测开发实例：`/tmp/dsh-hub-bot-dev/state/feishu-credentials.json`，
  `-rw------- 1 ghost233`，130 字节（附录 A1）。
- 插件进程启动时把文件读进内存（`#reloadCredentials`，`HB/feishu.js:88-111`），构造 REST Client
  （`new lark.Client({appId, appSecret})`，`HB/feishu.js:203`）与 WSClient 长连接
  （`HB/feishu.js:221-228`）；回投在插件进程内调 `client.im.message.create`
  （`HB/feishu.js:373-380`）。**全部投递路径都经过宿主进程内存中的 appSecret。**
- 另有人工降级通道：profile 配置直接给 `config.appId/appSecret`（`HB/feishu.js:103-108`；
  配置样例注释「appId/appSecret 仅作人工降级」，`hub-bot-plugin/docs/dev-profile.patch.yml:54`）。
- **修正：hub-bot 没有飞书 user token。** 插件只用 appId/appSecret，由 SDK 换取 tenant_access_token
  （`LARK:100281-100289`，缓存 2 小时短期令牌）。「user token 暴露面」在 hub-bot 不存在。

### 2.2 GitHub 侧——与工单所述有偏差，需修正

- 插件的 gh 调用是 `execFile('gh', args, …)`（`realGh`，`HB/github.js:66-74`），**不带 env 覆盖**，
  继承宿主进程环境。`GH_CONFIG_DIR` 注入面（`.ghswitch` → BASH_ENV shim）作用于**模型 bash 与 deck
  自己的 spawn**（`DSH/workflow/matt-skills-panel-plugin/package/lib/ghAccount.js:109-116,214`），
  **不经 bash 的 execFile 不受 BASH_ENV 影响**。宿主 ambient 环境实测：默认 `~/.config/gh` 同样登录
  Ghost233（keyring）（附录 A4）——插件 gh 身份来自 ambient 默认目录，不是 GH_CONFIG_DIR 注入面。
- 令牌本体存 macOS keychain（`gh auth status` 显示 `Logged in to github.com account Ghost233
  (keyring)`，附录 A3）；`gh-profiles/Ghost233/hosts.yml` 只含 `git_protocol/users/user` 键，
  无 token 值（附录 A4）。但 keyring 不挡「直接运行 gh」：`gh auth token` 实测返回 40 字符令牌原文
  （只记长度不记值，附录 A3）。
- git push 认证也走同一账号目录：credential helper 内嵌 `GH_CONFIG_DIR=<账号目录> gh auth
  git-credential`（`DSH/workflow/skills/configure-gh-account/scripts/configure_local_git.py:96`）。

### 2.3 会话分层与工具面（决定「哪些 agent 能碰到什么」）

- L1 总负责人 / L2 负责人会话跑专用 preset，**完全只读**：无 shell/jobs 工具，fs 工具 `write:false,
  edit:false`（`hub-bot-plugin/cordis.patch.yml:7-14,29-34,59-80`）。
- L3 执行（worker）会话**不带 agentPreset 创建，跑部署默认 preset**（`HB/owner-tools.js:14-15,199-201`）
  ——默认 preset 通常含 bash（开发实例 defaultPreset 为 danger-full-access，
  `docs/dev-profile.patch.yml:24-37`）。
- DSH 文件沙箱**只围栏写、不围栏读**：macOS Seatbelt profile 为 `(allow default) (deny file-write*)`
  + 可写根例外（`DSH/node_modules/@deepseek-ai/dsh-sandbox-local/src/profiles.ts:53-60`）；Linux
  bwrap 同理（`--ro-bind / /`，`profiles.ts:16-23`）。网络出站不受限（profile 无网络条目）。
  本会话实证：workspace-write 策略下 read 工具直接读取 `/Applications/…`、`/tmp/…` 绝对路径成功。
- 子进程环境有凭证名清洗：`SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i` 及 `DSH_*` 前缀
  不进子进程（`DSH/node_modules/@deepseek-ai/dsh-subprocess/src/index.ts:54-87`）。**对本案两类凭证
  均无效**：飞书 secret 在文件里、gh 令牌在 keyring 里，都不经环境变量；`GH_CONFIG_DIR`、`BASH_ENV`
  两个名字不匹配清洗模式，照常透传（实测本会话 bash `BASH_ENV=/Users/ghost233/.dsh/mattskillsdeck/
  gh-account-env.sh`，附录 A2）。

## 3. 问题 1：agent 会话当前接触凭证的路径（逐条）

「接触」= 模型在一次会话内，通过其工具面能取得凭证原文或以凭证身份发起调用。宿主进程内存模型够不到
（工具在宿主进程内执行，但模型只见工具入参/返回值；`status()` 只回打码 appId，`HB/feishu.js:138`）。

### 飞书 appId/appSecret

| # | 路径 | 谁能走 | 出处 |
|---|------|--------|------|
| F1 | read 工具读 `<stateDir>/feishu-credentials.json`（绝对路径，沙箱不围栏读；0600 只挡其他 OS 用户，会话与文件同属 ghost233） | L1/L2（只读 fs 工具）、L3（fs/bash） | `profiles.ts:53-60`；`HB/feishu.js:114-119`；附录 A1/A5 |
| F2 | bash `cat` 同一文件 | L3（默认 preset 含 bash） | 同上；`cordis.patch.yml:7-14` |
| F3 | 人工降级时读 profile 配置里的 `config.appId/appSecret`（profile yml 是用户目录普通文件） | 全部会话 | `HB/feishu.js:103-108`；`dev-profile.patch.yml:54` |
| F4 | stateDir 路径本身不保密：启动日志打印 `hub-bot ready: state %s` | —（定位信息） | `HB/index.js:209-211` |
| F5 | 持 devApi token 调管理面（loopback + `x-hub-bot-token`）；token 写在 profile 配置里，可读 | 全部会话（限开发实例；生产默认关闭） | `HB/index.js:213-224`；`dev-profile.patch.yml:51-52` |

### GitHub 凭证（令牌与身份）

| # | 路径 | 谁能走 | 出处 |
|---|------|--------|------|
| G1 | 仓库内 bash：BASH_ENV shim 按 cwd 解析 `.ghswitch` 并 `export GH_CONFIG_DIR=~/.config/gh-profiles/<login>`，gh 即登录态 | L3（及任何含 bash 的会话） | `ghAccount.js:118-167,214`；附录 A2/A3 |
| G2 | `gh auth token` 取令牌原文（keyring 存储挡不住运行 gh 本身） | 同 G1 | 附录 A3 |
| G3 | 宿主 ambient 默认 `~/.config/gh` 也登录同一账号：shim 缺失/仓库无声明时 gh 仍是 Ghost233 | 同 G1 | 附录 A4 |
| G4 | git push：credential helper 内嵌账号目录，push 即以该账号认证 | 同 G1 | `configure_local_git.py:96` |
| G5 | 模型直接以 gh 身份调任意 `gh api`（repo、workflow scope）——**这是设计目的，不是漏洞**：worker 链指令就是「worktree 修复 → `gh pr create` 提 PR」 | 同 G1 | `HB/github.js:317-322`；`docs/specs/repo-git-account/spec.md:92,123,126` |

### 对照基线（DSH 已有的凭证卫生）

LLM provider key 走的是另一条路：配置只带**引用**（`apiKeyEnv: MAGPIE_GATEWAY_KEY`，
`dev-profile.patch.yml:9`），值由 `ctx.credentials` 提供方按操作解析（`dsh-credentials/src/index.ts:1-9`；
本地提供方存 `$DSH_HOME/.credentials.yaml` 0600 并拒收宽权限文件，`dsh-credentials-local/src/index.ts`），
加上子进程 env 清洗（KEY/TOKEN 模式），**模型 bash 拿不到 LLM key**。飞书/gh 两类凭证目前都不在这条
卫生线上：一个落明文 JSON，一个按设计交给模型。

## 4. 问题 2：候选隔离/注入点——各自可行性与代价

### 4.A 插件进程内代理（SDK/HTTP 客户端包装）

**飞书侧：可行，且 SDK 自带接缝。**

- REST（`lark.Client`）：构造参数支持 `httpInstance`（自定义 axios 实例）与 `domain` 覆盖
  （`LARK:100715,100718`），`HB/feishu.js:203` 是唯一构造点。插件可把 baseURL 指向 loopback 本地
  代理，代理注入 `Authorization: Bearer <tenant_token>` 转发 open.feishu.cn。SDK 还会把
  tenant_access_token 缓存在宿主内存（`LARK:100285-100289`）——内存本来就够不到，可接受。
- 更进一步（宿主连 appSecret 都不持有）：SDK 1.76.0 原生支持 **clientAssertionProvider**——
  `appSecret` 与 `clientAssertionProvider` 二选一（`LARK:100709-100714`，仅自建应用），令牌换取改走
  OAuth jwt-bearer：`retrieveToken(aud)` 回调向外部持有者取断言（`LARK:100298-100362`）；断言可带
  `targetInfo` 让 SDK 自己把该调用改道代理 URL（`LARK:100326-100328`，GDPR 代理同款机制）。
- WSClient 长连接：appSecret **只用于** `pullConnectConfig` 一次 HTTP POST（body 带 AppID+AppSecret
  换 connectUrl，`LARK:102553-102583`）；随后的 WebSocket 用一次性 ticket URL（`LARK:102603-102635`）。
  同一 clientAssertionProvider 接缝在 WSClient 同样可用（`LARK:102422,102429-102442,102567-102580`）。
- 代价：需要一个「环境外」持有者（本地守护进程或远端服务）实现 assertion 签发/令牌代取；register()
  扫码建应用流程（`HB/feishu.js:151-173`）落盘点要改道；代理/守护进程自身成为新的秘密存放点——
  **单机同 UID 下它的文件照样可被模型读**（见 §5-N2），真隔离要跨 OS 用户或跨主机。

**GitHub 侧（仅指插件自己的轮询/回投）：可行但收益有限。**

- 插件 gh 调用集中在 `realGh`（`HB/github.js:66-74`），可替换为 undici/fetch 直连 REST 并走注入
  代理；或给 `execFile` 加 env：`GH_TOKEN=<占位> + HTTPS_PROXY=loopback`。**但 gh 是独立 Go 进程**，
  HTTPS_PROXY 对它只是 CONNECT 隧道——注入 header 必须 MITM（自签 CA 进系统/gh 信任链），代价高且脆
  （见 §4.B）。现实做法是插件侧弃 gh 改 API 客户端，把凭证收到代理里；这只覆盖插件投递面，对执行
  会话的 gh 暴露（G1-G5）零影响。

### 4.B 网络层拦截

- **进程内**：DSH 已有进程级 undici dispatcher 机制（`dsh-http-proxy`，`install.ts:186-248` 安装/
  拆卸全局 dispatcher）。理论上可装一个「按 origin 注入 header」的自定义 Dispatcher。覆盖面硬伤：
  dispatcher 只作用于 undici/fetch 调用方——**lark SDK 走 axios（node:http，`LARK:17,185`），gh 是
  Go 子进程，都够不着**；worker 线程各有自己的 dispatcher（`install.ts` 注释：线程不继承全局安装）。
  该包自身的安全注释还指出：模型脚本的运行环境不应收到可能带凭证的代理 URL（`install.ts:190-193`
  区域注释）。
- **进程间（出站代理）**：gh/curl 尊重 `HTTPS_PROXY`，但 CONNECT 隧道内是端到端 TLS，代理只见目标
  主机、无法注入 header；要注入须 MITM + 自定义 CA。且 DSH 沙箱**不限制网络出站**（§2.3，
  `(allow default)`），模型可绕开代理直连——无强制点时「自愿走代理」不构成隔离边界。
- 结论：**网络层拦截在 DSH 现状下不构成可用的凭证隔离机制**（进程内覆盖不到两条真实通道；进程间要
  MITM 且无强制点）。

### 4.C 工具调用层包装

- DSH 工具管线有三个 waterfall 接缝：`tools/pre-execute`（allow/deny/ask，事件定义
  `DSH/node_modules/@deepseek-ai/dsh-tools/src/events.ts:18`）、`tools/execute`（around 包装，
  `events.ts:29`；现成实例 `dsh-tool-call-timeout-policy/src/index.ts:56`）、`tools/post-execute`
  （改写/拦截结果，`events.ts:41`）。支持按 agent 作用域过滤。
- 能做：**策略闸**——deny 读 stateDir、`~/.config/gh*` 的 read/bash 调用；结果脱敏（凭证串出现在工具
  输出时拦截）。L1/L2 preset 已经演示了「工具面收敛」这条路（直接不给 shell，
  `cordis.patch.yml:7-14`）。
- 不能做：bash 命令是自由文本，路径模式匹配可绕过（变量拼接、base64、符号链接、`gh auth token`
  这种根本不出现路径的命令）；它**降低暴露面、留下审计点，但不根除**任何一条 §3 路径。
- 代价：规则维护与误伤；每个新暴露路径都要补规则。这是防御纵深组件，不是 Anthropic 说的注入代理。

### 4.D（附带发现）DSH 原生凭证缝 `ctx.credentials`

把 appSecret 从 plugin 私有 JSON 挪进 `$DSH_HOME/.credentials.yaml`（0600、引用化、配置面只见引用不见
值，`dsh-credentials/src/index.ts:1-9`）可对齐 §3 对照基线，消掉 F3（profile 明文降级通道）。
但它仍是同 UID 可读文件，**不改变 F1/F2 的可达性数学**——是卫生改进，不是 Anthropic 模式的隔离。

## 5. 问题 3：明确「不行」的部分

- **N1 gh CLI 身份本质上无法从执行会话隔离。** `.ghswitch`/BASH_ENV 的存在目的就是「让模型 bash
  里的 gh 跟随声明账号」（`ghAccount.js:7` 头注）；hub-bot 注入 worker 的链指令要求它以用户身份
  push 分支、开 PR（`HB/github.js:317-322`；spec 验收 `spec.md:92,123`）。把 gh 身份隔出执行会话
  = 拆除工作流本身。Anthropic 模式要求「代理在 agent 环境之外」，而**执行会话的环境就是本机用户
  环境**，gh 登录态是这个环境的组成部分。可行变体（事实陈述，非建议）：worker 不持 gh 身份、改为只推
  隔离远端或由插件代开 PR——那是对工作流语义的重新设计，超出本工单。
- **N2 单机同 UID 下，「凭证不落地到 agent 环境」靠文件权限做不到。** 沙箱不围栏读（`profiles.ts:53-60`），
  0600 对同 UID 无效（附录 A1）；任何本地守护进程的秘密文件模型照样可读。真隔离只剩三条路：
  跨 OS 用户（DSH 无此机制）、跨主机（代理/凭证在远端——最贴近 Anthropic 原文形态）、或 OS 级秘密
  存储的 ACL（macOS keychain——但 gh 路径上模型可直接运行 gh，ACL 不生效，附录 A3）。
- **N3 MITM 注入 gh/axios 的 HTTPS 不可行于本仓库约束下。** 需要自签 CA 进入系统或 gh 的信任链并长期
  维护；且 AGENTS.md 规定第三方/上游保持原样，给 gh 与 SDK 的 TLS 路径做 MITM 属高风险运维负担，
  收益（挡住本会话内本就可直接读文件/跑 gh 的模型）为负。
- **N4 飞书 user token 无暴露面**——hub-bot 不持有 user token（§2.1），无需也无法对其做注入代理。
- **N5 工具层包装不能实现「注入」语义**（§4.C）：它是闸门与脱敏，不是凭证驻外。

## 6. 事实汇总：三个注入点对 Anthropic 前提的满足度

| 候选点 | (a) 环境边界 | (b) 流量可中介 | (c) 不带凭证仍可用 | 结论 |
|--------|--------------|----------------|--------------------|------|
| 4.A 插件进程内代理（飞书 clientAssertionProvider/httpInstance） | 持有者独立部署才成立；同机同 UID 文件仍可读 | SDK 原生接缝，覆盖 REST+WS | 是（插件功能不变） | **技术可行**；隔离强度取决于持有者部署位置（本机=弱，远端=强） |
| 4.A gh→插件自有 API 客户端 | 同上 | 需弃 gh 改 REST | 是（仅插件投递面） | 可行但只覆盖投递面；不覆盖执行会话 |
| 4.B 网络层拦截 | 无强制点，沙箱不限出站 | axios/Go 够不着进程内 dispatcher；CONNECT 须 MITM | — | **不可行**（现状下） |
| 4.C 工具调用层包装 | 是策略闸不是注入代理 | 工具面全覆盖 | — | 可做防御纵深，**不构成该模式** |

## 附录 A：实测证据（2026-11-16，本机；不含任何秘密值）

- **A1** `ls -la /tmp/dsh-hub-bot-dev/state/`：`-rw-------@ 1 ghost233 wheel 130 … feishu-credentials.json`（0600、同 UID）。
- **A2** 本会话（workspace-write 策略、DSH-Workflow 之外 cwd）bash：`BASH_ENV=/Users/ghost233/.dsh/mattskillsdeck/gh-account-env.sh`，`GH_CONFIG_DIR` 为空（无声明仓库不注入）。
- **A3** `cd DSH-Workflow && gh auth status`：`Logged in to github.com account Ghost233 (keyring)`，scopes `gist, read:org, repo, workflow`；`gh auth token | wc -c` = 41（40 字符令牌 + 换行；值未记录）。
- **A4** `GH_CONFIG_DIR= gh auth status`（ambient 默认目录）：同样 `Logged in … Ghost233 (keyring)`；`~/.config/gh-profiles/Ghost233/hosts.yml` 键集 `git_protocol/users/user`（无 token 键）。
- **A5** 本会话 workspace-write 策略下，read 工具成功读取 `/Applications/Ghost DSH Station.app/…`、`/tmp/…` 绝对路径——沙箱不围栏读的实证。
- **A6** Anthropic 原文抓取：`curl -sL https://claude.com/resources/articles/building-always-on-agents`（560,791 字节 HTML），Permissions 节全文见 §1 引文。

## 附：未触碰的边界

- 未读取/记录任何凭证值（A3 只记长度）；未改动用户主检出、运行中进程与任何第三方源码。
- 本报告只做事实陈述；「是否上 clientAssertionProvider」「gh 身份语义是否重设计」等决定归地图 #79。
