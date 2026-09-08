"""Permit a new session only after the native ON transaction has completed."""
import importlib
from pathlib import Path
from helpers.extension import Extension


class ConvoResume(Extension):
    def execute(self, data=None, **kwargs):
        args = (data or {}).get('args', ())
        values = (data or {}).get('kwargs', {})
        if values.get('plugin_name', args[0] if args else None) != '_convo':
            return
        if values.get('enabled', args[1] if len(args) > 1 else None) is not True:
            return
        root = next(p for p in Path(__file__).resolve().parents if p.name == '_convo')
        prefix = 'usr.plugins' if root.parent.parent.name == 'usr' else 'plugins'
        lifecycle = importlib.import_module(prefix + '._convo.helpers.lifecycle')
        control = lifecycle.state()
        with control.lock:
            if lifecycle.enabled() and not control.disabling:
                control.blocked = False
