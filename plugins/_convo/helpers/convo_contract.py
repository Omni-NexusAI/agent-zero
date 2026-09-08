"""Dependency-free, fail-closed contracts shared by host and sidecar."""
from __future__ import annotations

import copy
import base64
import binascii
import io
import ipaddress
import math
import os
import wave
from dataclasses import asdict, dataclass, fields
from urllib.parse import urlsplit


class ContractError(ValueError):
    pass


@dataclass(frozen=True)
class Capabilities:
    audio_input: bool = False
    incremental_input: bool = False
    audio_output: bool = False
    duplex: bool = False
    cancellation: bool = False
    tool_calls: bool = False
    cloning: bool = False
    voice_design: bool = False
    instruction_control: bool = False
    model_lifecycle: bool = False
    native_pcm: bool = False

    @classmethod
    def parse(cls, value):
        if not isinstance(value, dict):
            raise ContractError("Capabilities must be an object")
        known = {f.name for f in fields(cls)}
        if set(value) - known or any(type(v) is not bool for v in value.values()):
            raise ContractError("Unknown or non-boolean capability")
        result = cls(**value)
        if result.incremental_input and not result.audio_input:
            raise ContractError("Incremental input requires audio input")
        if result.duplex and not (result.incremental_input and result.audio_output and result.cancellation):
            raise ContractError("Duplex requires incremental audio, output and cancellation")
        return result

    def public(self):
        return asdict(self)


def merge(*values):
    """Deep merge; preserve unknown fields and explicit false/empty values."""
    result = {}
    for value in values:
        for key, item in (value or {}).items():
            result[key] = merge(result.get(key, {}), item) if isinstance(item, dict) and isinstance(result.get(key, {}), dict) else copy.deepcopy(item)
    return result


DEFAULTS = {
    "enabled": False,
    "ambient_enabled": False,
    "remote_ambient_consent": False,
    "transcription_enabled": False,
    "developer_mode": False,
    "style": "",
    "activation_names": [],
    "hotkey": "Ctrl+Shift+Space",
    "sidecar": {"url": "http://convo-runtime:8090", "token_env": "CONVO_SIDECAR_TOKEN", "remote": False},
    "roles": {
        "conversation": {"url": "http://host.docker.internal:8080/v1", "model": "", "token_env": "", "remote": False, "capabilities": {"audio_input": True, "cancellation": True, "tool_calls": True}},
        "classifier": {"url": "", "model": "", "token_env": "", "remote": False, "capabilities": {"audio_input": True, "cancellation": True}},
        "tts": {"backend": "openai", "url": "http://convo-audio:8080/v1", "model": "", "voice": "", "token_env": "", "remote": False, "capabilities": {"audio_output": True, "cloning": True}},
    },
    "compaction": {"trigger": 0.70, "target": 0.50, "recent_exchanges": 6, "context_tokens": 16384, "output_reserve": 2048},
    "direct_timeout": 30,
    "clarification_cooldown": 60,
    "audio_token_reserve": 4096,
    "max_audio_seconds": 20,
}


def endpoint(value):
    url = value.get("url", "").rstrip("/")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ContractError("Configure an explicit HTTP(S) endpoint without embedded credentials")
    host = parsed.hostname.lower()
    try:
        address = ipaddress.ip_address(host)
        local = address.is_loopback or (address.is_private and not address.is_link_local and not address.is_unspecified)
    except ValueError:
        local = host in {"localhost", "host.docker.internal", "convo-runtime", "convo-audio", "kokoro-worker"}
    if not local and not value.get("remote", False):
        raise ContractError("Remote endpoint requires explicit remote-provider opt-in")
    if not local and parsed.scheme != "https":
        raise ContractError("Remote providers require HTTPS")
    return url


def credentials(value):
    name = value.get("token_env", "")
    if name and (not isinstance(name, str) or not name.replace("_", "").isalnum()):
        raise ContractError("Token must reference an environment variable")
    token = os.environ.get(name, "") if name else ""
    return {"Authorization": "Bearer " + token} if token else {}


