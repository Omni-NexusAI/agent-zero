"""Actual host loader/toggle and provider restoration, with empty tmpfs user state."""
import importlib
import asyncio
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


class HostSmoke(unittest.TestCase):
    def test_doctor_diagnoses_disabled_broken_plugin_without_target_import(self):
        from helpers import plugins
        from usr.plugins.plugin_doctor.api.diagnose import Diagnose
        target = Path('usr/plugins/convo_broken_fixture')
        target.mkdir(parents=True,exist_ok=True)
        (target/'plugin.yaml').write_text('name: convo_broken_fixture\ntitle: Broken fixture\n')
        (target/'.toggle-0').write_text('')
        (target/'hooks.py').write_text('raise RuntimeError("Never execute")\ndef broken(:\n')
        (target/'config.json').write_text('{"private_token":"do-not-return"}')
        handler = Diagnose.__new__(Diagnose)
        report = asyncio.run(handler.process({'target':'convo_broken_fixture'},None))
        self.assertEqual(report['toggle'],'disabled')
        self.assertFalse(report['report']['passed'])
        self.assertNotIn('do-not-return',json.dumps(report))
        with self.assertRaises(ValueError):
            asyncio.run(handler.process({'action':'refresh_disabled','target':'convo_broken_fixture'},None))
        # A test-owned source repair, not code execution by the diagnostic API.
        (target/'hooks.py').write_text('value = "fixed"\n')
        with patch.object(plugins,'send_frontend_reload_notification'):
            result=asyncio.run(handler.process({'action':'refresh_disabled','target':'convo_broken_fixture','confirmed':True},None))
        self.assertEqual(result['toggle'],'disabled')
        self.assertTrue(asyncio.run(handler.process({'target':'convo_broken_fixture'},None))['report']['passed'])
        self.assertFalse(any('convo_broken_fixture' in key for key in sys.modules))
        print('DOCTOR_PASS: diagnose broken OFF plugin, repair, refresh, remain OFF; target never imported.')

    def test_host_loader_disable_fix_reenable(self):
        from helpers import plugins
        from plugins._convo.helpers import lifecycle
        roots = plugins.get_plugin_roots()
        self.assertTrue(any('plugins' in str(root) for root in roots))
        # Quiet only frontend notification delivery: actual toggle files, host
        # extension discovery, config reader and cache invalidation stay real.
        with patch.object(plugins, 'send_frontend_reload_notification'):
            plugins.toggle_plugin('_convo', True)
            self.assertNotEqual(plugins.get_toggle_state('_convo'), 'disabled')
            providers = []
            for name, fields in (
                ('plugins._kokoro_tts.helpers.runtime', ['normalize_config','get_config','synthesize_sentences','is_downloaded']),
                ('plugins._whisper_stt.helpers.runtime', ['normalize_config']),
            ):
                module = importlib.import_module(name)
                providers.extend((module, field, getattr(module,field)) for field in fields)
                if hasattr(module,'whisper'):
                    providers.append((module.whisper,'load_model',module.whisper.load_model))
            for cycle in range(3):
                plugins.toggle_plugin('_convo', True)
                self.assertFalse(lifecycle.state().blocked)
                for name in ('kokoro_adapter', 'whisper_adapter'):
                    self.assertTrue(importlib.import_module('plugins._convo.helpers.'+name).patch_runtime())
                self.assertTrue(lifecycle.state().patches)
                plugins.toggle_plugin('_convo', False)
                self.assertEqual(plugins.get_toggle_state('_convo'), 'disabled')
                self.assertTrue(lifecycle.state().blocked)
                self.assertEqual(lifecycle.state().patches, [])
                for module, field, original in providers:
                    self.assertIs(getattr(module,field),original,field)
            self.assertFalse(any('_convo' in p for p in plugins.get_enabled_plugin_paths(None)))
            print('HOST_RECOVERY_PASS: three enable/disable cycles, original provider functions restored; same process/image.')


if __name__ == '__main__':
    if os.environ.get('CONVO_ISOLATED_TEST') != '1':
        raise SystemExit('Only run via the isolated in-image runner.')
    # Do not start app initialization, agents, model workers, sockets or watchers.
    unittest.main()
