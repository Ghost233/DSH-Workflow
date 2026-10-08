import 'dart:convert';
import 'dart:developer';
import 'dart:io';

Future<void> main() async {
  registerExtension('ext.cold.nativeState', (_, _) async {
    return ServiceExtensionResponse.result(
      jsonEncode({
        'native': {
          'coldCallerObservation': {'source': 'real-dart-vm'},
        },
      }),
    );
  });
  stdout.writeln('COLD_STATE_READY ${(await Service.getInfo()).serverUri}');
  stdin.listen((_) {}, onDone: () => exit(0));
}