def validate_settings(value):
    if not isinstance(value, dict):
        raise ContractError("Convo settings must be an object")
    result = merge(DEFAULTS, value)
    for key in ("enabled", "ambient_enabled", "remote_ambient_consent", "transcription_enabled", "developer_mode"):
        if type(result[key]) is not bool:
            raise ContractError(key + " must be boolean")
    if not isinstance(result["roles"], dict) or not isinstance(result["sidecar"], dict):
        raise ContractError("Provider settings must be objects")
    if type(result["sidecar"].get("remote", False)) is not bool:
        raise ContractError("Sidecar remote consent must be boolean")
    for field in ("url", "token_env"):
        if not isinstance(result["sidecar"].get(field, ""), str):
            raise ContractError("Invalid sidecar field")
    for role in result["roles"].values():
        if not isinstance(role, dict) or type(role.get("remote", False)) is not bool:
            raise ContractError("Invalid role configuration")
        for field in ("url", "model", "voice", "token_env", "instructions"):
            if not isinstance(role.get(field, ""), str) or len(role.get(field, "")) > 2000:
                raise ContractError("Invalid provider field: " + field)
        Capabilities.parse(role.get("capabilities", {}))
        if role.get("url"):
            endpoint(role)
    endpoint(result["sidecar"])
    c = result["compaction"]
    if not isinstance(c, dict) or any(type(v) not in (float, int) or not math.isfinite(v) or v < 0 for v in c.values()):
        raise ContractError("Context budget must contain finite positive numbers")
    if any(type(c[key]) is not int for key in ("recent_exchanges", "context_tokens", "output_reserve")):
        raise ContractError("Context counts must be integers")
    for key in ("direct_timeout", "clarification_cooldown", "audio_token_reserve", "max_audio_seconds"):
        if type(result[key]) not in (float, int) or not math.isfinite(result[key]):
            raise ContractError("Invalid numeric setting: " + key)
    if not 1 <= result["max_audio_seconds"] <= 45 or not 1 <= result["audio_token_reserve"] <= c["context_tokens"]:
        raise ContractError("Configure a measured audio-token reserve and bounded audio turns")
    if not (0.1 <= c["target"] < c["trigger"] <= 0.9) or c["recent_exchanges"] < 6 or c["context_tokens"] <= c["output_reserve"]:
        raise ContractError("Invalid context budget")
    if not 0 < result["direct_timeout"] <= 30 or result["clarification_cooldown"] < 60:
        raise ContractError("Unsafe action deadline or clarification cooldown")
    if result["roles"]["tts"].get("backend", "openai") not in {"openai", "host_kokoro", "managed_audio"}:
        raise ContractError("Unknown speech adapter")
    if not isinstance(result["style"], str) or len(result["style"]) > 1600:
        raise ContractError("Voice style must be at most 1600 characters")
    if not isinstance(result["activation_names"], list) or len(result["activation_names"]) > 8 or any(not isinstance(n, str) or not 1 <= len(n) <= 80 for n in result["activation_names"]):
        raise ContractError("Configure at most eight activation names")
    hotkey = result["hotkey"]
    if not isinstance(hotkey, str) or len(hotkey) > 80:
        raise ContractError("Invalid focused-app shortcut")
    if hotkey:
        parts = hotkey.split("+")
        if not parts[-1] or any(p not in {"Ctrl", "Alt", "Shift", "Meta"} for p in parts[:-1]) or len(set(parts)) != len(parts):
            raise ContractError("Shortcut must use Ctrl, Alt, Shift or Meta modifiers and one key")
    return result


def validate_audio(audio, maximum=45):
    """Validate the actual payload, not the browser's duration declaration."""
    try:
        if not isinstance(audio, str) or not 0 < len(audio) <= 4 * 1024 * 1024:
            raise ValueError()
        raw = base64.b64decode(audio, validate=True)
        with wave.open(io.BytesIO(raw)) as wav:
            count, rate = wav.getnframes(), wav.getframerate()
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or rate not in (16000, 24000, 48000) or not 0 < count <= rate * maximum:
                raise ValueError()
            if len(wav.readframes(count)) != count * 2:
                raise ValueError()
    except (ValueError, TypeError, EOFError, wave.Error, binascii.Error) as exc:
        raise ContractError("Expected a bounded, complete mono PCM16 WAV turn") from exc
    return audio


def public_settings(config):
    """Browser runtime needs neither endpoints nor credential/environment references."""
    return {key: copy.deepcopy(config[key]) for key in (
        "enabled", "ambient_enabled", "remote_ambient_consent", "transcription_enabled",
        "developer_mode", "hotkey", "max_audio_seconds", "activation_names") } | {
        "remote_processing": any(r.get("remote", False) for r in config["roles"].values()) or config["sidecar"].get("remote", False),
        "text_input_required": any(not r["capabilities"].get("audio_input", False) for k, r in config["roles"].items() if k in {"conversation", "classifier"}),
    }
