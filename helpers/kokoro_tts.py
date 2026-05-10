# kokoro_tts.py

import base64
import io
import warnings
import asyncio
import aiohttp
import numpy as np
import soundfile as sf
import threading
import torch
from helpers import runtime
from helpers.print_style import PrintStyle
from helpers import settings as settings_helper
from helpers.device_utils import resolve_device, log_device_resolution
from helpers.notification import NotificationManager, NotificationType, NotificationPriority

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

_pipeline = None
_voice = "am_puck,am_onyx"
_voice_blend = 50
_speed = 1.1
_device_policy = "auto"
_current_device = None
is_updating_model = False
_reload_lock = threading.Lock()
DEFAULT_REMOTE_TIMEOUT = 60.0


async def preload():
    try:
        return await _preload()
    except Exception as e:
        raise e


async def _preload():
    global _pipeline, is_updating_model, _device_policy, _current_device

    while is_updating_model:
        await asyncio.sleep(0.1)

    try:
        is_updating_model = True
        if not _pipeline:
            try:
                current_settings = settings_helper.get_settings()
                _device_policy = current_settings.get("tts_device", "auto")
                _apply_runtime_defaults(current_settings)
            except Exception:
                _device_policy = "auto"

            if _is_remote_policy(_device_policy):
                _current_device = "remote"
                return

            torch_device, meta = resolve_device(_device_policy)

            NotificationManager.send_notification(
                NotificationType.INFO,
                NotificationPriority.NORMAL,
                message=f"Loading Kokoro TTS model on {torch_device}...",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-preload",
            )
            PrintStyle.standard(f"Loading Kokoro TTS model on {torch_device}...")
            log_device_resolution(torch_device, meta)

            from kokoro import KPipeline
            _pipeline = KPipeline(
                lang_code="a",
                repo_id="hexgrad/Kokoro-82M",
                device=torch_device,
            )
            _current_device = torch_device

            NotificationManager.send_notification(
                NotificationType.SUCCESS,
                NotificationPriority.NORMAL,
                message=f"Kokoro TTS model loaded on {torch_device} successfully.",
                title="Kokoro TTS",
                display_time=3,
                group="kokoro-preload",
            )
            PrintStyle.standard(f"Kokoro TTS model loaded on {torch_device} successfully.")
    finally:
        is_updating_model = False


def _apply_runtime_defaults(current_settings: dict):
    global _voice, _voice_blend, _speed
    _voice = current_settings.get("tts_kokoro_voice", _voice)
    try:
        _voice_blend = int(current_settings.get("tts_kokoro_voice_blend", _voice_blend))
    except Exception:
        pass
    try:
        _speed = float(current_settings.get("tts_kokoro_speed", _speed))
    except Exception:
        pass


async def is_downloading():
    try:
        return _is_downloading()
    except Exception as e:
        raise e


def _is_downloading():
    return is_updating_model

async def is_downloaded():
    try:
        return _is_downloaded()
    except Exception as e:
        raise e

def _is_downloaded():
    return _pipeline is not None


def set_voice(voice: str):
    global _voice
    _voice = voice


def set_voice_blend(blend: int):
    global _voice_blend
    _voice_blend = max(1, min(99, int(blend)))


def set_speed(speed: float):
    global _speed
    _speed = speed


def set_device_policy(policy: str):
    global _device_policy, _pipeline
    if policy != _device_policy:
        _device_policy = policy
        _pipeline = None


async def reload_model(device_policy: str):
    try:
        return await _reload_model(device_policy)
    except Exception as e:
        raise e


async def _reload_model(device_policy: str):
    global _pipeline, _device_policy, _current_device, is_updating_model, _reload_lock

    with _reload_lock:
        if _is_remote_policy(device_policy):
            _pipeline = None
            _device_policy = device_policy
            _current_device = "remote"
            return True

        new_device, meta = resolve_device(device_policy)
        if _current_device == new_device and _pipeline is not None:
            return True

        NotificationManager.send_notification(
            NotificationType.INFO,
            NotificationPriority.HIGH,
            message=f"Loading Kokoro TTS model on {new_device}...",
            title="Kokoro TTS",
            display_time=5,
            group="kokoro-reload",
        )
        PrintStyle.standard(f"Reloading Kokoro TTS model on {new_device}...")

        while is_updating_model:
            await asyncio.sleep(0.1)

        try:
            is_updating_model = True

            if _pipeline:
                try:
                    if _current_device and "cuda" in str(_current_device).lower():
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                except Exception as e:
                    PrintStyle.error(f"Error clearing CUDA cache: {e}")

                _pipeline = None

            _device_policy = device_policy
            log_device_resolution(new_device, meta)

            from kokoro import KPipeline
            _pipeline = KPipeline(
                lang_code="a",
                repo_id="hexgrad/Kokoro-82M",
                device=new_device,
            )
            _current_device = new_device

            NotificationManager.send_notification(
                NotificationType.SUCCESS,
                NotificationPriority.HIGH,
                message=f"Kokoro TTS model loaded on {new_device} successfully.",
                title="Kokoro TTS",
                display_time=3,
                group="kokoro-reload",
            )
            PrintStyle.standard(f"Kokoro TTS model loaded on {new_device} successfully.")

            return True

        except Exception as e:
            PrintStyle.error(f"Failed to reload Kokoro TTS model: {e}")
            NotificationManager.send_notification(
                NotificationType.ERROR,
                NotificationPriority.HIGH,
                message=f"Failed to reload Kokoro TTS model: {e}",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-reload",
            )
            return False
        finally:
            is_updating_model = False


