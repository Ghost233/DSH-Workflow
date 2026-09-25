# 第三方源码说明

## dsh-approve-for-me

- 上游地址：<https://github.com/timeance/dsh-approve-for-me>
- 固定版本：`a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`
- 许可证：MIT，原文位于 `vendor/dsh-approve-for-me/LICENSE`
- 当前用途：保留固定的第三方子模块；项目自研插件不加载或打包其代码。

Owner Workflow 不修改该子模块，也不加载它的 Cordis 插件入口、权限 preset 或 Web 设置卡片。用户若独立安装 `dsh-approve-for-me`，由 DSH Web profile 自行管理。
