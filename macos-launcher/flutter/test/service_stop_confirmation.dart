import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> expectServiceStopConfirmation<T>(
  WidgetTester tester,
  Future<T> Function() request,
) async {
  final confirmationClock = Stopwatch()..start();
  var requestCompleted = false;
  String? requestErrorType;
  Object? requestErrorCode;
  await tester.runAsync(() async {
    unawaited(
      request().then<void>(
        (response) {
          final error = response is Map ? response['error'] : null;
          requestErrorCode = error is Map ? error['code'] : null;
          requestCompleted = true;
        },
        onError: (Object error) {
          requestErrorType = error.runtimeType.toString();
          requestCompleted = true;
        },
      ),
    );
  });
  await tester.pump();
  while (!requestCompleted &&
      find.byType(AlertDialog).evaluate().isEmpty &&
      confirmationClock.elapsed < const Duration(seconds: 30)) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pump();
  }
  expect(
    requestErrorType,
    isNull,
    reason: 'Actual stop or restart failed before confirmation.',
  );
  expect(
    requestCompleted,
    false,
    reason:
        'Actual stop or restart returned before explicit confirmation: code=$requestErrorCode',
  );
  expect(
    find.byType(AlertDialog),
    findsOneWidget,
    reason: 'A real SDK stop must wait for explicit confirmation of actual unfinished work.',
  );
}
