#!/usr/bin/env python3
"""Read diagnostics belonging to one private probe, without exporting secrets."""
import argparse
import datetime
import json
import re
from pathlib import Path

SECRETS = ('isolated-web-probe-password', 'isolated-settings-changed-password',
           'isolated-settings-save-failure', 'isolated-keychain-unlock')


def scrub(value):
    if isinstance(value, dict):
        return {key: ('<REDACTED>' if re.search(r'token|password|cookie|authorization|api.?key', key, re.I)
                      else scrub(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, str):
        value = re.sub(r'token=[^&\s"\\]+', 'token=<REDACTED>', value)
        for secret in SECRETS:
            value = value.replace(secret, '<REDACTED>')
    return value


def collect(root, target, reports=None):
    root, target = root.resolve(), target.resolve()
    target.mkdir(parents=True, exist_ok=True)
    for name in ('desktop-diagnostic.json', 'global/.dsh-workflow/desktop/desktop-host.json'):
        source = root / 'data' / name
        if source.is_file():
            text = source.read_text(errors='replace')
            try:
                value = json.loads(text)
            except ValueError:
                value = {'format': 'text', 'diagnostic': text}
            (target / ('owned-' + source.name)).write_text(json.dumps(scrub(value), indent=2) + '\n')
    ledger = root / 'probe-process.json'
    if reports is None or not ledger.is_file():
        return []
    process = json.loads(ledger.read_text())
    pid = process['pid']
    expected = str(Path(process['executable']).resolve())
    if not expected.startswith(str(root / 'candidate.app') + '/') or not isinstance(pid, int) or pid <= 1:
        raise ValueError('Unowned application ledger')
    started = datetime.datetime.fromisoformat(process['startedAt']).timestamp()
    matches = []
    for directory in reports:
        for source in directory.glob('DSH Workflow*'):
            if source.suffix not in ('.ips', '.crash') or source.stat().st_mtime < started - 5:
                continue
            text = source.read_text(errors='replace')
            if source.suffix == '.ips':
                values = []
                decoder, rest = json.JSONDecoder(), text.lstrip()
                while rest:
                    try:
                        value, end = decoder.raw_decode(rest)
                        values.append(value)
                        rest = rest[end:].lstrip()
                    except ValueError:
                        break
                owned = any(isinstance(value, dict) and value.get('pid') == pid and
                            isinstance(value.get('procPath'), str) and str(Path(value['procPath']).resolve()) == expected for value in values)
                cleaned = '\n'.join(json.dumps(scrub(value), indent=2) for value in values)
            else:
                owned = bool(re.search(r'^Process:\s+DSH Workflow\s+\[' + str(pid) + r'\]', text, re.M)
                             and re.search(r'^Path:\s+' + re.escape(expected) + r'\s*$', text, re.M))
                cleaned = scrub(text)
            if owned:
                destination = target / source.name
                destination.write_text(cleaned + '\n')
                matches.append({'file': source.name, 'pid': pid, 'path': expected})
    (target / 'owned-crash-reports.json').write_text(json.dumps(matches, indent=2) + '\n')
    return matches


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('--crashes', action='store_true')
    args = parser.parse_args()
    reports = None
    if args.crashes:
        reports = [Path.home() / 'Library/Logs/DiagnosticReports', Path('/Library/Logs/DiagnosticReports')]
    collect(args.root, args.target, reports)
