"""Offline runner inside an existing host image; never install dependencies."""
import os
import subprocess
import sys
from pathlib import Path


def main():
    if os.environ.get('CONVO_ISOLATED_TEST') != '1' or Path.cwd() != Path('/git/agent-zero'):
        raise SystemExit('Use in-image.ps1: never run this against installed user settings.')
    # Each layer is a separate interpreter: unit-test doubles must not replace
    # the real host loader during the integration/lifecycle test.
    tests = Path(__file__).resolve().parent
    Path('usr/plugins').mkdir(parents=True, exist_ok=True)
    os.environ['LITELLM_LOCAL_MODEL_COST_MAP'] = 'True'
    commands = [
        [sys.executable, str(tests / 'host_smoke.py')],
        [sys.executable, '-m', 'unittest', '-v',
         'plugins._convo.tests.test_contracts', 'plugins._convo.tests.test_settings_bridge',
         'plugins._convo.tests.test_realtime', 'plugins._convo.tests.test_lifecycle'],
        [sys.executable, '-m', 'unittest', 'discover', '-s', 'usr/plugins/plugin_doctor/tests', '-v'],
    ]
    for command in commands:
        result = subprocess.run(command, timeout=180, check=False)
        if result.returncode:
            return result.returncode
    print('IN_IMAGE_PASS: host loader/recovery and isolated plugin contracts. No sidecar or listening certification.', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