async def synthesize_sentences(
    sentences: list[str],
    voice: str | None = None,
    blend_voice: str | None = None,
    blend_ratio: int | None = None,
):
    """Generate audio for multiple sentences and return concatenated base64 audio"""
    try:
        return await _synthesize_sentences(sentences, voice, blend_voice, blend_ratio)
    except Exception as e:
        raise e


async def _synthesize_sentences(
    sentences: list[str],
    voice: str | None = None,
    blend_voice: str | None = None,
    blend_ratio: int | None = None,
):
    current_settings = settings_helper.get_settings()
    effective_blend_voice = (
        blend_voice if blend_voice is not None else current_settings.get("tts_kokoro_voice_secondary")
    )
    if isinstance(effective_blend_voice, str):
        effective_blend_voice = effective_blend_voice.strip()
    if not effective_blend_voice:
        effective_blend_voice = None

    policy = current_settings.get("tts_device", "auto")
    if _is_remote_policy(policy):
        PrintStyle.standard("Kokoro TTS: delegating synthesis to remote worker.")
        return await _synthesize_remote(
            sentences,
            voice,
            effective_blend_voice,
            blend_ratio,
            current_settings,
        )

    await _preload()

    combined_audio = []

    try:
        for sentence in sentences:
            text = sentence.strip()
            if not text:
                continue

            primary_voice = voice or _voice
            if effective_blend_voice:
                try:
                    v1 = _pipeline.load_single_voice(primary_voice)
                    v2 = _pipeline.load_single_voice(effective_blend_voice)
                    ratio = blend_ratio if blend_ratio is not None else _voice_blend
                    ratio = max(1, min(99, int(ratio)))
                    r1 = ratio / 100.0
                    r2 = 1.0 - r1
                    use_voice = v1 * r1 + v2 * r2
                except Exception as e:
                    PrintStyle.error(f"Failed to blend voices: {e}")
                    use_voice = primary_voice
            else:
                use_voice = primary_voice

            segments = _pipeline(
                text,
                voice=use_voice,
                speed=_speed,
            )  # type: ignore
            segment_list = list(segments)

            for segment in segment_list:
                audio_tensor = segment.audio
                audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
                combined_audio.extend(audio_numpy)

        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format="WAV")
        audio_bytes = buffer.getvalue()

        return base64.b64encode(audio_bytes).decode("utf-8")

    except Exception as e:
        PrintStyle.error(f"Error in Kokoro TTS synthesis: {e}")
        raise


def _is_remote_policy(policy: str | None) -> bool:
    return bool(policy and policy.lower().startswith("remote"))


def is_remote_policy(policy: str | None) -> bool:
    return _is_remote_policy(policy)


async def _synthesize_remote(
    sentences: list[str],
    voice: str | None,
    blend_voice: str | None,
    blend_ratio: int | None,
    settings: dict,
) -> str:
    remote_url = (settings.get("tts_kokoro_remote_url") or "").rstrip("/")
    if not remote_url:
        raise RuntimeError("Remote Kokoro worker URL is not configured.")

    token = settings.get("tts_kokoro_remote_token") or ""
    timeout_sec = float(settings.get("tts_kokoro_remote_timeout", DEFAULT_REMOTE_TIMEOUT))
    ratio = blend_ratio if blend_ratio is not None else int(settings.get("tts_kokoro_voice_blend", _voice_blend))
    ratio = max(1, min(99, int(ratio)))
    payload = {
        "sentences": sentences,
        "voice": voice or _voice,
        "voice2": blend_voice or settings.get("tts_kokoro_voice_secondary") or "",
        "blend": ratio,
        "speed": float(settings.get("tts_kokoro_speed", _speed)),
    }

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=timeout_sec)
    ) as session:
        async with session.post(
            f"{remote_url}/synthesize",
            json=payload,
            headers=_remote_headers(token),
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if not data.get("success"):
                raise RuntimeError(data.get("error") or "Remote worker error")
            return data["audio"]


def _remote_headers(token: str | None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"
    return headers


async def verify_remote_worker(
    url: str,
    token: str | None = None,
    timeout: float | None = None,
    *,
    notify: bool = False,
) -> bool:
    if not url:
        if notify:
            NotificationManager.send_notification(
                NotificationType.ERROR,
                NotificationPriority.HIGH,
                message="Remote Kokoro worker URL is not configured.",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-remote",
            )
        return False

    remote_url = url.rstrip("/")
    timeout_sec = timeout or DEFAULT_REMOTE_TIMEOUT

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=timeout_sec)
        ) as session:
            async with session.get(
                f"{remote_url}/health",
                headers=_remote_headers(token),
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
                if not data.get("success"):
                    raise RuntimeError(data.get("error") or "Remote worker reported failure")

        if notify:
            NotificationManager.send_notification(
                NotificationType.SUCCESS,
                NotificationPriority.NORMAL,
                message=f"Connected to remote Kokoro worker at {remote_url}",
                title="Kokoro TTS",
                display_time=3,
                group="kokoro-remote",
            )

        return True

    except Exception as exc:
        if notify:
            NotificationManager.send_notification(
                NotificationType.ERROR,
                NotificationPriority.HIGH,
                message=f"Failed to reach remote Kokoro worker: {exc}",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-remote",
            )
        return False
