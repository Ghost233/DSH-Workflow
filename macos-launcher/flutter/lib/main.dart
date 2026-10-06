import 'dart:async';
import 'dart:developer' as developer;
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'application_probe.dart';
import 'launcher_controller.dart';
import 'lifecycle_probe_process.dart';
import 'maclauncher_integration.dart';
import 'native_bridge.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final native = NativeBridge();
  late final LauncherController model;
  model = LauncherController(
    native,
    startProcess: kDebugMode
        ? (executable, arguments, {workingDirectory, environment}) =>
              startLifecycleProbeProcess(
                executable, arguments,
                workingDirectory: workingDirectory,
                environment: environment,
                isolated: model.environment.testSocket != null,
                dataRoot: model.environment.dataRoot,
              )
        : null,
  );
  await model.initialize();
  final integration = MacLauncherIntegration(
    model,
    socketPath: kDebugMode ? model.environment.testSocket : null,
  );
  if (kDebugMode) {
    developer.registerExtension('ext.dshlauncher.nativeState', (_, _) async {
      final state = await native.channel.invokeMapMethod<String, Object?>(
        'debugState',
      );
      return developer.ServiceExtensionResponse.result(jsonEncode(state));
    });
  }
  integration.onConnectionChanged = (status) => model.setSdkMessage(
    status.reason == null
        ? status.state.name
        : '${status.state.name}：${status.reason}',
  );
  native.channel.setMethodCallHandler((call) async {
    switch (call.method) {
      case 'quitRequested':
        await integration.close();
        await model.close();
        await native.finishQuit();
      case 'openGlobal':
        await model.openDsh();
        await model.startWeb();
    }
  });
  if (kDebugMode && model.environment.testSocket != null) {
    registerApplicationProbe(native);
  }
  runApp(LauncherApp(controller: model));
  if (model.hasPassword) {
    unawaited(model.startWeb().catchError(model.reportError));
  }
  unawaited(model.checkUpdates());
  unawaited(model.checkPlugins());
}

class LauncherApp extends StatelessWidget {
  const LauncherApp({super.key, required this.controller});
  final LauncherController controller;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'DSH Workflow',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff475569)),
    ),
    darkTheme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff94a3b8),
        brightness: Brightness.dark,
      ),
    ),
    home: LauncherPage(controller: controller),
  );
}

class LauncherPage extends StatefulWidget {
  const LauncherPage({super.key, required this.controller});
  final LauncherController controller;
  @override
  State<LauncherPage> createState() => _LauncherPageState();
}

class _LauncherPageState extends State<LauncherPage> {
  int _page = 0;
  final _password = TextEditingController();
  LauncherController get model => widget.controller;
  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _act(Future<void> Function() action) async {
    try {
      await action();
    } catch (failure) {
      model.reportError(failure);
    }
  }

