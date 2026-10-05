import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:dsh_workflow_launcher/update_policy.dart';

void main() {
  test('only stable matching releases newer than the installed version are selected', () {
    final rows = [
      {'tag_name': 'macos-v0.2.3', 'draft': false, 'prerelease': false},
      {'tag_name': 'macos-v0.2.5', 'draft': true, 'prerelease': false},
      {'tag_name': 'macos-v0.2.8-beta', 'draft': false, 'prerelease': false},
      {'tag_name': 'macos-v0.2.6', 'draft': false, 'prerelease': true},
      {'tag_name': 'macos-v00.2.9', 'draft': false, 'prerelease': false},
      {'tag_name': 'macos-v0.2.4', 'draft': false, 'prerelease': false},
    ];
    final result = newerRelease(jsonEncode(rows), '0.2.3');
    expect(result?.version, '0.2.4');
    expect(
      result?.page.toString(),
      'https://github.com/Ghost233/DSH-Workflow/releases/tag/macos-v0.2.4',
    );
    expect(newerRelease(jsonEncode(rows), '0.3.0'), isNull);
    expect(newerRelease(jsonEncode(rows), 'unknown'), isNull);
  });
  test('numeric major and minor ordering and empty releases match the old launcher', () {
    final rows = [
      {'tag_name': 'macos-v1.9.9', 'draft': false, 'prerelease': false},
      {'tag_name': 'macos-v1.10.0', 'draft': false, 'prerelease': false},
      {'tag_name': 'macos-v2.0.0', 'draft': false, 'prerelease': false},
    ];
    expect(newerRelease(jsonEncode(rows), '1.9.0')?.version, '2.0.0');
    expect(
      newerRelease(jsonEncode(rows.take(2).toList()), '1.9.0')?.version,
      '1.10.0',
    );
    expect(newerRelease('[]', '0.2.3'), isNull);
  });
}
