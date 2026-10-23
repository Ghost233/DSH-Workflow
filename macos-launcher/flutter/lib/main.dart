import 'dart:async';
import 'dart:developer' as developer;
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:maclauncher_sdk/maclauncher_sdk.dart';

import 'application_probe.dart';
import 'launcher_controller.dart';
import 'lifecycle_probe_process.dart';
import 'maclauncher_integration.dart';
import 'native_bridge.dart';
import 'service_stop.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final native = NativeBridge();
  late final LauncherController model;
  model = LauncherController(
    native,
    startProcess: kDebugMode
        ? (executable, arguments, {workingDirectory, environment}) =>
              startLifecycleProbeProcess(
                executable,
                arguments,
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
  late final Future<void> serviceStartup;
  native.channel.setMethodCallHandler((call) async {
    switch (call.method) {
      case 'quitRequested':
        final traceEnabled =
            kDebugMode &&
            (Platform.environment['GITHUB_ACTIONS'] == 'true' ||
                Platform.environment['DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT'] !=
                    null) &&
            model.environment.testSocket != null &&
            call.arguments is Map &&
            (call.arguments as Map)['ownQuitTraceEnabled'] == true;
        if (traceEnabled) {
          stderr.writeln('OWN_QUIT_TRACE phase=dart-received');
        }
        var stage = 'integration-close';
        try {
          await integration.close();
          if (traceEnabled) {
            stderr.writeln('OWN_QUIT_TRACE phase=integration-done');
          }
          stage = 'model-close';
          await model.close();
          if (traceEnabled) {
            stderr.writeln('OWN_QUIT_TRACE phase=model-done');
          }
          stage = 'finish-quit';
          if (traceEnabled) {
            stderr.writeln('OWN_QUIT_TRACE phase=finish-called');
          }
          await native.finishQuit();
        } catch (error) {
          if (traceEnabled) {
            stderr.writeln(
              'OWN_QUIT_ERROR stage=$stage errorType=${error.runtimeType}',
            );
          }
          rethrow;
        }
      case 'openGlobal':
        await serviceStartup;
        await model.startWeb();
      case 'windowShown':
        await model.refreshWindowStatus();
    }
  });
  if (kDebugMode && model.environment.testSocket != null) {
    registerApplicationProbe(native);
  }
  runApp(LauncherApp(controller: model));
  serviceStartup = model.startService().catchError(model.reportError);
  unawaited(model.checkUpdates());
  unawaited(model.checkPlugins());
}

class LauncherApp extends StatelessWidget {
  const LauncherApp({super.key, required this.controller});
  final LauncherController controller;
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Ghost DSH Station',
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
  late final AppLifecycleListener _lifecycle;
  LauncherController get model => widget.controller;
  @override
  void initState() {
    super.initState();
    model.confirmServiceStop = _confirmServiceStop;
    _lifecycle = AppLifecycleListener(onStateChange: _windowStateChanged);
    final state = WidgetsBinding.instance.lifecycleState;
    if (state != null) _windowStateChanged(state);
  }

  void _windowStateChanged(AppLifecycleState state) => model.setWindowVisible(
    state == AppLifecycleState.resumed || state == AppLifecycleState.inactive,
  );

  Future<bool> _confirmServiceStop(ServiceStopInspection inspection) async {
    await model.showWindow();
    if (!mounted) return false;
    final verb = inspection.action == 'restart' ? '重启' : '停止';
    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: Text('$verb DSH 服务'),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('实例：${inspection.instanceId}'),
                  Text('$verb会中断列出的未完成工作及其继续产生的工作。取消后继续使用原实例。'),
                  if (inspection.unknown) const Text('任务状态未知，可能仍有未完成工作。'),
                  if (inspection.message != null) Text(inspection.message!),
                  for (final work in inspection.work)
                    Text('• ${work['label']}（${work['id']}）'),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('取消'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: Text('确认$verb'),
              ),
            ],
          ),
        ) ??
        false;
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    model.setWindowVisible(false);
    if (model.confirmServiceStop == _confirmServiceStop) {
      model.confirmServiceStop = null;
    }
    _password.dispose();
    super.dispose();
  }

  Future<void> _act(Future<void> Function() action) async {
    model.clearError();
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
        title: const Text('Ghost DSH Station'),
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
      _section('DSH 服务', [
        Text(
          'DSH 服务：${model.serviceSnapshot.state == ServiceState.running && model.serviceSnapshot.ready != true ? '运行中，尚未就绪' : _stateName(model.serviceSnapshot.state)}',
        ),
        Text('服务实例：${model.serviceSnapshot.instanceId ?? '尚未启动'}'),
        if (model.serviceSnapshot.message?.isNotEmpty == true)
          SelectableText(model.serviceSnapshot.message!),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _button(
              '启动 DSH 服务',
              model.startService,
              enabled: model.serviceSnapshot.state != ServiceState.starting,
            ),
            _button('停止 DSH 服务', model.stopService),
            _button('重启 DSH 服务', model.restartService),
            _button('刷新服务状态', () async {
              await model.serviceStatus();
            }),
          ],
        ),
        const Text('关闭启动器后，已启动的 DSH 服务继续运行。'),
        SelectableText(model.notificationMessage),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _button(
              '启用故障通知',
              model.authorizeServiceNotifications,
              enabled: !model.requestingNotificationAuthorization,
            ),
            _button('刷新通知状态', model.refreshServiceNotificationStatus),
          ],
        ),
      ]),
      _section('客户端入口', [
        Text('应用版本 ${model.environment.appVersion}'),
        Text('Web 访问：${_stateName(model.snapshot.state)}'),
        const Text('项目目录在 DSH 内选择。'),
        Text('桌面版', style: Theme.of(context).textTheme.titleMedium),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton(
              onPressed: () => unawaited(_act(model.openDsh)),
              child: const Text('打开桌面版'),
            ),
            _button('后台启动', model.startDesktopInBackground),
            _button('启动后显示', model.openDsh),
            _button('隐藏窗口', model.hideDesktop),
            _button('仅显示已运行窗口', model.showExistingDesktop),
          ],
        ),
        const Divider(),
        Text('Web', style: Theme.of(context).textTheme.titleMedium),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton(
              onPressed: model.webUrl == null
                  ? null
                  : () => unawaited(
                      _act(() => model.native.openUrl(model.webUrl.toString())),
                    ),
              child: const Text('打开 Web'),
            ),
            _button('启动 Web', model.startWeb, enabled: !model.isActive),
            _button('停止 Web', model.stopWeb, enabled: model.isActive),
            _button('重连 Web', model.restartWeb, enabled: model.isActive),
          ],
        ),
      ]),
      _section('访问与权限', [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('启动时隐藏窗口'),
          subtitle: const Text('常规与登录启动时隐藏新启动的 Desktop；已有窗口保持当前状态。'),
          value: model.hideWindowOnStart,
          onChanged: (value) => unawaited(
            _act(
              () => model.savePreferences(
                model.fullAccess,
                model.allowLanSettings,
                hideWindowOnStart: value,
              ),
            ),
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('DSH 工具使用完整访问权限'),
          subtitle: const Text('下次启动 DSH 服务时生效。'),
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
            enabled: !model.checkingPlugins,
          ),
        ],
      ),
      const SizedBox(height: 12),
      Text(model.pluginMessage),
      const Text(
        '组件随本仓库正式 DMG 统一更新；插件版本来自本地文件。Browser Harness 安装状态由运行中的 DSH 查询，不代表浏览器已连接。',
      ),
      const SizedBox(height: 12),
      Expanded(
        child: SingleChildScrollView(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columns: const [
                DataColumn(label: Text('插件 / 来源')),
                DataColumn(label: Text('实际 / 仓库固定')),
                DataColumn(label: Text('DSH 兼容声明')),
                DataColumn(label: Text('状态')),
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
                          Text(
                            '${row.current ?? '未知'} / ${row.expected ?? '未固定'}',
                          ),
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
      Text('DSH 服务日志', style: Theme.of(context).textTheme.titleLarge),
      Text('服务实例：${model.serviceSnapshot.instanceId ?? '尚未启动'}'),
      _button('刷新服务日志', () async {
        await model.serviceLogs(LogQuery(limit: 500));
      }),
      const Text('显示原始输出；来源未提供原始时间时不生成时间戳。'),
      const SizedBox(height: 12),
      Expanded(
        child: SelectionArea(
          child: ListView.builder(
            itemCount: model.serviceLogEntries.length + model.logs.length + 1,
            itemBuilder: (context, index) {
              if (index == model.serviceLogEntries.length) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Web 业务进程日志',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text('日志实例：${model.logInstanceId ?? '未提供'}'),
                      Text(model.logsTruncated ? '更早的日志已丢弃' : '已显示当前缓存的全部日志'),
                    ],
                  ),
                );
              }
              final service = index < model.serviceLogEntries.length;
              final entry = service
                  ? model.serviceLogEntries[index]
                  : model.logs[index - model.serviceLogEntries.length - 1];
              return Text(
                '${service ? 'DSH' : entry.stream.name}  ${entry.text}',
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
  'fixed' => '符合仓库固定值',
  'expected' => '仓库固定快照',
  'drift' => '版本偏差',
  'unknown' => '未能核验',
  'untracked' => '仓库未固定',
  'bundled' => '随 App 更新',
  'coupled' => '随 DSH 更新',
  'local' => '本地依赖',
  'error' => '检查失败',
  'unsupported' => '不支持查询',
  'installed' => '已安装',
  'missing' => 'DSH 未找到安装',
  _ => '无法确认',
};
