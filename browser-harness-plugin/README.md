# Browser Harness 内部插件

本插件随 DSH Workflow 交付官方浏览器技能，并为启动器版本列表提供 DSH Shell 中的本机安装证据。插件版本在本目录 `package.json` 管理；官方基准由主仓库 `vendor/browser-harness` 的 gitlink 固定。

普通打包校验固定子模块，原样复制主技能、安装说明、许可及 `interaction-skills/`。包内 `upstream.json` 保存提交、官方版本和各文件 SHA-256。项目技能入口只负责引导 DSH 读取随包资料，上游原文不改。

构建检查官方 `main` 的技能资料变化，输出变化文件、前后 Git blob 摘要及比较链接，不推进子模块。网络失败明确返回 `check-failed`，仍可打包已经核验的固定内容；固定内容不完整或被修改则拒绝打包。只有用户明确要求采用更新时，才推进子模块并重新验证。

版本列表复用运行中 DSH 的认证连接。插件通过同一个默认 Shell 执行命令定位和 `--version`，为该次调用设置 `BH_TELEMETRY=0`，不连接 Chrome。DSH 不可达时显示未验证，命令不存在显示未找到，版本执行失败显示检查失败。结果证明默认 Shell 可调用，不代表特定会话的权限或浏览器连接已经就绪。

本插件不安装或升级 Browser Harness，不新增管理页、按钮或轮询。用户在外部安装 CLI 后，仍使用现有的启动器版本列表读取流程查看结果。功能与验收范围见[规格](../docs/specs/browser-harness-plugin/spec.md)。
