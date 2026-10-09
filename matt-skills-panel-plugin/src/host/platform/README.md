# macOS 平台层

Matt 派生版只维护 macOS ARM64。`createPlatform(ctx)` 提供宿主平台服务；
其他系统覆盖参数在任何程序解析或打开动作前明确拒绝。

```text
platform/
  index.js    公共工厂与包装
  darwin/     macOS 原语
```

公共接口保留 `os`、`getHome()`、`path`、`resolveExecutable()`、
`fs`、`env`、`openFolder()` 与 `openFile()`。路径委托 `node:path.posix`，
保留大小写和文件名中的反斜杠。主目录由 `os.homedir()` 提供并缓存，
不可用时返回 null；`joinHome()` 使用同一来源。

程序解析透传 DSH subprocess，失败返回 null。GitHub CLI 的
`DSH_GH_PATH` 兜底只在文件服务确认目标存在后采用。
可见打开仍使用 macOS `open` 和原文件/目录参数。文件服务
透传 DSH 沙箱，环境视图只读，不写入用户 profile。
