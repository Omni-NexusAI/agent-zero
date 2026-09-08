import json
import tempfile
import unittest
from pathlib import Path

from usr.plugins.plugin_doctor.helpers.diagnostics import inspect, locate


class DiagnosticsTests(unittest.TestCase):
    def test_disabled_broken_code_is_diagnosed_without_execution_or_config_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); target=root/'broken'; target.mkdir()
            (target/'plugin.yaml').write_text('name: broken\ntitle: Broken\n')
            (target/'.toggle-0').write_text('')
            (target/'hooks.py').write_text('raise RuntimeError("MUST_NOT_EXECUTE")\ndef bad(:\n')
            (target/'config.json').write_text('{"token":"SECRET_DO_NOT_READ"}')
            (target/'default_config.yaml').write_text('token: SECRET_DO_NOT_READ')
            report=inspect([root],'broken')
            self.assertFalse(report['passed']); self.assertFalse(report['executed_target_code'])
            self.assertEqual(report['issues'][0]['file'],'hooks.py')
            self.assertNotIn('SECRET_DO_NOT_READ',json.dumps(report))
            self.assertTrue((target/'.toggle-0').is_file())

    def test_invalid_path_and_oversized_source_fail_safely(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ('../escape','bad/name','',None,'a.b'):
                with self.assertRaises(ValueError): locate([tmp],name)
            target=Path(tmp)/'ok'; target.mkdir()
            (target/'plugin.yaml').write_text('name: ok\ntitle: OK\n')
            (target/'huge.py').write_bytes(b' '*(2*1024*1024+1))
            report=inspect([tmp],'ok')
            self.assertTrue(report['truncated']); self.assertFalse(report['passed'])
