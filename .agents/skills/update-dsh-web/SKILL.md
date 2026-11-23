---
name: update-dsh-web
description: 更新或核验 Ghost DSH Station 的官方 DSH Web 运行时，并适配 Web 访问、共享 Host 和 Station 桥接。用于 Web 版本升级、Web 候选验收或升级后的 Web 兼容问题。
---

# 更新并适配 DSH Web

从仓库根目录执行。先读 [仓库约束](../../../AGENTS.md)和[共享服务决策](../../../docs/adr/0004-independent-dsh-server.md)，记录当前 DSH 固定版本和待保留的工作区改动。只查版本时止于来源核对。实际构建和验收使用隔离候选、临时 profile 和临时端口。

## 选定版本并装配候选

1. 用 [版本查询脚本](../../../scripts/dsh-runtime-versions.mjs)确认用户指定的完整版本。未指定时，从当前渠道选已实际发布的候选。默认沿用 [dsh-runtime.json](../../../dsh-runtime.json) 的 npm 来源，从 `@deepseek-ai/dsh` 的发布元数据核对 registry 和完整性摘要。用户指定 GitHub 源码渠道时，核对官方 tag 对应的完整提交。
2. 用[候选构建入口](../../../macos-launcher/build-candidate.mjs)试编。npm 渠道使用 `node macos-launcher/build-candidate.mjs npm "$dsh_version"`，其中 `dsh_version` 为已核验的版本。核对目标包的 `engines.node` 与本仓构建用 Node。候选入口使用 OrbStack，按仓库本机容器工作流准备。记录候选目录、实际版本及构建退出码；若功能需要的制品缺失，记录具体影响。

## 调整 Station 接入

- 对照新版的 Web 就绪记录、入口 URL、启动注入以及 HTTP 和 WebSocket 会话。差异落在受影响的 [Web Host](../../../macos-launcher/runtime/web-host.mjs)、[Station 桥接](../../../macos-launcher/runtime/station-bridge.mjs)或 [Web 代理](../../../macos-launcher/runtime/lan-gateway.mjs)。上游源码和第三方插件沿用原样。
- 保持 Station 管理唯一的 DSH Host。Web 继续通过原有密码入口连接当前实例，沿用 profile 中的配置、会话和停用选择。涉及停机时，用原有停止确认流程验证取消可恢复同一实例。
- 目标版本缺少同版本官方 Desktop 时，交付 Web-only 隔离候选和已完成的适配验证。正式打包配置保留已验证的成对版本。同版本 Desktop 可用且任务要求合并打包时，按 [Desktop 更新技能](../update-dsh-desktop/SKILL.md)验收桌面端，再同步 Web 固定记录、启动器依赖和生成的 npm 锁文件。
- 全局插件的版本由 Station 的「插件」页管理。Host 版本变化需要更新仓库插件锁时，遵循[仓库维护规则](../../../AGENTS.md#维护范围)，在 OrbStack 容器内运行[锁文件生成脚本](../../../scripts/refresh-project-plugin-lock.mjs)。验收插件兼容性，记录实际加载失败的影响，并保留上游原样。

## 核验与交付

用候选资源执行[已打包 Host 检查](../../../macos-launcher/runtime/web-packaged-host.test.mjs)和[服务集成检查](../../../macos-launcher/runtime/web-service-integration.test.mjs)，按改动选测相应的桥接、Web 代理或 Flutter 用例。通过 [项目测试入口](../../../scripts/run-project-tests.mjs)运行选定测试，传入隔离依赖目录 `DSH_TEST_RUNTIME_ROOT` 和候选资源 `DSH_SERVICE_TEST_RESOURCES`。实际验证密码登录、Web 页面和已有会话。两端成对时再确认 Desktop 和 Web 看到同一 Host。完整回归的范围遵循仓库授权。

交付时记录采用版本及来源、适配文件、真实检查结果、候选路径和待验证项，并清理临时测试进程。正式发布和现用服务切换分别沿用用户授权；发布流程见 [deploy-release](../deploy-release/SKILL.md)。
