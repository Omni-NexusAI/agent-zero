"""Lazy singleton. Importing the plugin never loads a model or starts a service."""
from __future__ import annotations

import importlib
import asyncio
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
        self.connections = {}
        self.connection_lock = threading.RLock()
        self.disabled = False

    def register_connection(self, handler, sid):
        with self.connection_lock:
            if self.disabled:
                raise ValueError('Convo was disabled during session setup')
            self.connections[(id(handler), sid)] = (asyncio.get_running_loop(), handler, sid)

    def forget_connection(self, handler, sid):
        with self.connection_lock:
            self.connections.pop((id(handler), sid), None)

    def deactivate(self):
        with self.connection_lock:
            self.disabled = True
        self.dispatcher.pause()
        with self.store.lock:
            sessions = list(self.store.db.execute('SELECT id,owner FROM sessions WHERE active=1'))
            for row in sessions:
                self.store.stop(row['id'], row['owner'])
        with self.connection_lock:
            connections, self.connections = list(self.connections.values()), {}
        for loop, handler, sid in connections:
            if not loop.is_closed():
                # Cancels microphone session/compaction on its owning loop. Never
                # kill the host agent, loaded models, or a delegated job.
                loop.call_soon_threadsafe(lambda h=handler, s=sid: asyncio.create_task(h.disable(s)))


def service():
    global _instance
    from . import lifecycle
    if not lifecycle.enabled():
        raise ValueError('Convo is disabled')
    with _lock:
        if _instance is None:
            # Plugin module refresh must not create a second dispatcher or reset an
            # existing process's active sessions. The host runtime outlives plugins.
            from helpers import runtime
            if not hasattr(runtime, "_convo_service"):
                runtime._convo_service = Service()
            _instance = runtime._convo_service
        control = lifecycle.state()
        with control.lock:
            if control.blocked or control.disabling:
                raise ValueError('Convo is disabled or updating; explicitly re-enable it before starting')
            with _instance.connection_lock:
                _instance.disabled = False
            control.register('service', _instance.deactivate)
        return _instance


def load_from_api(filename):
    root = Path(filename).resolve().parent.parent
    prefix = "usr.plugins" if root.parent.parent.name == "usr" else "plugins"
    return importlib.import_module(prefix + "._convo.helpers.convo_service")
