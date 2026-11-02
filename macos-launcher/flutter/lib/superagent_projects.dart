import 'dart:async';

import 'package:flutter/material.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'launcher_controller.dart';

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
      builder: (_) => _ProjectDialog(model: model, project: project),
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
        if (selected?['legacy'] != true || selected?['revision'] != null)
          const Text('项目目录受写入保护；任务在你指定的独立目录执行。'),
        const Text('外部 MCP 服务按其自身权限运行，请确认它们不会修改原项目。'),
        const Text('MCP 服务可能有自己的账号，请检查它是否与项目选择的 GitHub 账号一致。'),
        const Text('不同 GitHub 账号请使用独立 gh 配置目录，运行期间不要切换该目录的活动账号。'),
        const Text('上游会限制任务可用的插件工具；新增插件后请重启对应实例。'),
        const Text('添加或修改项目时请先停止各 Superagent，以更新受保护目录；日常 DSH 不受影响。'),
        const Text('已有任务历史的实例不能更换仓库、账号、机器人和任务目录等绑定；需要新绑定时请添加项目。'),
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
      ],
    );
  }
}

class _ProjectDialog extends StatefulWidget {
  const _ProjectDialog({required this.model, required this.project});
  final LauncherController model;
  final Map<String, Object?>? project;

  @override
  State<_ProjectDialog> createState() => _ProjectDialogState();
}

class _ProjectDialogState extends State<_ProjectDialog> {
  static const _labels = <String, String>{
    'name': '项目名称',
    'repository': 'GitHub 仓库（owner/name）',
    'githubLogin': 'GitHub 登录账号',
    'ghConfigDir': 'gh 账号配置目录',
    'ghExecutable': 'gh 命令路径（可留空）',
    'githubAllowed': '允许发起任务的 GitHub 用户（逗号分隔，留空则清空）',
    'localProjectDir': '本地项目目录（只读保护）',
    'executionRoot': '独立任务目录',
    'prepare': '任务目录准备命令',
    'authorName': 'Git 提交作者姓名（可留空）',
    'authorEmail': 'Git 提交作者邮箱（可留空）',
    'feishuConfigDir': '飞书机器人配置目录（留空则禁用飞书）',
    'larkExecutable': 'lark-cli 命令路径（可留空）',
    'feishuChatId': '飞书群 ID（oc_…）',
    'feishuAllowedId': '允许发起任务的飞书用户 ID（ou_…）',
  };
  late final Map<String, TextEditingController> _fields;
  late bool _enabled;
  late bool _preserveLegacyPolicy;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fields = {
      for (final key in _labels.keys)
        key: TextEditingController(text: widget.project?[key] as String? ?? ''),
    };
    _enabled = widget.project?['executionEnabled'] == true;
    _preserveLegacyPolicy =
        widget.project?['legacy'] == true &&
        (widget.project?['revision'] == null ||
            widget.project?['preserveLegacyPolicy'] == true);
  }

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.model.saveSuperagentProject({
        for (final entry in _fields.entries) entry.key: entry.value.text,
        'executionEnabled': _enabled,
        'preserveLegacyPolicy': _preserveLegacyPolicy,
        if (widget.project?['revision'] != null)
          'revision': widget.project!['revision'],
      }, id: widget.project?['id'] as String?);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(
      widget.project == null ? '添加 Superagent 项目' : '编辑 Superagent 项目',
    ),
    content: SizedBox(
      width: 620,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('任务目录需要自行准备；Station 不会自动创建 worktree 或修改现有项目。'),
            const Text('准备命令可用 WORKFLOW_PROJECT_DIR 引用选中的本地项目。'),
            if (widget.project?['legacy'] == true)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('空白名单沿用原面板设置'),
                subtitle: const Text('关闭后，留空会清除对应的允许用户和飞书群。'),
                value: _preserveLegacyPolicy,
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _preserveLegacyPolicy = value),
              ),
            if (widget.model.superagentGithubAccounts.isNotEmpty)
              DropdownButton<String>(
                hint: const Text('选择已有 gh 账号'),
                isExpanded: true,
                items: [
                  for (final account in widget.model.superagentGithubAccounts)
                    DropdownMenuItem(
                      value: account['login'] as String,
                      child: Text(account['login'] as String),
                    ),
                ],
                onChanged: (login) {
                  if (login == null) return;
                  final account = widget.model.superagentGithubAccounts
                      .firstWhere((row) => row['login'] == login);
                  setState(() {
                    _fields['githubLogin']!.text = login;
                    _fields['ghConfigDir']!.text =
                        account['directory'] as String;
                  });
                },
              ),
            for (final entry in _labels.entries)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: TextField(
                  controller: _fields[entry.key],
                  decoration: InputDecoration(labelText: entry.value),
                  minLines: entry.key == 'prepare' ? 2 : 1,
                  maxLines: entry.key == 'prepare' ? 4 : 1,
                ),
              ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('允许接收并执行任务'),
              subtitle: const Text('需要先填写独立任务目录和准备命令。'),
              value: _enabled,
              onChanged: _saving
                  ? null
                  : (value) => setState(() {
                      _enabled = value;
                    }),
            ),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _saving ? null : () => Navigator.pop(context),
        child: const Text('取消'),
      ),
      FilledButton(onPressed: _saving ? null : _save, child: const Text('保存')),
    ],
  );
}
