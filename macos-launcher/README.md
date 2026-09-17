# DSH Workflow macOS 启动器

这个应用仅管理 DSH Web 进程。菜单栏和管理窗口由 SwiftUI 绘制；DSH 的界面始终在系统浏览器中打开，没有 WebView。应用资源包含固定版本的 DSH、Node 和三个自研插件。第三方插件仍由 `$DSH_HOME/profiles/web` 的 DSH 原生 profile 加载；打包与启动都不会安装、更新或改写第三方插件。

## 构建

在本仓库根目录运行：

```sh
node macos-launcher/build.mjs
```

要求 macOS、Xcode 命令行工具、固定 commit 的 DSH submodule、npm，以及与当前 Node 架构和版本对应的 `owner-workflow-plugin/node_modules/fs-ext`。不需要先构建 DSH 源码；构建脚本从上游 npm 发行版按 `package-lock.json` 安装固定版本的生产运行时到 `.build/`，不运行 DSH 的 Git hooks 安装脚本，也不改动上游源码。产物是 `.build/DSH Workflow-<应用版本>-dsh<DSH 版本>-<架构>.app`；本地构建使用 ad-hoc 签名。向其他 Mac 分发时需另行使用自己的 Developer ID 签名并公证。

运行时不会查找 Git 仓库、系统 Node、pnpm 或源码构建标记。修改自研插件后重新构建应用。用户凭据、会话、工作目录、第三方插件和 DSH profile 都保留在应用包之外，应用升级不会清空它们。

## 使用

启动应用后，菜单栏显示 DSH 状态。首次启动默认以当前用户的主目录为工作目录、使用 3080 端口；请在“管理…”中选择实际工程目录，再重启 DSH。设置窗口提供启动、停止、重启、端口、工作目录和 DSH 工具权限选项。关闭管理窗口不停止 DSH；退出启动器会停止它管理的 DSH。可选择登录后自动启动应用；启用这个选项前，先将 `.app` 放到固定位置（如 `/Applications`），避免之后移动应用导致登录项失效。

“完整访问权限”只设置本次 DSH 进程的 `DSH_PERMISSION_MODE=danger-full-access`，不修改用户的 DSH 配置；关闭时使用 `workspace-write`。DSH 已保存的会话或 General settings 权限仍按 DSH 自身规则生效。端口和权限更改需重启 DSH。

浏览器入口使用 DSH 本次启动签发的认证 URL。该 URL 只通过启动器进程内存传给菜单栏应用；DSH 原生日志保留在工作目录下的 `.dsh-workflow/web-host/logs/`，文件权限为 `0600`。远程访问仍应使用 SSH 端口转发或私有网络代理，DSH 默认只监听 `127.0.0.1`。

启动器只控制自己创建的进程；若端口已被其他 DSH 实例占用，会显示启动失败，不会接管或关闭现有实例。

## GitHub 构建与更新

`.github/workflows/macos-app.yml` 在相关 PR、`main` 推送、手动触发和 `macos-v<版本>` 标签推送时编译 Apple Silicon 与 Intel 两种应用。每次构建都会上传 DMG 作为 Actions artifact；标签构建全部通过后，自动把两个 DMG 附到同名 GitHub Release。打开 DMG 后可将应用拖入“应用程序”文件夹。发布前把 `macos-launcher/package.json` 和 `package-lock.json` 的版本一起更新，再创建与该版本完全一致的标签，例如 `macos-v0.1.0`。标签版本不匹配时构建会失败，不会发布。

应用启动时会检查一次 [GitHub Releases](https://github.com/Ghost233/DSH-Workflow/releases)，也可以从菜单或管理窗口手动检查。只认 `macos-v<主版本>.<次版本>.<修订版本>`、非草稿且非预发布的版本。发现更新后显示“查看新版本”；只有点击它才会用系统浏览器打开对应 Release 页面。应用不会自动下载或替换自身，网络错误也不影响 DSH 运行。

Actions 的 DMG 内含 ad-hoc 签名、未经 Apple 公证的应用；准备给其他 Mac 正式分发时，还需要配置 Developer ID 签名和公证流程。
