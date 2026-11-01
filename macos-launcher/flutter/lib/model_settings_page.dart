import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

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
                        child: ListTile(
                          title: Text(
                            '${provider['displayName']}  ·  ${provider['id']}',
                          ),
                          subtitle: Text(
                            [
                              provider['account'] == true
                                  ? '使用已登录的 DeepSeek 账号'
                                  : provider['credentialConfigured'] == true
                                  ? 'API Key 已设置'
                                  : 'API Key 未设置或使用其他登录方式',
                              if ((provider['baseURL'] as String? ?? '')
                                  .isNotEmpty)
                                provider['baseURL'] as String,
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
                      ),
                  ],
                ),
        ),
      ],
    );
  }
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
