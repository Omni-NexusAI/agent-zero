"""Import the actual headless supervisor without touching a GPU or host storage."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx


ROOT = Path(__file__).resolve().parents[1] / 'sidecar/audiocpp'


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result; spec.loader.exec_module(result)
    return result


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def test_auth_and_route_allowlist_do_not_start_models(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'config.json'
            config.write_text((ROOT / 'qwen3-tts-base-f16.json').read_text())
            path_before = list(sys.path)
            try:
                with patch.dict(sys.modules), patch.dict(os.environ, {'AUDIO_CPP_CONFIG_TEMPLATE':str(config), 'VOICE_LIBRARY_DIR':tmp, 'CONVO_AUDIO_TOKEN':'unit-test-only-audio-token-000000'}), patch('subprocess.Popen', side_effect=AssertionError('No processes permitted')), patch('logging.basicConfig'):
                    supervisor = module('supervisor', 'supervisor.py')
                    module('downloads', 'downloads.py')
                    gateway = module('convo_gateway_test', 'gateway.py')
                    await supervisor.startup()
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app), base_url='http://audio') as client:
                        response = await client.get('/convo/catalog')
                        self.assertEqual(response.status_code, 401)
                        headers = {'Authorization':'Bearer unit-test-only-audio-token-000000'}
                        response = await client.get('/convo/catalog', headers=headers)
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(len(response.json()['models']), 2)
                        response = await client.post('/control/gpu-guard', headers=headers, json={'mode':'disabled'})
                        self.assertEqual(response.status_code, 404)
                        response = await client.post('/v1/voice-studio/llamacpp-audio-turn/stream', headers=headers, json={})
                        self.assertEqual(response.status_code, 404)
                    self.assertEqual(supervisor.state['state'], 'unloaded')
            finally: sys.path[:] = path_before


if __name__ == '__main__': unittest.main()
