import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'launcher_controller.dart';

class ModelSettingsPage extends StatefulWidget {
  const ModelSettingsPage({super.key, required this.model});
  final LauncherController model;

  @override
  State<ModelSettingsPage> createState() => _ModelSettingsPageState();
}

class _ModelSettingsPageState extends State<ModelSettingsPage> {
  String? selectedDefault;
  LauncherController get model => widget.model;
  int get codexAccountCount {
    final providers = model.modelSettings?['providers'] as List? ?? [];
    for (final raw in providers) {
      final provider = objectValue(raw);
      if (provider['id'] == 'openai-codex' && provider['oauth'] is Map) {
        return ((provider['oauth'] as Map)['accounts'] as List? ?? []).length;
      }
    }
    return 0;
  }

  Future<void> run(Future<void> Function() action) async {
    model.clearError();
    try {
      await action();
    } catch (error) {
      model.reportError(error);
    }
  }

  Future<void> edit(Map<String, Object?>? provider) async {
    await showDialog<void>(
      context: context,
      builder: (context) => _ProviderEditor(model: model, provider: provider),
    );
  }

  Future<void> loginCodex() async {
    await showDialog<void>(
      context: context,
      builder: (context) => _CodexAuthorizationDialog(
        model: model,
        defaultName: 'Codex 账号 ${codexAccountCount + 1}',
      ),
    );
  }

