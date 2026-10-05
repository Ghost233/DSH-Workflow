import 'dart:convert';

class AppUpdate {
  const AppUpdate(this.version, this.page);
  final String version;
  final Uri page;
}

List<int>? _version(String value) {
  if (!RegExp(r'^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$').hasMatch(value)) {
    return null;
  }
  return value.split('.').map(int.parse).toList();
}

int _compare(List<int> left, List<int> right) {
  for (var i = 0; i < 3; i++) {
    final result = left[i].compareTo(right[i]);
    if (result != 0) return result;
  }
  return 0;
}

AppUpdate? newerRelease(String body, String installed) {
  final current = _version(installed);
  if (current == null) return null;
  final releases = jsonDecode(body);
  if (releases is! List) throw const FormatException('Invalid release list');
  String? newest;
  var best = current;
  for (final value in releases) {
    if (value is! Map ||
        value['draft'] != false ||
        value['prerelease'] != false) {
      continue;
    }
    final tag = value['tag_name'];
    if (tag is! String || !tag.startsWith('macos-v')) continue;
    final version = _version(tag.substring(7));
    if (version == null || _compare(version, best) <= 0) continue;
    best = version;
    newest = tag;
  }
  return newest == null
      ? null
      : AppUpdate(
          newest.substring(7),
          Uri.parse(
            'https://github.com/Ghost233/DSH-Workflow/releases/tag/$newest',
          ),
        );
}
