"""Validate Convo settings before the host writes them; retain unknown fields."""
import importlib
from pathlib import Path


def save_plugin_config(settings=None, **kwargs):
    root = Path(__file__).resolve().parent
    prefix = "usr.plugins" if root.parent.parent.name == "usr" else "plugins"
    contract = importlib.import_module(prefix + "._convo.helpers.convo_contract")
    if not isinstance(settings, dict):
        raise ValueError("Plugin configuration must be an object")
    return {**settings, "convo": contract.validate_settings(settings.get("convo", {}))}
