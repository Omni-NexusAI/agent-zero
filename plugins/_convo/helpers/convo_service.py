"""Lazy singleton. Importing the plugin never loads a model or starts a service."""
from __future__ import annotations

import importlib
import threading
from pathlib import Path

from .convo_contract import validate_settings
from .convo_host import Compactor, Dispatcher, Host
from .convo_store import Store

_instance = None
_lock = threading.Lock()


def runtime_root():
    plugin_root = Path(__file__).resolve().parents[1]
    parent = plugin_root.parent.parent
    return parent.parent if parent.name == "usr" else parent


def settings():
    from helpers import plugins
    raw = plugins.get_plugin_config("_convo") or {}
    config = validate_settings(raw.get("convo", {}))
    if plugins.get_toggle_state("_convo") == "disabled":
        config["enabled"] = False
    return config


class Service:
    def __init__(self, root=None, host=None):
        self.root = Path(root or runtime_root() / "usr" / "plugins")
        data = self.root / "_convo" / "data"
        data.mkdir(parents=True, exist_ok=True)
        self.store = Store(data / "convo.sqlite3")
        self.host = host or Host()
        self.dispatcher = Dispatcher(self.store, self.host)
        self.compactor = Compactor(self.store, self.host)
        self.persona_cache = {}


def service():
    global _instance
    with _lock:
        if _instance is None:
            # Plugin module refresh must not create a second dispatcher or reset an
            # existing process's active sessions. The host runtime outlives plugins.
            from helpers import runtime
            if not hasattr(runtime, "_convo_service"):
                runtime._convo_service = Service()
            _instance = runtime._convo_service
        return _instance


def load_from_api(filename):
    root = Path(filename).resolve().parent.parent
    prefix = "usr.plugins" if root.parent.parent.name == "usr" else "plugins"
    return importlib.import_module(prefix + "._convo.helpers.convo_service")
