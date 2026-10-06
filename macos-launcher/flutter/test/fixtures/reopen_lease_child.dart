import 'dart:convert';
import 'dart:io';

Future<void> main(List<String> arguments) async {
  if (arguments.single == '--exit') exit(29);
  final root = Directory(arguments.single);
  final file = File('${root.path}/lease.json');
  await file.writeAsString(
    jsonEncode({'lease': 'old', 'pid': pid, 'root': root.path}),
  );
  stdout.writeln('LEASE_CHILD_READY');
  for (
    var i = 0;
    i < 400 && !await File('${root.path}/release').exists();
    i++
  ) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  await file.writeAsString(
    jsonEncode({'lease': 'new', 'pid': pid, 'root': root.path}),
  );
  for (var i = 0; i < 400 && !await File('${root.path}/stop').exists(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  exit(23);
}
