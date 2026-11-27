import 'package:flutter/material.dart';

import 'dot_configuration_dialog.dart';
import 'native_bridge.dart';

class DotGuidedSetupDialog extends StatefulWidget {
  const DotGuidedSetupDialog({
    super.key,
    required this.native,
    required this.load,
  });

  final NativeBridge native;
  final Future<Map<String, Object?>> Function() load;

  @override
  State<DotGuidedSetupDialog> createState() => _DotGuidedSetupDialogState();
}

class _DotGuidedSetupDialogState extends State<DotGuidedSetupDialog> {
  final _tunnel = TextEditingController();
  final _key = TextEditingController();
  Map<String, Object?>? _options;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await widget.load();
      if (!mounted) return;
      setState(() {
        _options = value;
        if (_tunnel.text.isEmpty) {
          _tunnel.text = value['tunnelId'] as String? ?? '';
        }
      });
    } catch (_) {
      if (mounted) setState(() => _error = '暂时读不到本机配对或 DSH 会话，请刷新。');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _advanced() async {
    final value = await showDialog<Map<String, Object?>>(
      context: context,
      builder: (_) => DotConfigurationDialog(native: widget.native),
    );
    if (mounted && value != null) Navigator.of(context).pop(value);
  }

  Future<void> _openInstallGuide() async {
    try {
      await widget.native.openUrl(
        'https://github.com/openai/tunnel-client#install-with-homebrew',
      );
    } catch (_) {
      if (mounted) setState(() => _error = '无法打开官方安装说明。');
    }
  }

  void _save() {
    final id = _tunnel.text.trim();
    if (!RegExp(r'^tunnel_[a-f0-9]{32}$').hasMatch(id)) {
      setState(() => _error = '请粘贴 OpenAI 已有隧道 ID。');
      return;
    }
    final key = _key.text.trim();
    if (_options?['keyAvailable'] != true &&
        !RegExp(r'^sk-[A-Za-z0-9_-]{12,240}$').hasMatch(key)) {
      setState(() => _error = '请在本窗口输入受限的 Runtime API Key。');
      return;
    }
    Navigator.of(context).pop({
      'mode': 'guided',
      'tunnelId': id,
      'sessionIds': <String>[],
      if (key.isNotEmpty) 'runtimeKey': key,
    });
  }

  @override
  void dispose() {
    _tunnel.dispose();
    _key.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ready = _options?['clientAvailable'] == true;
    final discoveredId = _options?['tunnelId'] as String?;
    return AlertDialog(
      title: const Text('配置 Dot 连接'),
      content: SizedBox(
        width: 500,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading) const LinearProgressIndicator(),
              if (!_loading && _options != null) ...[
                if (!ready) ...[
                  const Text('尚未安装官方 Tunnel 客户端。按官方说明安装后，回到这里刷新。'),
                  OutlinedButton(
                    onPressed: _openInstallGuide,
                    child: const Text('查看官方安装说明'),
                  ),
                ] else ...[
                  const Text('已找到受信客户端。校验值由 Station 自动计算。'),
                  if (discoveredId == null)
                    TextField(
                      controller: _tunnel,
                      decoration: const InputDecoration(labelText: '已有隧道 ID'),
                    )
                  else
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text('将复用发现的现有隧道。'),
                    ),
                  if (_options?['keyAvailable'] != true)
                    TextField(
                      controller: _key,
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(
                        labelText: 'Runtime API Key（仅保存在这台 Mac）',
                      ),
                    ),
                  const SizedBox(height: 8),
                  const Text('连接后可查询全局活跃会话，无需勾选。不会持续监听或读取正文。'),
                ],
              ],
              if (_error case final error?) Text(error),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : _refresh,
          child: const Text('刷新'),
        ),
        TextButton(onPressed: _advanced, child: const Text('高级手动配置')),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: !_loading && ready ? _save : null,
          child: const Text('保存配对'),
        ),
      ],
    );
  }
}
