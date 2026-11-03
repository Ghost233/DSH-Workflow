import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'launcher_controller.dart';

class SuperagentProjectWizard extends StatefulWidget {
  const SuperagentProjectWizard({super.key, required this.model, this.project});
  final LauncherController model;
  final Map<String, Object?>? project;

  @override
  State<SuperagentProjectWizard> createState() =>
      _SuperagentProjectWizardState();
}

class _SuperagentProjectWizardState extends State<SuperagentProjectWizard> {
  final _search = TextEditingController();
  int _step = 0, _generation = 0;
  bool _loading = false,
      _saving = false,
      _scanning = false,
      _loadedBots = false;
  String? _error, _directory, _branch, _chatId, _memberId, _qrUrl;
  Uint8List? _qr;
  Map<String, Object?>? _account, _repo, _githubUser, _bot;
  List<Map<String, Object?>> _repos = [],
      _bots = [],
      _chats = [],
      _members = [];
  List<String> _branches = [];
  Process? _registration;
  late final TextEditingController _rule;
  late bool _managePolicy;
  bool _ruleEdited = false;
  String _listen = 'mentions', _acceptMode = 'observe';
  Map<String, Object?>? _feishuCheck;

  bool _sameAccount(Map<String, Object?>? a, Map<String, Object?> b) =>
      a != null && a['login'] == b['login'] && a['directory'] == b['directory'];

  bool get _needsGuided =>
      widget.project == null ||
      ((widget.project?['executionRoot'] ?? '') == '' &&
          (widget.project?['prepare'] ?? '') == '');

  List<Map<String, Object?>> get _accounts {
    final accounts = [...widget.model.superagentGithubAccounts];
    final project = widget.project;
    final login = project?['githubLogin'], directory = project?['ghConfigDir'];
    if (login is String &&
        login.isNotEmpty &&
        directory is String &&
        directory.isNotEmpty &&
        !accounts.any(
          (row) => row['login'] == login && row['directory'] == directory,
        )) {
      accounts.add({'login': login, 'directory': directory});
    }
    return accounts;
  }

