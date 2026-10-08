import 'dart:io';
import 'dart:async';
import 'dart:convert';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:launcher_core/launcher_core.dart';

import '../tool/web_application_scenario.dart'
    show runWebApplicationScenario, WebProbeOptions, ownedReceiptAbsent;
import '../tool/probe_diagnostics.dart' show desktopQuitFacts;
import '../tool/release_distribution_probe.dart' show finishReleaseProbe;
import '../tool/desktop_window_application_scenario.dart'
    show sdkColdEpochUnchanged, finishSdkColdFocusFailure;

void main() {
  for (final readFails in [false, true]) {
    for (final writeFails in [false, true]) {
      test(
        'cold failure keeps original error and stack with VM=$readFails I/O=$writeFails',
        () async {
          final root = await Directory.systemTemp.createTemp(
            'cold-failure-diagnostics-',
          );
          final configuration = jsonDecode(
            await File('.dart_tool/package_config.json').readAsString(),
          ) as Map;
          final dart = Directory.fromUri(
            Uri.parse(configuration['flutterRoot'] as String),
          ).uri.resolve('bin/cache/dart-sdk/bin/dart').toFilePath();
          final process = await Process.start(dart, [
            '--enable-vm-service=0',
            'test/fixtures/cold_state_vm.dart',
          ]);
          final uri = Completer<Uri>(), outputDone = Completer<void>();
          process.stdout
              .transform(utf8.decoder)
              .transform(const LineSplitter())
              .listen((line) {
                final match = RegExp(
                  r'^COLD_STATE_READY (http://127\.0\.0\.1:[0-9]+/[^ ]*)$',
                ).firstMatch(line);
                if (match != null && !uri.isCompleted) {
                  uri.complete(
                    Uri.parse('${match[1]}ws').replace(scheme: 'ws'),
                  );
                }
              }, onDone: outputDone.complete);
          final errors = process.stderr.transform(utf8.decoder).join();
          VmService? vm;
          try {
            vm = await vmServiceConnectUri(
              (await uri.future.timeout(const Duration(seconds: 10)))
                  .toString(),
            );
            final isolate = (await vm.getVM()).isolates!.single.id!;
            Future<Map<String, Object?>> state([Map<String, String>? _]) async {
              return (await vm!.callServiceExtension(
                'ext.cold.nativeState',
                isolateId: isolate,
              )).json!.cast<String, Object?>();
            }

            expect(
              (await state())['native'],
              isNotNull,
              reason: 'the actual VM state seam is available before failure',
            );
            if (readFails) await vm.dispose();
            if (writeFails) {
              await Directory('${root.path}/desktop-window-evidence.json')
                  .create();
            }
            Object? original, thrown;
            StackTrace? originalStack, thrownStack;
            try {
              throw StateError('original foreground/HID failure');
            } catch (error, stack) {
              original = error;
              originalStack = stack;
              try {
                await finishSdkColdFocusFailure(
                  root: root,
                  state: state,
                  backend: {'pid': 42, 'lease': 'cold-host'},
                  baseline: {'pid': 41},
                  cold: {'source': 'previous-capture'},
                  physicalWindow: {'ownershipKnown': false},
                  freshOsInput: null,
                  firstError: error,
                  firstStack: stack,
                );
              } catch (error, stack) {
                thrown = error;
                thrownStack = stack;
              }
            }
            expect(thrown, same(original));
            expect(thrownStack.toString(), originalStack.toString());
            if (!writeFails) {
              final evidence = jsonDecode(
                await File('${root.path}/desktop-window-evidence.json')
                    .readAsString(),
              ) as Map;
              expect(
                evidence['failure'],
                contains('original foreground/HID failure'),
              );
              expect(evidence['externalFocusVerified'], false);
              expect(
                (evidence['nativeColdCapture'] as Map)['source'],
                readFails ? 'previous-capture' : 'real-dart-vm',
              );
            }
          } finally {
            await vm?.dispose();
            await process.stdin.close();
            expect(
              await process.exitCode.timeout(const Duration(seconds: 5)),
              0,
            );
            await outputDone.future;
            await errors;
            await root.delete(recursive: true);
          }
        },
      );
    }
  }
  test('SDK cold recovery requires known fresh unchanged input', () {
    final baseline = {
      'inputCounts': [1, 2, 3, 4],
    };
    final recovered = {
      'inputCountsBefore': [1, 2, 3, 4],
      'hiddenRecoveryUptime': 7,
      'inputCountsAtRecovery': [1, 2, 3, 4],
      'inputUnchangedAtRecovery': true,
    };
    for (final value in [null, false]) {
      expect(
        sdkColdEpochUnchanged(
          baseline,
          {...recovered, 'inputUnchangedAtRecovery': value},
          [1, 2, 3, 4],
        ),
        false,
      );
    }
    final missing = Map.of(recovered)..remove('inputUnchangedAtRecovery');
    expect(sdkColdEpochUnchanged(baseline, missing, [1, 2, 3, 4]), false);
    expect(sdkColdEpochUnchanged(baseline, recovered, null), false);
    expect(sdkColdEpochUnchanged(baseline, recovered, [1, 2, 3, 5]), false);
    expect(sdkColdEpochUnchanged(baseline, recovered, [1, 2, 3, 4]), true);
    expect(
      sdkColdEpochUnchanged(
        baseline,
        {
          'inputCountsBefore': [1, 2, 3, 4],
        },
        [1, 2, 3, 4],
      ),
      true,
    );
    expect(
      sdkColdEpochUnchanged(
        baseline,
        {
          'inputCountsBefore': [1, 2, 3, 5],
        },
        [1, 2, 3, 4],
      ),
      false,
    );
  });
  for (final stage in ['marker', 'evidence']) {
    for (final bodyFailed in [true, false]) {
      test(
        'Release cleanup $stage I/O failure, bodyFailed=$bodyFailed',
        () async {
          final root = await Directory.systemTemp.createTemp(
            'release-cleanup-io-',
          );
          final listener = await ServerSocket.bind(
            InternetAddress.loopbackIPv4,
            0,
          );
          final port = listener.port;
          final child = await Process.start('/bin/cat', []);
          final outputDone = child.stdout.drain<void>();
          final errorDone = child.stderr.drain<void>();
          final log = File('${root.path}/owned.log').openWrite()
            ..writeln('owned output');
          final fault = await Directory('${root.path}/io-fault').create();
          final body = StateError('original Release body failure');
          final closed = <String>[];
          addTearDown(() async {
            child.kill(ProcessSignal.sigterm);
            await child.exitCode;
            await outputDone;
            await errorDone;
            await listener.close();
            await log.close();
            await root.delete(recursive: true);
          });
          Object? thrown;
          try {
            await finishReleaseProbe(
              [
                (
                  'actor marker',
                  () async {
                    if (stage == 'marker') {
                      await File(fault.path).writeAsString('complete');
                    } else {
                      await File('${root.path}/marker')
                          .writeAsString('complete');
                    }
                  },
                ),
                (
                  'actor process',
                  () async {
                    await child.stdin.close();
                    await child.exitCode;
                    closed.add('actor');
                  },
                ),
                (
                  'actor output',
                  () async {
                    await outputDone;
                    await errorDone;
                    closed.add('subscription');
                  },
                ),
                (
                  'actor log',
                  () async {
                    await log.close();
                    closed.add('log');
                  },
                ),
                (
                  'SDK endpoint',
                  () async {
                    await listener.close();
                    closed.add('sdk');
                  },
                ),
                (
                  'final evidence',
                  () async {
                    await File(
                      stage == 'evidence'
                          ? fault.path
                          : '${root.path}/evidence.json',
                    ).writeAsString('{}');
                  },
                ),
              ],
              firstError: bodyFailed ? body : null,
              firstStack: StackTrace.current,
            );
          } catch (error) {
            thrown = error;
          }
          expect(closed, ['actor', 'subscription', 'log', 'sdk']);
          expect(
            await child.exitCode.timeout(const Duration(milliseconds: 500)),
            0,
          );
          final rebound = await ServerSocket.bind(
            InternetAddress.loopbackIPv4,
            port,
          );
          await rebound.close();
          expect(thrown, bodyFailed ? same(body) : isA<FileSystemException>());
          expect(
            await File('${root.path}/owned.log').readAsString(),
            'owned output\n',
          );
        },
      );
    }
  }
  test(
    'owned receipt absence requires ENOENT and exact private paths',
    () async {
      final temporary = await Directory.systemTemp.createTemp(
        'dsh-receipt-absence-',
      );
      final root = Directory(await temporary.resolveSymbolicLinks());
      final parent = await Directory('${root.path}/desktop').create();
      final receipt = File('${parent.path}/desktop-host.json');
      final sibling = await Directory('${root.path}/other').create();
      final target = await File('${sibling.path}/receipt.json')
          .writeAsString('private-canary');
      try {
        expect(await ownedReceiptAbsent(receipt), true);
        await receipt.writeAsString('{}');
        expect(await ownedReceiptAbsent(receipt), false);
        await receipt.delete();
        final leaf = await Link(receipt.path).create(target.path);
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await leaf.delete();
        final dangling = await Link(receipt.path)
            .create('${sibling.path}/missing.json');
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await dangling.delete();
        await parent.delete();
        final parentLink = await Link(parent.path).create(sibling.path);
        await expectLater(ownedReceiptAbsent(receipt), throwsStateError);
        await parentLink.delete();
        await expectLater(
          ownedReceiptAbsent(receipt),
          throwsA(isA<FileSystemException>()),
        );
        await parent.create();
        await Directory(receipt.path).create();
        await expectLater(
          ownedReceiptAbsent(receipt),
          throwsA(isA<FileSystemException>()),
        );
      } finally {
        await root.delete(recursive: true);
      }
    },
  );
  test(
    'body failure survives owned cleanup error and closes resources',
    () async {
      final root = await Directory.systemTemp.createTemp('dsh-cleanup-error-');
      final listener = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final client = HttpClient();
      final hostLog = File('${root.path}/host.log').openWrite();
      var bodyStarted = false;
      final actions = <String?>[];
      final host = await Process.start('/bin/sh', [
        '-c',
        'read -r shutdown; exit 17',
      ]);
      try {
        await expectLater(
          HttpOverrides.runZoned(
            () => runWebApplicationScenario(
              options: WebProbeOptions(root.path, 'desktop', listener.port),
              root: root,
              layout: EndpointLayout(directory: '${root.path}/manager'),
              manifestPath: '${root.path}/unused-manifest.json',
              port: listener.port,
              state: ([parameters]) async {
                actions.add(parameters?['action']);
                if (!bodyStarted) {
                  bodyStarted = true;
                  throw StateError('original-body-failure');
                }
                return {'native': <String, Object?>{}};
              },
              applicationExit: Future.value(0),
              ownsHostReceipt: (_) async => false,
              startupFailure: (_) async => null,
              tap: (_) async {},
              capture: (_) async {},
              settingsOwnedWebCleanup: true,
              prestartedHost: host,
              prestartedHostLog: hostLog,
            ),
            createHttpClient: (_) => client,
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'first failure',
              contains('original-body-failure'),
            ),
          ),
        );
        expect(actions, isNot(contains('quitDesktop')));
        expect(await host.exitCode, 17);
        await expectLater(
          () => client.getUrl(Uri.parse('http://127.0.0.1:${listener.port}/')),
          throwsStateError,
        );
        expect(() => hostLog.write('after cleanup'), throwsStateError);
      } finally {
        client.close(force: true);
        await host.exitCode;
        await hostLog.close();
        await listener.close(force: true);
        await root.delete(recursive: true);
      }
    },
  );
  test('unavailable quit facts remain unknown and raw reason is omitted', () {
    final missing = desktopQuitFacts(null);
    expect(missing.values.every((value) => value == null), true);
    final nilLookup = desktopQuitFacts({
      'expectedPid': 42,
      'lookupFound': false,
      'accepted': null,
      'hasTerminated': null,
      'reason': 'private-credential-value',
    });
    expect(nilLookup['lookupFound'], false);
    expect(nilLookup['accepted'], isNull);
    expect(nilLookup['hasTerminated'], isNull);
    expect(nilLookup.containsKey('reason'), false);
    final invalid = desktopQuitFacts({
      'expectedPid': '42',
      'lookupFound': 'false',
      'accepted': 1,
      'hasTerminated': 'true',
    });
    expect(invalid.values.every((value) => value == null), true);
  });
}
