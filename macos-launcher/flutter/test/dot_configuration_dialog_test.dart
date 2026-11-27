import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../lib/dot_configuration_dialog.dart';
import '../lib/native_bridge.dart';

class _FakeNative extends NativeBridge {
  @override
  Future<String?> chooseDotClientDirectory() async => '/fixture/private';
}

void main() {
  testWidgets(
    'Dot pairing validates input and only returns explicit session scope',
    (tester) async {
      Map<String, Object?>? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  selected = await showDialog<Map<String, Object?>>(
                    context: context,
                    builder: (_) =>
                        DotConfigurationDialog(native: _FakeNative()),
                  );
                },
                child: const Text('配置'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('配置'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(find.textContaining('核对官方 SHA-256'), findsOneWidget);
      expect(selected, isNull);
      await tester.enterText(
        find.byType(TextField).at(0),
        'tunnel_${'a' * 32}',
      );
      await tester.enterText(find.byType(TextField).at(1), 'b' * 64);
      await tester.tap(find.text('选择已有客户端目录'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(2), 'demo-A\ndemo-A');
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(find.textContaining('不重复'), findsOneWidget);
      await tester.enterText(find.byType(TextField).at(2), 'demo-A\ndemo-B');
      await tester.tap(find.text('保存配对'));
      await tester.pumpAndSettle();
      expect(selected?['directory'], '/fixture/private');
      expect(selected?['sessions'], [
        {'id': 'demo-A', 'label': '会话 1'},
        {'id': 'demo-B', 'label': '会话 2'},
      ]);
      expect(selected?.containsKey('bearer'), isFalse);
    },
  );
}
