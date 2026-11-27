import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/dot_guided_setup_dialog.dart';
import '../lib/native_bridge.dart';

void main() {
  testWidgets(
    'global pairing never requires or shows a session selection',
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
      expect(find.text('运行中'), findsNothing);
      expect(find.text('明确授权'), findsNothing);
      expect(find.text('未选中'), findsNothing);
      expect(find.byType(CheckboxListTile), findsNothing);
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(output?['sessionIds'], isEmpty);
      expect(output?.containsKey('runtimeKey'), isFalse);
      expect(output?['mode'], 'guided');
    },
  );
}