  Future<void> importCodex() async {
    var name = '本机 Codex CLI ${codexAccountCount + 1}';
    final label = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('导入 Codex CLI 认证'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Station 与 Codex CLI 将使用同一组登录令牌；令牌刷新后，另一边可能需要重新登录。'),
            const Text('如果 CLI 使用钥匙串或内存保存认证，可能没有 auth.json；可以改用设备码登录。'),
            TextFormField(
              initialValue: name,
              onChanged: (value) => name = value,
              decoration: const InputDecoration(labelText: '认证名称'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, name.trim()),
            child: const Text('选择文件'),
          ),
        ],
      ),
    );
    if (label == null || label.isEmpty || !mounted) return;
    final path = await model.native.chooseCodexAuthFile();
    if (path == null || !mounted) return;
    await run(
      () => model.updateModelSettings({
        'type': 'codex-import',
        'path': path,
        'name': label,
      }),
    );
  }

  Future<void> removeCodex(Map<String, Object?> account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('移除认证'),
        content: Text('移除 ${account['name']} 的 Station 认证？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('移除'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await run(
        () => model.updateModelSettings({
          'type': 'codex-remove',
          'id': account['id'],
        }),
      );
    }
  }

  Future<void> remove(Map<String, Object?> provider) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('移除模型提供商'),
        content: Text('移除 ${provider['displayName']} 的模型配置？已保存的凭据会保留。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('移除'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await run(
        () => model.updateModelSettings({
          'type': 'remove',
          'id': provider['id'],
          'revision': provider['revision'],
        }),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = model.modelSettings;
    final providers = (snapshot?['providers'] as List? ?? [])
        .map(objectValue)
        .toList();
    final groups = (snapshot?['groups'] as List? ?? [])
        .map(objectValue)
        .toList();
    final defaults = snapshot?['defaultModel'] is Map
        ? objectValue(snapshot!['defaultModel'])
        : <String, Object?>{};
    final choices = <String, String>{};
    for (final group in groups) {
      for (final raw in group['models'] as List? ?? []) {
        final item = objectValue(raw);
        if (group['id'] is! String || item['id'] is! String) continue;
        final key = jsonEncode([group['id'], item['id']]);
        choices[key] =
            '${group['name'] ?? group['id']} / ${item['name'] ?? item['id']}';
      }
    }
    final current = jsonEncode([defaults['provider'], defaults['model']]);
    final selection = choices.containsKey(selectedDefault)
        ? selectedDefault
        : choices.containsKey(current)
        ? current
        : null;
    final writable =
        snapshot?['writable'] == true && !model.loadingModelSettings;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('统一模型配置', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        const Text('在 Station 中管理模型提供商；DSH 与 Superagent 使用同一份配置。'),
        const Text('原有 Superagent 独立配置会保留，统一后以 DSH 的模型配置为准。'),
        Text(model.modelSharingMessage),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton(
              onPressed: model.loadingModelSettings
                  ? null
                  : () => unawaited(run(model.refreshModelSettings)),
              child: Text(snapshot == null ? '加载模型配置' : '刷新'),
            ),
            FilledButton(
              onPressed: writable ? () => unawaited(edit(null)) : null,
              child: const Text('添加模型提供商'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Expanded(
          child: snapshot == null
              ? const Center(child: Text('启动 DSH 服务后即可配置模型。'))
              : ListView(
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '默认模型',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 6),
                            Text(
                              '当前：${defaults['provider'] ?? '未设置'} / ${defaults['model'] ?? '未设置'}',
                            ),
                            const Text(
                              '默认选择用于新会话；Superagent 可在自己的任务设置中选择其他模型。',
                            ),
                            if (choices.isNotEmpty)
                              Wrap(
                                spacing: 12,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  SizedBox(
                                    width: 300,
                                    child: DropdownButton<String>(
                                      isExpanded: true,
                                      hint: const Text('选择模型'),
                                      value: selection,
                                      items: choices.entries
                                          .map(
                                            (entry) => DropdownMenuItem(
                                              value: entry.key,
                                              child: Text(
                                                entry.value,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          )
                                          .toList(),
                                      onChanged: writable
                                          ? (value) => setState(
                                              () => selectedDefault = value,
                                            )
                                          : null,
                                    ),
                                  ),
                                  OutlinedButton(
                                    onPressed: writable && selection != null
                                        ? () {
                                            final pair = (jsonDecode(
                                              selection,
                                            ) as List).cast<String>();
                                            unawaited(
                                              run(
                                                () => model.updateModelSettings({
                                                  'type': 'default',
                                                  'provider': pair[0],
                                                  'model': pair[1],
                                                  'revision':
                                                      snapshot['defaultRevision'],
                                                }),
                                              ),
                                            );
                                          }
                                        : null,
                                    child: const Text('设为默认'),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                    ),
                    for (final provider in providers)
                      Card(
                        child: Column(
                          children: [
                            ListTile(
                              title: Text(
                                '${provider['displayName']}  ·  ${provider['id']}',
                              ),
                              subtitle: Text(
                                [
                                  provider['account'] == true
                                      ? '使用已登录的 DeepSeek 账号'
                                      : provider['id'] == 'openai-codex'
                                      ? switch (provider['oauth']) {
                                          {
                                            'available': true,
                                            'configured': true,
                                          } =>
                                            '已保存 ChatGPT 授权',
                                          {
                                            'available': true,
                                            'configured': false,
                                          } =>
                                            'ChatGPT 未授权',
                                          {'error': String error} => error,
                                          _ => 'ChatGPT 授权状态不可用',
                                        }
                                      : provider['credentialConfigured'] == true
                                      ? 'API Key 已设置'
                                      : 'API Key 未设置或使用其他登录方式',
                                  if ((provider['baseURL'] as String? ?? '')
                                      .isNotEmpty)
                                    provider['baseURL'] as String,
                                  if (provider['id'] == 'openai-codex' &&
                                      (provider['keyRef'] as String? ?? '')
                                          .isNotEmpty)
                                    '当前 API Key 配置会覆盖 ChatGPT 授权',
                                  (provider['models'] as List? ?? []).isEmpty
                                      ? '使用提供商默认模型目录'
                                      : '模型：${(provider['models'] as List).join('、')}',
                                ].join('\n'),
                              ),
                              isThreeLine: true,
                              trailing: Wrap(
                                spacing: 4,
                                children: [
                                  if (provider['account'] != true)
                                    TextButton(
                                      onPressed: writable
                                          ? () => unawaited(edit(provider))
                                          : null,
                                      child: const Text('编辑'),
                                    ),
                                  if (provider['removable'] == true)
                                    TextButton(
                                      onPressed: writable
                                          ? () => unawaited(remove(provider))
                                          : null,
                                      child: const Text('移除'),
                                    ),
                                ],
                              ),
                            ),
                            if (provider['id'] == 'openai-codex' &&
                                provider['oauth'] is Map &&
                                (provider['oauth'] as Map)['available'] == true)
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: Wrap(
                                    spacing: 4,
                                    children: [
                                      TextButton(
                                        onPressed: writable
                                            ? () => unawaited(loginCodex())
                                            : null,
                                        child: const Text('添加认证'),
                                      ),
                                      TextButton(
                                        onPressed: writable
                                            ? () => unawaited(importCodex())
                                            : null,
                                        child: const Text('导入本地认证'),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            if (provider['id'] == 'openai-codex' &&
                                provider['oauth'] is Map)
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 16),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: Text('一次使用一份认证，切换主要影响后续请求。'),
                                ),
                              ),
                            if (provider['id'] == 'openai-codex' &&
                                provider['oauth'] is Map)
                              for (final raw
                                  in ((provider['oauth'] as Map)['accounts']
                                          as List? ??
                                      []))
                                Builder(
                                  builder: (context) {
                                    final account = objectValue(raw);
                                    return ListTile(
                                      title: Text(
                                        account['name'] as String? ??
                                            'Codex 认证',
                                      ),
                                      subtitle: Text(
                                        account['active'] == true
                                            ? '当前使用'
                                            : '已保存',
                                      ),
                                      trailing: Wrap(
                                        children: [
                                          if (account['active'] != true)
                                            TextButton(
                                              onPressed: writable
                                                  ? () => unawaited(
                                                      run(
                                                        () => model
                                                            .updateModelSettings({
                                                              'type': 'codex-select',
                                                              'id':
                                                                  account['id'],
                                                            }),
                                                      ),
                                                    )
                                                  : null,
                                              child: const Text('使用'),
                                            ),
                                          if (account['active'] != true)
                                            TextButton(
                                              onPressed: writable
                                                  ? () => unawaited(
                                                      removeCodex(account),
                                                    )
                                                  : null,
                                              child: const Text('移除'),
                                            ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _CodexAuthorizationDialog extends StatefulWidget {
  const _CodexAuthorizationDialog({
    required this.model,
    required this.defaultName,
  });
  final LauncherController model;
  final String defaultName;

  @override
  State<_CodexAuthorizationDialog> createState() =>
      _CodexAuthorizationDialogState();
}

class _CodexAuthorizationDialogState extends State<_CodexAuthorizationDialog> {
  final _redirect = TextEditingController();
  late final _name = TextEditingController(text: widget.defaultName);
  Process? _process;
  String _message = '给这份认证起个名字，选择登录方式。';
  String? _error, _authorizationUrl, _deviceCode;
  bool _manual = false, _finished = false, _started = false;

  @override
  void dispose() {
    _redirect.clear();
    _redirect.dispose();
    _name.dispose();
    final process = _process;
    if (process != null) unawaited(process.stdin.close());
    super.dispose();
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host != 'auth.openai.com' ||
        (uri.hasPort && uri.port != 443) ||
        !['/oauth/authorize', '/codex/device'].contains(uri.path) ||
        uri.userInfo.isNotEmpty) {
      throw StateError('授权地址无效。');
    }
    await widget.model.native.openUrl(url);
  }

  Future<void> _start(String method) async {
    final name = _name.text.trim();
    if (name.isEmpty || name.length > 80) {
      setState(() => _error = '请填写不超过 80 字的认证名称。');
      return;
    }
    setState(() {
      _started = true;
      _error = null;
      _message = '正在准备 ChatGPT 授权…';
    });
    try {
      final process = await widget.model.startCodexAuthorization(
        method: method,
        name: name,
      );
      if (!mounted) {
        await process.stdin.close();
        return;
      }
      _process = process;
      unawaited(process.stderr.drain<void>());
      await for (final line
          in process.stdout
              .transform(utf8.decoder)
              .transform(const LineSplitter())) {
        final event = objectValue(jsonDecode(line));
        if (!mounted || _process != process) continue;
        switch (event['type']) {
          case 'open':
            final url = event['url'];
            if (url is! String) {
              throw const FormatException('Missing authorization URL');
            }
            setState(() {
              _authorizationUrl = url;
              _message = '请在浏览器中登录并授权 ChatGPT。';
            });
            try {
              await _open(url);
            } catch (_) {
              if (mounted) setState(() => _error = '无法打开浏览器，请点击下方按钮重试。');
            }
          case 'device':
            final url = event['url'], code = event['code'];
            if (url is! String ||
                code is! String ||
                !RegExp(r'^[A-Z0-9-]{4,32}$').hasMatch(code)) {
              throw const FormatException('Invalid device authorization');
            }
            setState(() {
              _authorizationUrl = url;
              _deviceCode = code;
              _message = '请在浏览器中输入下面的设备码并完成授权。';
            });
            try {
              await _open(url);
            } catch (_) {
              if (mounted) setState(() => _error = '无法打开浏览器，请点击下方按钮重试。');
            }
          case 'prompt':
            setState(() => _manual = true);
          case 'prompt-withdrawn':
            _redirect.clear();
            setState(() => _manual = false);
          case 'authorized':
            setState(() {
              _finished = true;
              _manual = false;
              _error = null;
              _message = 'ChatGPT 授权已保存。';
            });
            try {
              await widget.model.refreshModelSettings();
            } catch (_) {
              if (mounted) {
                setState(() => _message = 'ChatGPT 授权已保存，请刷新模型配置查看状态。');
              }
            }
          case 'cancelled':
            setState(() {
              _finished = true;
              _manual = false;
              _message = '已取消授权。';
            });
          case 'error':
            setState(() {
              _finished = true;
              _manual = false;
              _error = event['reason'] == 'device-unavailable'
                  ? '设备码登录不可用，请改用浏览器登录或检查账号设置。'
                  : 'Codex 登录失败，请检查网络和授权后重试。';
            });
        }
      }
      final code = await process.exitCode;
      if (mounted && _process == process && !_finished) {
        setState(() {
          _finished = true;
          _error = code == 0 ? '授权未完成。' : 'Codex 登录失败，请检查网络和授权后重试。';
        });
      }
      if (_process == process) _process = null;
    } catch (_) {
      final process = _process;
      _process = null;
      if (process != null) await process.stdin.close();
      if (mounted) {
        setState(() {
          _finished = true;
          _error = '无法启动 Codex 授权，请检查 DSH 服务后重试。';
        });
      }
    }
  }

  void _submitRedirect() {
    final value = _redirect.text.trim();
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'http' ||
        !['localhost', '127.0.0.1'].contains(uri.host) ||
        uri.port != 1455 ||
        uri.path != '/auth/callback' ||
        !uri.queryParameters.containsKey('code') ||
        !uri.queryParameters.containsKey('state')) {
      setState(() => _error = '请粘贴浏览器地址栏中的完整回调地址。');
      return;
    }
    _process?.stdin.writeln(jsonEncode({'type': 'answer', 'value': value}));
    _redirect.clear();
    setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('登录 ChatGPT'),
    content: SizedBox(
      width: 480,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_message),
            if (!_started) ...[
              TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: '认证名称'),
              ),
              Wrap(
                spacing: 8,
                children: [
                  FilledButton(
                    onPressed: () => unawaited(_start('browser')),
                    child: const Text('浏览器登录'),
                  ),
                  OutlinedButton(
                    onPressed: () => unawaited(_start('device')),
                    child: const Text('设备码登录'),
                  ),
                ],
              ),
            ],
            if (_deviceCode != null && !_finished) ...[
              SelectableText(
                _deviceCode!,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              TextButton(
                onPressed: () =>
                    Clipboard.setData(ClipboardData(text: _deviceCode!)),
                child: const Text('复制设备码'),
              ),
            ],
            if (_authorizationUrl != null && !_finished)
              TextButton(
                onPressed: () async {
                  try {
                    await _open(_authorizationUrl!);
                  } catch (_) {
                    if (mounted) setState(() => _error = '无法打开浏览器。');
                  }
                },
                child: const Text('重新打开授权页面'),
              ),
            if (_manual && !_finished) ...[
              const Text('如果浏览器回调无法连接，请粘贴地址栏中的完整回调地址。'),
              TextField(
                controller: _redirect,
                obscureText: true,
                decoration: const InputDecoration(labelText: '回调地址'),
              ),
              TextButton(onPressed: _submitRedirect, child: const Text('提交地址')),
            ],
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
        onPressed: () => Navigator.pop(context),
        child: Text(_finished ? '关闭' : '取消'),
      ),
    ],
  );
}

class _ProviderEditor extends StatefulWidget {
  const _ProviderEditor({required this.model, required this.provider});
  final LauncherController model;
  final Map<String, Object?>? provider;

  @override
  State<_ProviderEditor> createState() => _ProviderEditorState();
}

class _ProviderEditorState extends State<_ProviderEditor> {
  late final TextEditingController id, name, base, models, key;
  String protocol = '', selectedProvider = '';
  bool saving = false;
  String? failure;
  String? discoveryMessage;
  bool get isNew => widget.provider == null;

  @override
  void initState() {
    super.initState();
    final provider = widget.provider ?? {};
    id = TextEditingController(text: provider['id'] as String? ?? '');
    name = TextEditingController(
      text: provider['configuredDisplayName'] as String? ?? '',
    );
    base = TextEditingController(text: provider['baseURL'] as String? ?? '');
    models = TextEditingController(
      text: (provider['models'] as List? ?? []).join('\n'),
    );
    key = TextEditingController();
    protocol = provider['api'] as String? ?? '';
  }

  @override
  void dispose() {
    id.dispose();
    name.dispose();
    base.dispose();
    models.dispose();
    key.clear();
    key.dispose();
    super.dispose();
  }

  Future<void> save() async {
    setState(() {
      saving = true;
      failure = null;
    });
    try {
      final snapshot = widget.model.modelSettings!;
      final providers = (snapshot['providers'] as List).map(objectValue);
      final revision = isNew
          ? providers.firstWhere(
              (row) => row['namespace'] == 'llm-pi-ai',
              orElse: () => {'revision': snapshot['piRevision']},
            )['revision']
          : widget.provider!['revision'];
      await widget.model.updateModelSettings({
        'type': 'save',
        'id': id.text.trim(),
        'revision': revision,
        'displayName': name.text,
        'api': protocol,
        'baseURL': base.text,
        'models': models.text
            .split('\n')
            .map((line) => line.trim())
            .where((line) => line.isNotEmpty)
            .toList(),
        'key': key.text,
        'isNew': isNew,
      });
      key.clear();
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(
          () => failure = error is StateError ? error.message : '模型配置保存失败。',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> discover() async {
    setState(() {
      saving = true;
      failure = null;
      discoveryMessage = null;
    });
    try {
      final found = await widget.model.discoverModelSettings({
        'type': 'discover',
        'id': id.text.trim(),
        'api': protocol,
        'baseURL': base.text,
        'key': key.text,
      });
      final all = <String>{
        ...models.text
            .split('\n')
            .map((line) => line.trim())
            .where((line) => line.isNotEmpty),
        ...found,
      };
      models.text = all.join('\n');
      if (mounted) {
        setState(() => discoveryMessage = '获取到 ${found.length} 个模型。');
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => failure = error is StateError ? error.message : '模型列表获取失败。',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final known =
        (widget.model.modelSettings?['availableProviders'] as List? ?? [])
            .map(objectValue)
            .toList();
    final existing = (widget.model.modelSettings?['providers'] as List? ?? [])
        .map(objectValue)
        .map((row) => row['id'])
        .toSet();
    final available = known
        .where((row) => !existing.contains(row['id']))
        .toList();
    final isDeepSeek = id.text == 'deepseek-official';
    return AlertDialog(
      title: Text(isNew ? '添加模型提供商' : '编辑模型提供商'),
      content: SizedBox(
        width: 620,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (isNew)
                DropdownButtonFormField<String>(
                  initialValue: selectedProvider,
                  decoration: const InputDecoration(labelText: '选择已有提供商或自定义'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('自定义提供商')),
                    ...available.map(
                      (row) => DropdownMenuItem(
                        value: row['id'] as String,
                        child: Text(row['displayName'] as String),
                      ),
                    ),
                  ],
                  onChanged: saving
                      ? null
                      : (value) => setState(() {
                          selectedProvider = value ?? '';
                          id.text = selectedProvider;
                        }),
                ),
              TextField(
                controller: id,
                readOnly: !isNew,
                enabled: !saving,
                decoration: const InputDecoration(
                  labelText: '提供商 ID',
                  helperText: '小写字母、数字和连字符，例如 my-provider',
                ),
              ),
              if (!isDeepSeek)
                TextField(
                  controller: name,
                  enabled: !saving,
                  decoration: const InputDecoration(labelText: '显示名称（可选）'),
                ),
              TextField(
                controller: base,
                enabled: !saving,
                decoration: const InputDecoration(
                  labelText: 'API 地址（可选）',
                  hintText: 'https://example.com/v1',
                ),
              ),
              if (!isDeepSeek)
                DropdownButtonFormField<String>(
                  initialValue: protocol,
                  decoration: const InputDecoration(labelText: 'API 协议'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('使用提供商默认协议')),
                    const DropdownMenuItem(
                      value: 'openai-completions',
                      child: Text('OpenAI Chat Completions'),
                    ),
                    const DropdownMenuItem(
                      value: 'openai-responses',
                      child: Text('OpenAI Responses'),
                    ),
                    const DropdownMenuItem(
                      value: 'anthropic-messages',
                      child: Text('Anthropic Messages'),
                    ),
                    if (protocol.isNotEmpty &&
                        ![
                          'openai-completions',
                          'openai-responses',
                          'anthropic-messages',
                        ].contains(protocol))
                      DropdownMenuItem(
                        value: protocol,
                        child: Text('当前协议：$protocol'),
                      ),
                  ],
                  onChanged: saving
                      ? null
                      : (value) => setState(() => protocol = value ?? ''),
                ),
              TextField(
                controller: models,
                enabled: !saving,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: '模型 ID（每行一个）',
                  helperText: '留空时使用提供商默认模型目录',
                ),
              ),
              TextField(
                controller: key,
                enabled: !saving,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  labelText: 'API Key',
                  helperText: isNew ? '可留空使用其他认证方式' : '留空保留现有凭据',
                ),
              ),
              OutlinedButton(
                onPressed: saving ? null : () => unawaited(discover()),
                child: const Text('获取可用模型'),
              ),
              if (discoveryMessage != null) Text(discoveryMessage!),
              const SizedBox(height: 10),
              const Text('自定义提供商需要填写 API 地址、协议和至少一个模型 ID。'),
              if (failure != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    failure!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: saving ? null : () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: saving ? null : () => unawaited(save()),
          child: Text(saving ? '保存中…' : '保存'),
        ),
      ],
    );
  }
}
