# DSH Workflow 标准发布流程

正式发布入口是 `scripts/release.sh`，对应仓库 skill 为 `macos-release`。本流程改编自 GhostModelDeck 的 deploy-release、release.py 和打包脚本，并沿用 DSH 的 `macos-v<X.Y.Z>` 标签及 [macos-app.yml](../../.github/workflows/macos-app.yml)。编辑发布流程只执行编辑与验证；发布标签需要用户明确授权。

## 版本与发布内容

应用发布版本以 `macos-launcher/package.json` 的 `version` 为准，使用纯 `X.Y.Z`。`package-lock.json` 的顶层、根包版本和 Flutter `pubspec.yaml` 的版本主体必须相同；Flutter 可保留 `+build`。DSH 固定版本独立记录在 `dsh-runtime.json`，可使用上游 alpha 版本。

沿用用户已确定的目标版本和发布范围。未确定时，准备好要发布的改动，再说明目标版本与内容，取得确认。版本必须严格高于远端已有的 `macos-v*` 标签。脚本读取当前版本，不自动递增、提交或推送 main。

升应用版本可运行 `npm version <X.Y.Z> --prefix macos-launcher --no-git-tag-version`，并同步 Flutter `pubspec.yaml` 的版本主体。只改应用版本时，检查两个 npm 文件的 diff；更新 DSH 时还要检查依赖锁文件、子模块及插件锁文件的一致性。项目插件锁文件遵循 AGENTS.md 的容器内元数据生成流程。

## 发布前验证

先按 AGENTS.md 完成本次改动涉及的本地门禁，记录命令、源码版本和真实退出码。以下是现有检查入口，按本次变更范围选择，并覆盖最终发布内容：

```sh
node scripts/harness-runtime.mjs check deepseek-harness
node agent-observation-plugin/scripts/build-client.mjs --check
node scripts/run-project-tests.mjs
npm run build --prefix matt-skills-panel-plugin
npm test --prefix matt-skills-panel-plugin
bash macos-launcher/flutter/check.sh
bash -n scripts/release.sh scripts/build-release.sh
python3 -B scripts/test_release.py
```

工程依赖和工具链由工程初始化流程准备，发布脚本不安装依赖。环境缺失时保留真实失败，列明本地验证缺口，取得用户明确的远端补验授权。已知本地失败先修复。生产运行时、完整应用和 DMG 的构建及验收步骤与 CI 相同，见 [macOS 启动器说明](../../macos-launcher/README.md)。已有成功结果只能在对应输入与环境未变时复用。

审查并提交发布内容后，在当前主工作区同步 main。只使用 fast-forward；不自动 stash、移动或覆盖用户文件。执行入口前，本地 main、origin/main 和实际远端 main 必须指向同一完整提交。若本地有新提交，先从本地 main 推送并核对远端；脚本只推标签。

## 发布入口

```sh
scripts/release.sh --dry-run
scripts/release.sh
```

空跑核对三个应用版本、DSH 子模块与包版本、插件锁文件、干净工作树、main 同步状态、HTTPS origin、有效 GitHub 身份及实际 Git 凭据。有效身份必须为 Ghost233。脚本使用已核验的 gh credential helper，不切换全局账号、不写凭据、不 fetch 或修改 Git refs。

正式执行为当前 main 创建附注 `macos-v<X.Y.Z>` 标签并推送。输出“已推送”表示 CI 已受理。普通 main push 生成 Actions artifacts；版本标签触发正式 Release。

## 打包与产物

CI 完成官方 DSH 生产构建、Desktop 验收和启动器验收后，调用同一个打包入口：

```sh
scripts/build-release.sh --app-path '<已构建的完整应用.app>' --output-dir .build/release-assets
```

打包入口核对应用版本、bundle ID、ARM64 可执行文件、打包的 DSH 版本、Desktop 资源和签名。它使用已构建的完整应用，不替代前面的生产构建与功能验收。默认应用路径与 `macos-launcher/build.mjs` 的输出一致。已存在的同名产物保留，换用空目录后再执行。

正式产物包括：

- `DSH-Workflow-macOS-<X.Y.Z>-arm64.dmg`。
- `manifest.json`，记录应用版本、标签、完整源码提交、DSH 版本和 DMG 的文件名、大小及 SHA256。
- `SHA256SUMS`，覆盖 DMG 和 manifest。

DMG 使用现有 ad-hoc 签名，未公证。三个文件全部生成并校验成功后才复制到输出目录。CI 发布前再次核对 manifest 与触发标签的提交，随后创建正式 Release；已有 Release 会使创建失败，不覆盖其资产。

## 跟踪和验收

跟踪脚本输出的完整提交，并选择 `headBranch` 等于发布标签、`headSha` 等于该提交的运行。main push 与标签 push 可能产生两个运行。

```sh
gh run list -R Ghost233/DSH-Workflow --workflow macos-app.yml --commit <完整提交>
gh run watch <标签运行ID> -R Ghost233/DSH-Workflow --exit-status
gh release view macos-v<X.Y.Z> -R Ghost233/DSH-Workflow
gh release download macos-v<X.Y.Z> -R Ghost233/DSH-Workflow --dir <本次空验证目录>
```

认证命令沿用已核验的 Ghost233 身份。下载目录中运行 `shasum -a 256 -c SHA256SUMS`，并核对 manifest 的 DMG 大小、SHA256、版本、标签和源码提交。只有以下证据齐全才报告发布完成：

- 对应标签运行成功，Release 非草稿、非预发布。
- 一份 ARM64 DMG、manifest 和 SHA256SUMS 均存在，校验通过。
- Release、manifest、应用版本及发布提交一致，实际远端标签解析到同一提交。
- 当前主工作区的本地 main 与远端 main 同步，没有 behind；发布标签的本地、远端提交一致。保留的备份和未同步分支如实列明。

报告 Release 链接。启动器的 `flutter/lib/update_policy.dart` 只发现正式 `macos-v<X.Y.Z>` Release，且发布版本须高于已安装版本。

## 失败恢复

| 失败点 | 下一步 |
| --- | --- |
| 版本、工作树、账号或同步检查失败 | 未创建标签。按错误处理，不自动暂存或覆盖用户文件。 |
| 标签推送失败 | 保留本地标签，先查实际远端。远端没有该标签时，依次运行 `scripts/release.sh --dry-run --retry-tag` 和 `scripts/release.sh --retry-tag`。只重推指向当前 main 的同一附注标签。 |
| 标签已经在远端 | 跟踪既有运行，不移动、删除或重推标签。 |
| CI 失败 | 保留首个错误。输入未变的环境故障可重跑同一运行；代码修复先本地验证，再用下一应用版本发布。 |
| Release 已创建或资产不完整 | 核对现有资产与对应运行，不使用 `--clobber`。修复后用下一版本发布，保留失败证据。 |

`python3 -B scripts/test_release.py` 在临时 Git 仓库和本地裸仓库中验证标签、身份、版本及失败恢复；打包测试在 CLI 接缝验证产物与失败处理。它不访问 GitHub、不发布正式版，也不代替真实生产应用与 DMG 验收。
