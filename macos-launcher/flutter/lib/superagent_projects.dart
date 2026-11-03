import 'dart:async';

import 'package:flutter/material.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'launcher_controller.dart';
import 'superagent_project_wizard.dart';

class SuperagentProjects extends StatelessWidget {
  const SuperagentProjects({super.key, required this.model, required this.act});

  final LauncherController model;
  final Future<void> Function(Future<void> Function()) act;

  Future<void> _edit(
    BuildContext context,
    Map<String, Object?>? project,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (_) => SuperagentProjectWizard(model: model, project: project),
    );
  }

  String _state(ServiceState state) => switch (state) {
    ServiceState.running => '运行中',
    ServiceState.starting => '启动中',
    ServiceState.stopping => '停止中',
    ServiceState.failed => '异常',
    ServiceState.stopped => '已停止',
    _ => '状态待确认',
  };

  Widget _project(BuildContext context, Map<String, Object?> project) {
    final id = project['id'] as String;
    final status = model.superagentStatusFor(id);
    final busy = model.isSuperagentBusy(id);
    final warnings = model.superagentWarningsFor(id);
    return Card(
      key: ValueKey('superagent-project-$id'),
      margin: const EdgeInsets.only(top: 16, bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              project['name'] as String,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (project['repository'] is String)
              Text(project['repository'] as String),
            if (project['githubLogin'] is String)
              Text('GitHub 账号：${project['githubLogin']}'),
            Text('后端状态：${busy ? '正在处理…' : _state(status.state)}'),
            if (status.message?.isNotEmpty == true)
              SelectableText(status.message!),
            Text(model.superagentSharingFor(id)),
            if (warnings.isNotEmpty)
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text('未共享的可选插件（${warnings.length}）'),
                children: [
                  for (final warning in warnings)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(warning),
                    ),
                ],
              ),
            if (project['error'] is String) Text(project['error'] as String),
            if (project['deploymentMode'] == 'dedicated')
              const Text('使用 Superagent 专用仓库，任务在独立 worktree 中执行。'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton(
                  onPressed: model.superagentBusy
                      ? null
                      : () => unawaited(_edit(context, project)),
                  child: const Text('编辑项目'),
                ),
                OutlinedButton(
                  onPressed:
                      busy ||
                          status.state == ServiceState.running ||
                          status.state == ServiceState.starting
                      ? null
                      : () => unawaited(
                          act(() => model.startSuperagent(projectId: id)),
                        ),
                  child: const Text('启动 Superagent'),
                ),
                OutlinedButton(
                  onPressed: busy || status.state == ServiceState.stopped
                      ? null
                      : () => unawaited(
                          act(() => model.stopSuperagent(projectId: id)),
                        ),
                  child: const Text('停止 Superagent'),
                ),
                OutlinedButton(
                  onPressed: busy || status.ready != true
                      ? null
                      : () => unawaited(
                          act(() => model.openSuperagent(projectId: id)),
                        ),
                  child: const Text('打开浏览器面板'),
                ),
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () => unawaited(
                          act(() => model.refreshSuperagent(projectId: id)),
                        ),
                  child: const Text('刷新状态'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('每个项目使用独立的浏览器后端；日常桌面版和 Web 继续共用原有 DSH 服务。'),
        OutlinedButton(
          onPressed: model.superagentBusy
              ? null
              : () => unawaited(_edit(context, null)),
          child: const Text('添加项目'),
        ),
        if (model.superagentProjects.isEmpty)
          const Text('尚未绑定项目，请先添加 GitHub 仓库。'),
        for (final project in model.superagentProjects)
          _project(context, project),
        const Text('关闭窗口后 Superagent 继续运行；退出 Station 会停止全部服务。'),
        const ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text('共享配置与项目保护说明'),
          children: [
            Text('外部 MCP 服务按其自身权限运行，请确认它们不会修改原项目。'),
            Text('MCP 服务可能有自己的账号，请检查它是否与项目选择的 GitHub 账号一致。'),
            Text('不同 GitHub 账号需要使用独立的 gh 配置目录。'),
            Text('上游会限制任务可用的插件工具；新增插件后请重启对应实例。'),
            Text('添加或修改项目时请先停止各 Superagent；日常 DSH 不受影响。'),
            Text('已有任务历史的实例不能更换仓库、账号、机器人和任务目录等绑定；需要新绑定时请添加项目。'),
          ],
        ),
      ],
    );
  }
}
