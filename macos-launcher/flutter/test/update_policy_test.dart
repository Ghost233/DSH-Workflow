import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:dsh_workflow_launcher/update_policy.dart';

Map<String, Object?> _asset(String version) => {
  'name': 'DSH-Workflow-macOS-$version-arm64.dmg',
  'size': 1024,
  'browser_download_url':
      'https://github.com/Ghost233/DSH-Workflow/releases/download/macos-v$version/DSH-Workflow-macOS-$version-arm64.dmg',
};

Map<String, Object?> _release(
  String version, {
  bool draft = false,
  bool prerelease = false,
}) => {
  'tag_name': 'macos-v$version',
  'draft': draft,
  'prerelease': prerelease,
  'assets': [_asset(version)],
};

void main() {
  test(
    'a newer formal release without a compatible Workflow DMG is not offered',
    () {
      final release = {
        'tag_name': 'macos-v0.2.4',
        'draft': false,
        'prerelease': false,
        'assets': <Object?>[],
      };
      expect(newerRelease(jsonEncode([release]), '0.2.3'), isNull);
    },
  );
  test('only stable matching releases newer than the installed version are selected', () {
    final rows = [
      _release('0.2.3'),
      _release('0.2.5', draft: true),
      _release('0.2.8-beta'),
      _release('0.2.6', prerelease: true),
      _release('00.2.9'),
      {..._release('0.2.4'), 'html_url': 'https://outside.example/release'},
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
    final rows = [_release('1.9.9'), _release('1.10.0'), _release('2.0.0')];
    expect(newerRelease(jsonEncode(rows), '1.9.0')?.version, '2.0.0');
    expect(
      newerRelease(jsonEncode(rows.take(2).toList()), '1.9.0')?.version,
      '1.10.0',
    );
    expect(newerRelease('[]', '0.2.3'), isNull);
  });
  test(
    'DMG metadata must identify a nonempty asset from this repository and tag',
    () {
      final incompatible = <String, Object?>{
        'missing assets': null,
        'malformed assets': <String, Object?>{},
        'wrong version': [_asset('0.2.5')],
        'wrong architecture': [
          {..._asset('0.2.4'), 'name': 'DSH-Workflow-macOS-0.2.4-x64.dmg'},
        ],
        'empty asset': [
          {..._asset('0.2.4'), 'size': 0},
        ],
        'negative size': [
          {..._asset('0.2.4'), 'size': -1},
        ],
        'text size': [
          {..._asset('0.2.4'), 'size': '1024'},
        ],
        'fractional size': [
          {..._asset('0.2.4'), 'size': 1.5},
        ],
        'missing URL': [
          {..._asset('0.2.4'), 'browser_download_url': null},
        ],
        'foreign repository': [
          {
            ..._asset('0.2.4'),
            'browser_download_url': 'https://github.com/deepseek-ai/DSH/releases/download/macos-v0.2.4/DSH-Workflow-macOS-0.2.4-arm64.dmg',
          },
        ],
        'foreign host': [
          {
            ..._asset('0.2.4'),
            'browser_download_url':
                'https://outside.example/DSH-Workflow-macOS-0.2.4-arm64.dmg',
          },
        ],
        'different tag': [
          {
            ..._asset('0.2.4'),
            'browser_download_url': 'https://github.com/Ghost233/DSH-Workflow/releases/download/macos-v0.2.5/DSH-Workflow-macOS-0.2.4-arm64.dmg',
          },
        ],
      };
      for (final entry in incompatible.entries) {
        final release = {..._release('0.2.4'), 'assets': entry.value};
        if (entry.key == 'missing assets') release.remove('assets');
        expect(
          newerRelease(jsonEncode([release]), '0.2.3'),
          isNull,
          reason: entry.key,
        );
      }
    },
  );
  test(
    'a newer tag without a usable DMG does not hide an applicable release',
    () {
      final rows = [
        {..._release('0.2.5'), 'assets': <Object?>[]},
        {
          ..._release('0.2.4'),
          'assets': [
            {'name': 'source.zip', 'size': 99},
            _asset('0.2.4'),
          ],
        },
      ];
      expect(newerRelease(jsonEncode(rows), '0.2.3')?.version, '0.2.4');
    },
  );
}
