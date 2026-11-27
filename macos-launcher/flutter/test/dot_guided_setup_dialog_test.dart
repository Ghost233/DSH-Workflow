import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/dot_guided_setup_dialog.dart';
import '../lib/native_bridge.dart';

void main() {
  testWidgets(
    'global pairing needs no selection; optional detail scope is explicit',
    (tester) async {
      Map<String, Object?>? output;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  output = await showDialog<Map<String, Object?>>(
                    context: context,
                    builder: (_) => DotGuidedSetupDialog(
                      native: NativeBridge(),
                      load: () async => {
                        'clientAvailable': true,
                        'keyAvailable': true,
                        'tunnelId': 'tunnel_${'a' * 32}',
                        'sessions': [
                          {'id': 'test-1', 'title': '明确授权', 'running': true},
                          {'id': 'test-2', 'title': '未选中', 'running': false},
                        ],
                      },
                    ),
                  );
                },
                child: const Text('打开配对'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('打开配对'));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      expect(find.text('运行中'), findsOneWidget);
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(output?['sessionIds'], isEmpty);
      expect(output?.containsKey('runtimeKey'), isFalse);
      await tester.tap(find.text('打开配对'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('明确授权'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(output?['mode'], 'guided');
      expect(output?['sessionIds'], ['test-1']);
      expect(output?.containsKey('runtimeKey'), isFalse);
    },
  );
}
