import copy
import errno
import tempfile
import unittest
from pathlib import Path

from settings_repeat_gate import can_repeat, validate_root


class RepeatGateTest(unittest.TestCase):
    def test_unknown_or_incomplete_cleanup_never_allows_another_application(self):
        healthy = {
            'ownership': {'launcher': [11], 'desktop': [12], 'host': [13]},
            'processes': [{'pid': pid, 'state': 'gone', 'errno': errno.ESRCH, 'rawExit': 1, 'rawErrno': errno.ESRCH}
                          for pid in (11, 12, 13)],
            'receipt': {'errno': errno.ENOENT},
            'listener': {'exit': 1, 'stdout': '', 'stderr': ''},
            'bindListen': {'available': True},
        }
        self.assertTrue(can_repeat(healthy))
        variants = []
        for role in ('launcher', 'desktop', 'host'):
            row = copy.deepcopy(healthy); row['ownership'][role] = []; variants.append(row)
        for state, code in (('alive', None), ('unknown', errno.EPERM), ('gone', errno.EPERM)):
            row = copy.deepcopy(healthy); row['processes'][0].update(state=state, errno=code); variants.append(row)
        row = copy.deepcopy(healthy); row['receipt'] = {'errno': errno.EACCES}; variants.append(row)
        row = copy.deepcopy(healthy); row['listener']['stderr'] = 'lookup failed'; variants.append(row)
        row = copy.deepcopy(healthy); row['listener'].update(exit=0, stdout='p123'); variants.append(row)
        row = copy.deepcopy(healthy); row['bindListen']['available'] = False; variants.append(row)
        row = copy.deepcopy(healthy); row['processes'].pop(); variants.append(row)
        row = copy.deepcopy(healthy); row['ownership']['unknown'] = [14]; variants.append(row)
        row = copy.deepcopy(healthy); row['processes'][0]['rawErrno'] = errno.EPERM; variants.append(row)
        for row in variants:
            with self.subTest(row=row): self.assertFalse(can_repeat(row))

    def test_root_is_a_real_direct_owned_child_after_resolution(self):
        with tempfile.TemporaryDirectory() as temporary:
            runner = Path(temporary)
            root = runner / 'dsh-t05-owned'; root.mkdir()
            self.assertEqual(validate_root(str(root), runner), root.resolve())
            nested = root / 'dsh-t05-nested'; nested.mkdir()
            with self.assertRaises(ValueError): validate_root(str(nested), runner)
            alias = runner / 'dsh-t05-alias'; alias.symlink_to(root, target_is_directory=True)
            with self.assertRaises(ValueError): validate_root(str(alias), runner)


if __name__ == '__main__': unittest.main()