  Widget _button(
    String title,
    Future<void> Function() action, {
    bool enabled = true,
  }) => OutlinedButton(
    onPressed: enabled ? () => unawaited(_act(action)) : null,
    child: Text(title),
  );
  Widget _section(String title, List<Widget> children) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          ...children.map(
            (item) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: item,
            ),
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: model,
    builder: (context, _) => Scaffold(
      appBar: AppBar(
        title: const Text('DSH Workflow'),
        actions: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Tooltip(
              message: 'MacLauncher：${model.sdkMessage}',
              child: SizedBox(
                width: 300,
                child: Text(
                  'MacLauncher：${model.sdkMessage}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                ),
              ),
            ),
          ),
        ],
      ),
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _page,
            labelType: NavigationRailLabelType.all,
            onDestinationSelected: (value) => setState(() => _page = value),
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.desktop_mac),
                label: Text('管理'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.extension_outlined),
                label: Text('插件'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.receipt_long),
                label: Text('日志'),
              ),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: switch (_page) {
                1 => _plugins(),
                2 => _logs(),
                _ => _overview(),
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: model.error.isEmpty
          ? null
          : Material(
              color: Theme.of(context).colorScheme.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: SelectableText(model.error),
              ),
            ),
    ),
  );

  Widget _overview() => ListView(
    children: [
      _section('全局实例 · 官方桌面版', [
        Text('应用版本 ${model.environment.appVersion}'),
        Text('Web 访问：${_stateName(model.snapshot.state)}'),
        const Text('桌面版持有后端，Web 连接同一实例。项目目录在 DSH 内选择。'),
        FilledButton(
          onPressed: () => unawaited(_act(model.openDsh)),
          child: const Text('打开 DSH'),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _button('启动 Web', model.startWeb, enabled: !model.isActive),
            _button('停止 Web', model.stopWeb, enabled: model.isActive),
            _button('重连 Web', model.restartWeb, enabled: model.isActive),
            _button(
              '打开 Web 入口',
              () => model.native.openUrl(model.webUrl.toString()),
              enabled: model.webUrl != null,
            ),
          ],
        ),
      ]),
      _section('访问与权限', [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('DSH 工具使用完整访问权限'),
          subtitle: const Text('更改后须完全退出并重新打开 Desktop。'),
          value: model.fullAccess,
          onChanged: (value) => unawaited(
            _act(() => model.savePreferences(value, model.allowLanSettings)),
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('允许局域网修改 DSH 设置'),
          subtitle: const Text('已认证客户端可修改模型 API Key 等设置；重连 Web 后生效。'),
          value: model.allowLanSettings,
          onChanged: (value) => unawaited(
            _act(() => model.savePreferences(model.fullAccess, value)),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: '内网访问密码',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 12),
            _button(model.hasPassword ? '修改密码' : '设置密码', () async {
              await model.savePassword(_password.text);
              _password.clear();
            }),
          ],
        ),
        const Text('监听所有 IPv4 网卡，端口 33080。密码存储位置沿用现有应用。'),
        if (model.webUrl != null) SelectableText('本机入口：${model.webUrl}'),
        for (final url in model.lanUrls) SelectableText('内网入口：$url'),
      ]),
      _section('通用', [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('登录后启动应用'),
          subtitle: Text(switch (model.loginStatus) {
            'notRegistered' => '登录启动：未注册',
            'enabled' => '登录启动：已启用',
            'requiresApproval' => '登录启动：需要系统批准。请在系统设置的登录项中允许启动。',
            'notFound' => '登录启动：系统未找到此应用',
            'unsupported' => '登录启动：系统不支持（需要 macOS 13 或更新版本）',
            'unavailableInTest' => '登录启动：测试环境不访问系统登录项',
            _ => '登录启动：无法确认系统状态',
          }),
          value:
              model.loginStatus == 'enabled' ||
              model.loginStatus == 'requiresApproval',
          onChanged: (value) =>
              unawaited(_act(() => model.setLoginEnabled(value))),
        ),
        _button('刷新登录项状态', model.refreshLoginStatus),
        Text(model.updateMessage),
        Wrap(
          spacing: 8,
          children: [
            _button(
              '检查更新',
              model.checkUpdates,
              enabled: !model.checkingUpdates,
            ),
            if (model.update != null)
              _button(
                '查看新版本',
                () => model.native.openUrl(model.update!.page.toString()),
              ),
          ],
        ),
      ]),
    ],
  );

  Widget _plugins() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Wrap(
        spacing: 8,
        children: [
          _button(
            '检查插件版本',
            model.checkPlugins,
            enabled: !model.checkingPlugins && !model.updatingPlugins,
          ),
          _button(
            '更新全部可更新插件',
            () => model.updatePlugins([]),
            enabled:
                !model.checkingPlugins &&
                !model.updatingPlugins &&
                model.plugins.any((row) => row.updatable),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Text(model.pluginMessage),
      if (model.pluginUpdateMessage.isNotEmpty) Text(model.pluginUpdateMessage),
      if (model.pluginsNeedReload)
        const Text('插件已更新。完全退出并重新打开 Desktop 后加载新版本。'),
      const SizedBox(height: 12),
      Expanded(
        child: SingleChildScrollView(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columns: const [
                DataColumn(label: Text('插件 / 来源')),
                DataColumn(label: Text('当前 / 最新')),
                DataColumn(label: Text('DSH 兼容声明')),
                DataColumn(label: Text('状态')),
                DataColumn(label: Text('操作')),
              ],
              rows: model.plugins
                  .map(
                    (row) => DataRow(
                      cells: [
                        DataCell(
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(row.name),
                              Text(
                                row.source,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                        DataCell(
                          Text('${row.current ?? '未知'} / ${row.latest ?? '—'}'),
                        ),
                        DataCell(
                          Text(
                            '${row.supportedDsh ?? '未声明'}\n最新支持：${row.latestSupportedDsh ?? '未声明'}',
                          ),
                        ),
                        DataCell(
                          Tooltip(
                            message: row.note ?? '',
                            child: Text(_pluginState(row.status)),
                          ),
                        ),
                        DataCell(
                          _button(
                            '更新',
                            () => model.updatePlugins([row.name]),
                            enabled: row.updatable && !model.updatingPlugins,
                          ),
                        ),
                      ],
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ),
    ],
  );

  Widget _logs() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('Web 业务进程日志', style: Theme.of(context).textTheme.titleLarge),
      const Text('显示原始输出；来源未提供原始时间时不生成时间戳。'),
      Text('日志实例：${model.logInstanceId ?? '未提供'}'),
      Text(model.logsTruncated ? '更早的日志已丢弃' : '已显示当前缓存的全部日志'),
      const SizedBox(height: 12),
      Expanded(
        child: SelectionArea(
          child: ListView.builder(
            itemCount: model.logs.length,
            itemBuilder: (context, index) {
              final entry = model.logs[index];
              return Text(
                '${entry.stream.name}  ${entry.text}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              );
            },
          ),
        ),
      ),
    ],
  );
}

String _stateName(ServiceState state) => switch (state) {
  ServiceState.running => '已就绪',
  ServiceState.starting => '正在连接',
  ServiceState.stopping => '正在停止',
  ServiceState.failed => '异常退出',
  ServiceState.unknown => '状态未知',
  ServiceState.stopped => '已停止',
};

String _pluginState(String state) => switch (state) {
  'newer' => '有新版本',
  'current' => '已是最新',
  'ahead' => '高于 latest',
  'bundled' => '随 App 更新',
  'coupled' => '随 DSH 更新',
  'local' => '本地依赖',
  'error' => '检查失败',
  'unsupported' => '不支持查询',
  _ => '无法确认',
};