  @override
  void initState() {
    super.initState();
    final project = widget.project;
    _managePolicy = project == null || project['policyManaged'] == true;
    _listen = project?['feishuListen'] as String? ?? 'mentions';
    _acceptMode = project?['acceptMode'] as String? ?? 'observe';
    final rules = project?['acceptRules'] as List?;
    _rule = TextEditingController(
      text: rules?.isNotEmpty == true
          ? objectValue(rules!.first)['instruction'] as String? ?? ''
          : '发现本项目的明确 Bug 时，尝试复现和修复。仅处理有具体症状、证据或复现线索的小范围问题；忽略闲聊、模糊建议及与项目无关的消息。',
    );
    if (project != null) {
      final accounts = _accounts.where(
        (row) =>
            row['login'] == project['githubLogin'] &&
            row['directory'] == project['ghConfigDir'],
      );
      if (accounts.isNotEmpty) _account = accounts.first;
      _directory = (project['localProjectDir'] as String?)?.isNotEmpty == true
          ? project['localProjectDir'] as String
          : null;
      _branch = (project['baseBranch'] as String?)?.isNotEmpty == true
          ? project['baseBranch'] as String
          : null;
      _chatId = project['feishuChatId'] as String?;
      _memberId = project['feishuAllowedId'] as String?;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _rule.dispose();
    final process = _registration;
    if (process != null) unawaited(process.stdin.close());
    super.dispose();
  }

  List<Map<String, Object?>> _rows(Object? value) =>
      value is List ? value.map(objectValue).toList() : [];

  Future<void> _loadRepositories() async {
    final account = _account;
    if (account == null) return;
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await widget.model.superagentOnboarding('repositories', {
        'account': account,
        'projectId': widget.project?['id'],
      });
      if (!mounted || generation != _generation) return;
      final rows = _rows(value['repositories']);
      setState(() {
        _githubUser = objectValue(value['user']);
        _repos = rows;
        final selected = widget.project?['repository'];
        if (_repo == null && selected != null) {
          final matches = rows.where((row) => row['name'] == selected);
          if (matches.isNotEmpty) _repo = matches.first;
        }
      });
      if (_repo != null) await _loadBranches();
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadBranches() async {
    final account = _account, repo = _repo;
    if (account == null || repo == null) return;
    final value = await widget.model.superagentOnboarding('branches', {
      'account': account,
      'repository': repo['name'],
      'projectId': widget.project?['id'],
    });
    if (!mounted || _repo != repo) return;
    final branches = (value['branches'] as List? ?? [])
        .whereType<String>()
        .toList();
    setState(() {
      _branches = branches;
      if (!_branches.contains(_branch)) {
        _branch = branches.contains(repo['defaultBranch'])
            ? repo['defaultBranch'] as String
            : null;
      }
    });
  }

  Future<void> _chooseDirectory() async {
    final repo = _repo;
    if (repo == null) return;
    final selected = await widget.model.native.chooseProjectDirectory();
    if (!mounted || selected == null) return;
    if (_needsGuided) {
      setState(() => _directory = selected);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await widget.model.superagentOnboarding('inspect-project', {
        'directory': selected,
        'repository': repo['name'],
      });
      if (mounted && _repo == repo) {
        setState(() => _directory = value['root'] as String);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadBots() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final value = await widget.model.superagentOnboarding('feishu-bots');
      if (!mounted) return;
      setState(() {
        _loadedBots = true;
        _bots = _rows(value['bots']);
        if (value['available'] != true) _error = '飞书连接组件不可用，请检查 Station 安装。';
        final project = widget.project;
        if (_bot == null &&
            project != null &&
            project['feishuConfigDir'] != '') {
          final matches = _bots.where(
            (row) =>
                row['directory'] == project['feishuConfigDir'] &&
                row['ready'] == true &&
                (project['feishuProfile'] == null ||
                    project['feishuProfile'] == '' ||
                    row['profile'] == project['feishuProfile']),
          );
          if (matches.length == 1) _bot = matches.first;
        }
      });
      if (_bot != null) await _loadChats();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadChats() async {
    final bot = _bot;
    if (bot == null) return;
    final value = await widget.model.superagentOnboarding('feishu-chats', {
      'bot': bot,
    });
    if (!mounted || _bot != bot) return;
    final chats = _rows(value['chats']);
    setState(() {
      _chats = chats;
      if (value['truncated'] == true) {
        _error = '飞书返回的群列表不完整，请检查机器人权限。';
      }
      if (!chats.any((row) => row['id'] == _chatId)) {
        _feishuCheck = null;
        _chatId = null;
        _memberId = null;
        _members = [];
      }
    });
    if (_chatId != null) await _loadMembers();
  }

  Future<void> _loadMembers() async {
    final bot = _bot, chat = _chatId;
    if (bot == null || chat == null) return;
    final value = await widget.model.superagentOnboarding('feishu-members', {
      'bot': bot,
      'chatId': chat,
    });
    if (!mounted || _bot != bot || _chatId != chat) return;
    final members = _rows(value['members']);
    setState(() {
      _members = members;
      if (!members.any((row) => row['id'] == _memberId)) _memberId = null;
      if (value['truncated'] == true) _error = '飞书返回的群成员列表不完整，请检查机器人的通讯录权限。';
    });
  }

  Future<void> _selectBot(Map<String, Object?> bot) async {
    setState(() {
      _feishuCheck = null;
      _bot = bot;
      _chatId = null;
      _memberId = null;
      _chats = [];
      _members = [];
      _loading = true;
      _error = null;
    });
    try {
      await _loadChats();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _error = null;
      _qr = null;
      _qrUrl = null;
    });
    try {
      final process = await widget.model.startFeishuRegistration();
      if (!mounted) {
        await process.stdin.close();
        return;
      }
      _registration = process;
      unawaited(process.stderr.drain<void>());
      var ready = false;
      await for (final line
          in process.stdout
              .transform(utf8.decoder)
              .transform(const LineSplitter())) {
        try {
          final event = objectValue(jsonDecode(line));
          if (event['type'] == 'qr' && event['url'] is String) {
            final url = event['url'] as String;
            if (mounted && _registration == process) {
              setState(() => _qrUrl = url);
            }
            final image = await widget.model.native.feishuQRCode(url);
            if (mounted && _registration == process) {
              setState(() => _qr = image);
            }
          } else if (event['type'] == 'ready') {
            final bot = objectValue(event['bot']);
            ready = true;
            if (mounted && _registration == process) {
              setState(() {
                _scanning = false;
                _qr = null;
                _qrUrl = null;
                _bots = [..._bots, bot];
              });
              await _selectBot(bot);
            }
          } else if (event['ok'] == false && mounted) {
            setState(() {
              _scanning = false;
              _error = event['error'] as String? ?? '飞书扫码未完成。';
            });
          }
        } catch (_) {
          if (mounted) setState(() => _error = '无法读取飞书扫码结果，请使用浏览器打开授权页面。');
        }
      }
      final code = await process.exitCode;
      if (mounted && _registration == process) {
        if (!ready && _scanning) {
          setState(() {
            _scanning = false;
            _error = '飞书扫码未完成，请重试。';
          });
        }
        if (code != 0 && _error == null) {
          setState(() => _error = '飞书扫码未完成，请重试。');
        }
      }
      if (_registration == process) _registration = null;
    } catch (error) {
      if (mounted) {
        setState(() {
          _scanning = false;
          _error = error.toString();
        });
      }
    }
  }

  Future<void> _next() async {
    if (_step == 0) {
      if (_account == null) return;
      setState(() {
        _step = 1;
        _error = null;
      });
      await _loadRepositories();
    } else if (_step == 1) {
      if (_repo == null ||
          (!_needsGuided && _directory == null) ||
          _branch == null) {
        return;
      }
      setState(() {
        _step = 2;
        _error = null;
      });
      if (!_loadedBots) await _loadBots();
    }
  }

  Future<void> _save() async {
    final account = _account, repo = _repo, bot = _bot, user = _githubUser;
    if (account == null ||
        repo == null ||
        bot == null ||
        user == null ||
        (!_needsGuided && _directory == null) ||
        _branch == null ||
        _chatId == null ||
        _memberId == null) {
      return;
    }
    final old = widget.project;
    if (_managePolicy && _acceptMode == 'auto' && _rule.text.trim().isEmpty) {
      setState(() => _error = '自动接单需要填写接单规则。');
      return;
    }
    bool changed(String key, Object? value) =>
        old?[key] != null && old?[key] != '' && old?[key] != value;
    if (old != null &&
        (changed('repository', repo['name']) ||
            changed('githubLogin', account['login']) ||
            changed('localProjectDir', _directory))) {
      setState(() => _error = '为保护已有任务，请新建项目以使用其他仓库或账号。');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final login = account['login'] as String, id = user['id'];
      final sameBot =
          old != null &&
          old['feishuConfigDir'] == bot['directory'] &&
          (old['feishuProfile'] == null ||
              old['feishuProfile'] == '' ||
              old['feishuProfile'] == bot['profile']);
      await widget.model.saveSuperagentProject({
        ...?old,
        if (old == null) ...{
          'name': (repo['name'] as String).substring(
            0,
            (repo['name'] as String).length.clamp(0, 100),
          ),
          'githubAllowed': login,
        },
        if (_needsGuided) ...{
          'guided': true,
          'dedicated': true,
          if (_directory != null) 'storageRoot': _directory,
          'baseBranch': _branch,
          'authorName': login,
          'authorEmail': '$id+$login@users.noreply.github.com',
        },
        if (old?['legacy'] == true && old?['revision'] == null)
          'preserveLegacyPolicy': true,
        'repository': repo['name'],
        'githubLogin': login,
        'ghConfigDir': account['directory'],
        if (!_needsGuided) 'localProjectDir': _directory,
        'policyManaged': _managePolicy,
        if (_managePolicy) ...{
          'feishuListen': _listen,
          'acceptMode': _acceptMode,
          'acceptRules': !_ruleEdited && old?['acceptRules'] != null
              ? old!['acceptRules']
              : [
                  if (_rule.text.trim().isNotEmpty)
                    {
                      'id': 'station-project-rule',
                      'name': '项目接单规则',
                      'enabled': true,
                      'instruction': _rule.text.trim(),
                    },
                ],
        },
        'feishuConfigDir': bot['directory'],
        'feishuProfile': sameBot ? old['feishuProfile'] ?? '' : bot['profile'],
        'larkExecutable': sameBot
            ? old['larkExecutable'] ?? ''
            : bot['executable'],
        'feishuChatId': _chatId,
        'feishuAllowedId': _memberId,
      }, id: old?['id'] as String?);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _repos
        .where(
          (row) => (row['name'] as String).toLowerCase().contains(
            _search.text.toLowerCase(),
          ),
        )
        .toList();
    return AlertDialog(
      title: Text(
        widget.project == null ? '添加 Superagent 项目' : '编辑 Superagent 项目',
      ),
      content: SizedBox(
        width: 660,
        height: _step == 0 ? 260 : 440,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '第 ${_step + 1} 步，共 3 步 · ${['选择 GitHub 账号', '选择仓库和项目', '连接飞书机器人'][_step]}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: SingleChildScrollView(
                child: switch (_step) {
                  0 => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('选择这个项目使用的 GitHub 账号。Station 不会切换其他项目的账号。'),
                      if (_accounts.isEmpty)
                        const Text('没有发现独立 gh 账号，请先在 gh-profiles 中添加账号并登录后刷新。'),
                      for (final account in _accounts)
                        ListTile(
                          title: Text(account['login'] as String),
                          selected: _sameAccount(_account, account),
                          leading: Icon(
                            _sameAccount(_account, account)
                                ? Icons.radio_button_checked
                                : Icons.radio_button_unchecked,
                          ),
                          onTap: _saving
                              ? null
                              : () => setState(() {
                                  if (_sameAccount(_account, account)) return;
                                  _account = account;
                                  _repo = null;
                                  _directory = null;
                                  _branch = null;
                                  _repos = [];
                                }),
                        ),
                      TextButton.icon(
                        onPressed: () async {
                          await widget.model.refreshSuperagentProjects();
                          if (mounted) setState(() {});
                        },
                        icon: const Icon(Icons.refresh),
                        label: const Text('刷新账号'),
                      ),
                    ],
                  ),
                  1 => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '选择仓库和 Superagent 专用存放目录。首次启动会准备专用仓库，每个任务创建独立 worktree。',
                      ),
                      if (_needsGuided && widget.project == null)
                        const Text('默认只接收所选 GitHub 账号发起的任务。'),
                      TextField(
                        controller: _search,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: '搜索仓库（可选）',
                          prefixIcon: Icon(Icons.search),
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (_loading && _repos.isEmpty)
                        const Center(child: CircularProgressIndicator())
                      else if (filtered.isEmpty)
                        const Text('没有找到可写入的仓库。')
                      else
                        SizedBox(
                          height: filtered.length > 3
                              ? 150
                              : filtered.length * 48.0,
                          child: ListView.builder(
                            itemCount: filtered.length,
                            itemBuilder: (context, index) {
                              final row = filtered[index];
                              return ListTile(
                                dense: true,
                                selected: _repo == row,
                                leading: Icon(
                                  row['private'] == true
                                      ? Icons.lock_outline
                                      : Icons.public,
                                ),
                                title: Text(row['name'] as String),
                                onTap: () async {
                                  if (_repo == row) return;
                                  setState(() {
                                    _repo = row;
                                    _branch = null;
                                    _branches = [];
                                    _directory = null;
                                    _loading = true;
                                    _error = null;
                                  });
                                  try {
                                    await _loadBranches();
                                  } catch (error) {
                                    if (mounted) {
                                      setState(() => _error = error.toString());
                                    }
                                  } finally {
                                    if (mounted) {
                                      setState(() => _loading = false);
                                    }
                                  }
                                },
                              );
                            },
                          ),
                        ),
                      if (_repo != null) ...[
                        DropdownButtonFormField<String>(
                          initialValue: _branches.contains(_branch)
                              ? _branch
                              : null,
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: _needsGuided
                                ? '任务的基准分支'
                                : '仓库分支（原项目任务设置不变）',
                          ),
                          items: [
                            for (final branch in _branches)
                              DropdownMenuItem(
                                value: branch,
                                child: Text(branch),
                              ),
                          ],
                          onChanged: _needsGuided
                              ? (value) => setState(() => _branch = value)
                              : null,
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _loading
                              ? null
                              : () => unawaited(_chooseDirectory()),
                          icon: const Icon(Icons.folder_open),
                          label: Text(_needsGuided ? '选择专用存放目录（可选）' : '选择本地项目'),
                        ),
                        if (_directory != null) SelectableText(_directory!),
                        if (_needsGuided)
                          const Text('未选择时使用 Station 默认目录。专用仓库和任务与日常工作区分开。'),
                        if (!_needsGuided)
                          const Text('已有项目继续使用原任务准备方式；如需更换任务目录或仓库，请新建项目。'),
                        if (_githubUser != null)
                          Text(
                            '提交身份：${_account?['login']} · GitHub 隐私邮箱（仅用于任务仓库）',
                          ),
                      ],
                    ],
                  ),
                  _ => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('选择已有机器人，或扫码创建新的飞书机器人。'),
                      const Text('扫码会创建飞书应用并启用机器人专用身份；请在飞书确认授权。企业可能需要管理员审批。'),
                      if (_scanning) ...[
                        if (_qr != null)
                          Center(
                            child: Image.memory(
                              _qr!,
                              width: 210,
                              height: 210,
                              filterQuality: FilterQuality.none,
                            ),
                          )
                        else
                          const Center(child: CircularProgressIndicator()),
                        if (_qrUrl != null)
                          Center(
                            child: TextButton(
                              onPressed: () => unawaited(
                                widget.model.native.openUrl(_qrUrl!),
                              ),
                              child: const Text('在浏览器打开授权页面'),
                            ),
                          ),
                        TextButton(
                          onPressed: () {
                            final process = _registration;
                            if (process != null) {
                              unawaited(process.stdin.close());
                            }
                          },
                          child: const Text('取消扫码'),
                        ),
                        const Text('完成扫码后会自动继续。取消后，已创建的飞书应用不会自动删除。'),
                      ] else ...[
                        OutlinedButton.icon(
                          onPressed: _loading ? null : () => unawaited(_scan()),
                          icon: const Icon(Icons.qr_code_2),
                          label: const Text('扫码添加飞书机器人'),
                        ),
                        TextButton.icon(
                          onPressed: _loading
                              ? null
                              : () => unawaited(_loadBots()),
                          icon: const Icon(Icons.refresh),
                          label: const Text('刷新机器人'),
                        ),
                        for (final bot in _bots)
                          ListTile(
                            title: Text(bot['name'] as String? ?? '飞书机器人'),
                            subtitle: Text(
                              'App ID: ${bot['appId'] ?? '未知'}${bot['ready'] == true ? '' : ' · 需要机器人专用身份，请扫码添加'}',
                            ),
                            selected: _bot == bot,
                            leading: Icon(
                              _bot == bot
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_unchecked,
                            ),
                            onTap: bot['ready'] == true && !_loading
                                ? () => unawaited(_selectBot(bot))
                                : null,
                          ),
                        if (_bot != null) ...[
                          const Text(
                            '使用应用机器人；扫码不能保证完成全部授权。请在飞书开放平台启用机器人、订阅 im.message.receive_v1 并发布应用版本。',
                          ),
                          const Text(
                            '默认申请包含读取群成员和群内全部消息。显示成员姓名可能需要另行申请用户基本信息权限；请按飞书提示审批或发布应用。',
                          ),
                          if (_bot!['appId'] is String)
                            TextButton(
                              onPressed: () => unawaited(
                                widget.model.native.openUrl(
                                  Uri.https(
                                    'open.feishu.cn',
                                    '/page/scope-apply',
                                    {
                                      'clientID': _bot!['appId'] as String,
                                      'scopes': 'im:chat.members:read im:message.group_msg',
                                    },
                                  ).toString(),
                                ),
                              ),
                              child: const Text('申请默认权限：群成员与群消息'),
                            ),
                          if (_bot!['appId'] is String)
                            TextButton(
                              onPressed: () => unawaited(
                                widget.model.native.openUrl(
                                  Uri.https(
                                    'open.feishu.cn',
                                    '/page/scope-apply',
                                    {
                                      'clientID': _bot!['appId'] as String,
                                      'scopes': 'contact:user.base:readonly',
                                    },
                                  ).toString(),
                                ),
                              ),
                              child: const Text('申请显示成员姓名的权限'),
                            ),
                          const Text(
                            '接收全部群消息需要 im:message.group_msg 等权限，可能需企业管理员审批。群历史读取成功也不能证明实时事件订阅已生效。',
                          ),
                          if (_bot!['appId'] is String)
                            TextButton(
                              onPressed: () => unawaited(
                                widget.model.native.openUrl(
                                  Uri.https(
                                    'open.feishu.cn',
                                    '/page/scope-apply',
                                    {
                                      'clientID': _bot!['appId'] as String,
                                      'scopes': 'im:message:readonly im:message.group_msg',
                                    },
                                  ).toString(),
                                ),
                              ),
                              child: const Text('申请群历史与全部群消息读取权限'),
                            ),
                          TextButton(
                            onPressed: () => unawaited(
                              widget.model.native.openUrl(
                                'https://open.feishu.cn/app',
                              ),
                            ),
                            child: const Text('打开飞书开放平台检查权限、事件与应用发布'),
                          ),
                          const Text('请先在飞书群中添加机器人，然后刷新群列表。'),
                          TextButton.icon(
                            onPressed: _loading
                                ? null
                                : () async {
                                    setState(() {
                                      _loading = true;
                                      _error = null;
                                    });
                                    try {
                                      await _loadChats();
                                    } catch (error) {
                                      if (mounted) {
                                        setState(
                                          () => _error = error.toString(),
                                        );
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _loading = false);
                                      }
                                    }
                                  },
                            icon: const Icon(Icons.refresh),
                            label: const Text('刷新群列表'),
                          ),
                          DropdownButtonFormField<String>(
                            initialValue:
                                _chats.any((row) => row['id'] == _chatId)
                                ? _chatId
                                : null,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: '选择飞书群',
                            ),
                            items: [
                              for (final chat in _chats)
                                DropdownMenuItem(
                                  value: chat['id'] as String,
                                  child: Text(chat['name'] as String),
                                ),
                            ],
                            onChanged: _loading
                                ? null
                                : (value) async {
                                    setState(() {
                                      _chatId = value;
                                      _feishuCheck = null;
                                      _memberId = null;
                                      _members = [];
                                      _loading = true;
                                      _error = null;
                                    });
                                    try {
                                      await _loadMembers();
                                    } catch (error) {
                                      if (mounted) {
                                        setState(
                                          () => _error = error.toString(),
                                        );
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _loading = false);
                                      }
                                    }
                                  },
                          ),
                          DropdownButtonFormField<String>(
                            initialValue:
                                _members.any((row) => row['id'] == _memberId)
                                ? _memberId
                                : null,
                            isExpanded: true,
                            itemHeight: 64,
                            selectedItemBuilder: (context) => [
                              for (final member in _members)
                                Text(
                                  member['name'] as String,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                            decoration: const InputDecoration(
                              labelText: '允许发起任务的人',
                            ),
                            items: [
                              for (final member in _members)
                                DropdownMenuItem(
                                  value: member['id'] as String,
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        member['name'] as String,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      Text(
                                        member['id'] as String,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                            onChanged: _loading
                                ? null
                                : (value) => setState(() => _memberId = value),
                          ),
                          TextButton.icon(
                            onPressed: _loading || _chatId == null
                                ? null
                                : () async {
                                    setState(() {
                                      _loading = true;
                                      _error = null;
                                    });
                                    try {
                                      await _loadMembers();
                                    } catch (error) {
                                      if (mounted) {
                                        setState(
                                          () => _error = error.toString(),
                                        );
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _loading = false);
                                      }
                                    }
                                  },
                            icon: const Icon(Icons.refresh),
                            label: const Text('刷新群成员'),
                          ),
                          if (_members.any(
                            (member) =>
                                member['name'] == member['id'] ||
                                RegExp(r'^用户\d{4,}$')
                                    .hasMatch(member['name'] as String? ?? ''),
                          ))
                            const Text(
                              '成员名称由飞书返回；如果无法识别，请核对飞书应用的通讯录可见范围和相关权限，然后刷新群成员。',
                            ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('由 Station 管理接收与接单设置'),
                            subtitle: const Text(
                              '关闭时沿用 Superagent 面板现有的接收方式、名单、规则和接单模式。',
                            ),
                            value: _managePolicy,
                            onChanged: (value) =>
                                setState(() => _managePolicy = value),
                          ),
                          if (_managePolicy) ...[
                            DropdownButtonFormField<String>(
                              initialValue: _listen,
                              decoration: const InputDecoration(
                                labelText: '消息接收方式',
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: 'mentions',
                                  child: Text('仅 @ 机器人'),
                                ),
                                DropdownMenuItem(
                                  value: 'all',
                                  child: Text('接收群内全部消息'),
                                ),
                              ],
                              onChanged: (value) =>
                                  setState(() => _listen = value!),
                            ),
                            DropdownButtonFormField<String>(
                              initialValue: _acceptMode,
                              decoration: const InputDecoration(
                                labelText: '接单方式',
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: 'observe',
                                  child: Text('仅观察'),
                                ),
                                DropdownMenuItem(
                                  value: 'auto',
                                  child: Text('自动接单'),
                                ),
                              ],
                              onChanged: (value) =>
                                  setState(() => _acceptMode = value!),
                            ),
                            const Text(
                              '仅观察：推断任务只评估记录；允许用户明确 @ 或私聊提出的请求仍可接收。自动接单：仅按允许用户及规则评估，闲聊不应创建任务。',
                            ),
                            TextField(
                              controller: _rule,
                              minLines: 3,
                              maxLines: 6,
                              maxLength: 2000,
                              decoration: const InputDecoration(
                                labelText: '接单规则',
                              ),
                              onChanged: (_) => _ruleEdited = true,
                            ),
                          ],
                          OutlinedButton(
                            onPressed: _loading || _chatId == null
                                ? null
                                : () async {
                                    setState(() {
                                      _loading = true;
                                      _error = null;
                                    });
                                    try {
                                      final value = await widget.model
                                          .superagentOnboarding(
                                            'feishu-check',
                                            {'bot': _bot, 'chatId': _chatId},
                                          );
                                      if (mounted) {
                                        setState(() => _feishuCheck = value);
                                      }
                                    } catch (error) {
                                      if (mounted) {
                                        setState(
                                          () => _error = error.toString(),
                                        );
                                      }
                                    } finally {
                                      if (mounted) {
                                        setState(() => _loading = false);
                                      }
                                    }
                                  },
                            child: const Text('检查机器人进群与读取权限'),
                          ),
                          if (_feishuCheck != null)
                            Text(
                              '已加入目标群：${_feishuCheck!['joined'] == true ? '已核验' : '未核验'}；读取群历史：${_feishuCheck!['historyReadable'] == true ? '已核验' : '未通过，请检查消息读取及 im:message.group_msg 权限、审批和应用发布'}。实时消息事件订阅及应用发布：需在飞书后台确认，并用真实无 @ 消息验收。',
                            ),
                        ],
                      ],
                    ],
                  ),
                },
              ),
            ),
            if (_loading && _repos.isNotEmpty || _loading && _step == 2)
              const LinearProgressIndicator(),
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        if (_step > 0)
          TextButton(
            onPressed: _saving || _loading
                ? null
                : () => setState(() {
                    _step--;
                    _error = null;
                  }),
            child: const Text('上一步'),
          ),
        if (_step < 2)
          FilledButton(
            onPressed:
                _loading ||
                    (_step == 0
                        ? _account == null
                        : _repo == null ||
                              (!_needsGuided && _directory == null) ||
                              _branch == null)
                ? null
                : () => unawaited(_next()),
            child: const Text('下一步'),
          )
        else
          FilledButton(
            onPressed:
                _saving ||
                    _loading ||
                    _scanning ||
                    _bot == null ||
                    _chatId == null ||
                    _memberId == null
                ? null
                : () => unawaited(_save()),
            child: const Text('完成'),
          ),
      ],
    );
  }
}
