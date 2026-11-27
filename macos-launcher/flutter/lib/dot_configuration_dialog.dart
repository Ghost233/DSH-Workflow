import 'package:flutter/material.dart';

import 'native_bridge.dart';

class DotConfigurationDialog extends StatefulWidget {
  const DotConfigurationDialog({super.key, required this.native});

  final NativeBridge native;

  @override
  State<DotConfigurationDialog> createState() => _DotConfigurationDialogState();
}

class _DotConfigurationDialogState extends State<DotConfigurationDialog> {
  final _tunnel = TextEditingController();
  final _sha = TextEditingController();
  final _sessions = TextEditingController();
  String? _directory, _error;
  bool _choosing = false;

  @override
  void dispose() {
    _tunnel.dispose();
    _sha.dispose();
    _sessions.dispose();
    super.dispose();
  }

  Future<void> _choose() async {
    setState(() => _choosing = true);
    try {
      final selected = await widget.native.chooseDotClientDirectory();
      if (mounted && selected != null) setState(() => _directory = selected);
    } catch (_) {
      if (mounted) setState(() => _error = '无法打开目录选择器。');
    } finally {
      if (mounted) setState(() => _choosing = false);
    }
  }

  void _save() {
    final tunnelId = _tunnel.text.trim();
    final sha = _sha.text.trim().toLowerCase();
    final ids = _sessions.text
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (_directory == null ||
        !RegExp(r'^tunnel_[a-f0-9]{32}$').hasMatch(tunnelId) ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(sha)) {
      setState(() => _error = '请填写已有隧道 ID、选择客户端目录并核对官方 SHA-256。');
      return;
    }
    if (ids.isEmpty ||
        ids.length > 8 ||
        ids.toSet().length != ids.length ||
        ids.any((id) => !RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id))) {
      setState(() => _error = '请填写 1–8 个不重复的会话 ID，每行一个。');
      return;
    }
    Navigator.of(context).pop({
      'directory': _directory,
      'tunnelId': tunnelId,
      'clientSha256': sha,
      'sessions': [
        for (var i = 0; i < ids.length; i++)
          {'id': ids[i], 'label': '会话 ${i + 1}'},
      ],
    });
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('配置 Dot 连接'),
    content: SizedBox(
      width: 500,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('使用已有隧道。Dot 只能读取你在下方授权的会话。保存不会立即连接。'),
            TextField(
              controller: _tunnel,
              decoration: const InputDecoration(labelText: '已有隧道 ID'),
            ),
            TextField(
              controller: _sha,
              decoration: const InputDecoration(labelText: '官方客户端 SHA-256'),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _choosing ? null : _choose,
              child: const Text('选择已有客户端目录'),
            ),
            if (_directory case final directory?) Text(directory),
            TextField(
              controller: _sessions,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: '允许 Dot 读取的会话 ID（每行一个）',
              ),
            ),
            if (_error case final error?) Text(error),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('取消'),
      ),
      FilledButton(
        onPressed: _choosing ? null : _save,
        child: const Text('保存配对'),
      ),
    ],
  );
}
