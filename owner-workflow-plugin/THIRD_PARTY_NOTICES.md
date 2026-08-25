# 第三方源码说明

## dsh-approve-for-me

- 上游地址：<https://github.com/timeance/dsh-approve-for-me>
- 固定版本：`a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`
- 许可证：MIT，原文位于 `vendor/dsh-approve-for-me/LICENSE`
- 使用范围：只复用 `src/core/` 中的纯命令解析、固定风险识别、字面白名单和模型复核提示构造。

Owner Workflow 不修改该子模块，也不加载它的 Cordis 插件入口、权限 preset 或 Web 设置卡片。主代理使用用户独立安装的 `dsh-approve-for-me`；Operation 专用审批插件只读取同一设置分区，并在自己的 `operation_exec` 边界内调用固定版本的纯策略核心。
