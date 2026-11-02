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
    _ => '已停止',
  };

  @override
  Widget build(BuildContext context) {
    final selected = model.selectedSuperagentProject;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('每个项目使用独立的浏览器后端；日常桌面版和 Web 继续共用原有 DSH 服务。'),
        if (model.superagentProjects.isEmpty) const Text('尚未添加 Superagent 项目。'),
        if (model.superagentProjects.isNotEmpty)
          DropdownButton<String>(
            value: model.selectedSuperagentProjectId,
            isExpanded: true,
            items: [
              for (final project in model.superagentProjects)
                DropdownMenuItem(
                  value: project['id'] as String,
                  child: Text(project['name'] as String),
                ),
            ],
            onChanged: model.superagentBusy
                ? null
                : (value) {
                    if (value != null) {
                      unawaited(
                        act(() => model.selectSuperagentProject(value)),
                      );
                    }
                  },
          ),
        if (selected != null) ...[
          Text('项目状态：${_state(model.superagentSnapshot.state)}'),
          if (model.superagentSnapshot.message?.isNotEmpty == true)
            SelectableText(model.superagentSnapshot.message!),
          Text(model.modelSharingMessage),
          for (final warning in model.superagentSharingWarnings)
            Text('共享配置：$warning'),
          if (selected['legacy'] == true)
            const Text('原有实例的数据保留在原目录；可编辑项目以启用独立账号和目录保护。'),
          if (selected['legacy'] == true && selected['revision'] == null)
            const Text('原有实例尚未配置项目目录保护。'),
        ],
        if (selected?['deploymentMode'] == 'dedicated')
          const Text('使用 Superagent 专用仓库，任务在独立 worktree 中执行。')
        else if (selected != null &&
            (selected['legacy'] != true || selected['revision'] != null))
          const Text('项目目录受写入保护；任务在独立目录执行。'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton(
              onPressed: model.superagentBusy
                  ? null
                  : () => unawaited(_edit(context, null)),
              child: const Text('添加项目'),
            ),
            OutlinedButton(
              onPressed: model.superagentBusy || selected == null
                  ? null
                  : () => unawaited(_edit(context, selected)),
              child: const Text('编辑项目'),
            ),
            OutlinedButton(
              onPressed: model.superagentBusy || selected == null
                  ? null
                  : () => unawaited(act(model.startSuperagent)),
              child: const Text('启动 Superagent'),
            ),
            OutlinedButton(
              onPressed: model.superagentBusy || selected == null
                  ? null
                  : () => unawaited(act(model.stopSuperagent)),
              child: const Text('停止 Superagent'),
            ),
            OutlinedButton(
              onPressed:
                  model.superagentBusy || model.superagentSnapshot.ready != true
                  ? null
                  : () => unawaited(act(model.openSuperagent)),
              child: const Text('打开浏览器面板'),
            ),
            OutlinedButton(
              onPressed: model.superagentBusy || selected == null
                  ? null
                  : () => unawaited(act(model.refreshSuperagent)),
              child: const Text('刷新状态'),
            ),
          ],
        ),
        const Text('关闭 Station 后，已启动的 Superagent 继续运行。'),
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
