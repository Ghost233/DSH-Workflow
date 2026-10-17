import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import '../tool/web_startup_wait.dart';

void main() {
  test(
    'starting and unrelated update/frame warnings are not startup failures',
    () {
      expect(
        webStartupFailure(
          {'state': 'starting', 'ready': false},
          {
            'nodes': [
              {'label': '检查更新失败：TimeoutException'},
              {'value': 'Reported frame time is older than the last one'},
            ],
          },
          sawStarting: true,
        ),
        isNull,
      );
      expect(
        webStartupFailure({'state': 'stopped'}, const {}, sawStarting: false),
        isNull,
      );
    },
  );
  test('actual failed or exited Web and Native open-failed are terminal', () {
    expect(
      webStartupFailure({'state': 'failed'}, const {}, sawStarting: false),
      isNotNull,
    );
    expect(
      webStartupFailure({'state': 'stopped'}, const {}, sawStarting: true),
      isNotNull,
    );
    expect(
      webStartupFailure(
        {'state': 'starting'},
        {
          'nodes': [
            {
              'value': 'PlatformException(open-failed, The application is corrupt., null, null)',
            },
          ],
        },
        sawStarting: true,
      ),
      isNotNull,
    );
  });
  test('the actual Unsafe socket startup error is terminal UI feedback', () {
    expect(
      webStartupFailure(const {}, {
        'nodes': [
          {'value': 'Bad state: Unsafe DSH service socket'},
        ],
      }, sawStarting: false),
      isNotNull,
    );
  });
  testWidgets('a pending startup observation terminates after thirty seconds', (
    tester,
  ) async {
    final pending = Completer<Map<String, Object?>>();
    Object? failure;
    unawaited(
      waitForActualWebStartup(
        status: () => pending.future,
        ui: () async => {'nodes': []},
        applicationExit: Completer<int>().future,
      ).catchError((Object error) {
        failure = error;
      }),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 30));
    expect(failure, isA<TimeoutException>());
    pending.complete({'state': 'stopped', 'ready': false});
    await tester.pump();
  });
  test('application exit cancels polling even with a pending read', () async {
    final pendingStatus = Completer<Map<String, Object?>>();
    final exit = Completer<int>();
    var reads = 0;
    final waiting = waitForActualWebStartup(
      status: () {
        reads++;
        return pendingStatus.future;
      },
      ui: () => Future.value({'nodes': []}),
      applicationExit: exit.future,
    );
    await Future<void>.delayed(Duration.zero);
    expect(reads, 1);
    exit.complete(-11);
    await expectLater(
      waiting,
      throwsA(
        isA<StateError>().having(
          (e) => e.message,
          'actual exit',
          contains('-11'),
        ),
      ),
    );
    pendingStatus.complete({'state': 'starting', 'ready': false});
    await Future<void>.delayed(Duration.zero);
    expect(reads, 1);
  });
}
