import 'dart:convert';
import 'dart:developer';
import 'dart:io';

void main() {
  registerExtension('ext.cold.nativeState', (_, _) async {
    return ServiceExtensionResponse.result(
      jsonEncode({
        'native': {
          'coldCallerObservation': {'source': 'real-dart-vm'},
        },
      }),
    );
  });
  stdin.listen((_) {}, onDone: () => exit(0));
}
