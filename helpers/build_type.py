from enum import Enum
from typing import Any, Dict, List, Optional
import os


class BuildType(Enum):
    CPU_ONLY = "cpu"
    FULL_GPU = "fullgpu"
    HYBRID_GPU = "hybridgpu"
    STANDARD = "standard"


def get_build_type() -> BuildType:
    variant = os.getenv("BUILD_VARIANT", "").lower().strip()

    if variant == "hybridgpu":
        return BuildType.HYBRID_GPU
    elif variant == "fullgpu":
        return BuildType.FULL_GPU
    elif variant == "standard":
        return BuildType.STANDARD
    elif variant == "cpu":
        return BuildType.CPU_ONLY

    pytorch_variant = os.getenv("PYTORCH_VARIANT", "cpu").lower()
    is_remote_worker_build = os.getenv("A0_TTS_REMOTE_WORKER", "false").lower() == "true"

    if is_remote_worker_build:
        return BuildType.HYBRID_GPU
    elif pytorch_variant == "cuda":
        return BuildType.FULL_GPU

    return BuildType.CPU_ONLY


def get_build_type_label(build_type: Optional[BuildType] = None) -> str:
    if build_type is None:
        build_type = get_build_type()

    labels = {
        BuildType.CPU_ONLY: "CPU-only",
        BuildType.FULL_GPU: "Full GPU",
        BuildType.HYBRID_GPU: "Hybrid GPU",
        BuildType.STANDARD: "Standard",
    }
    return labels.get(build_type, "Unknown")


def get_tts_device_options(build_type: Optional[BuildType] = None) -> List[Dict[str, str]]:
    if build_type is None:
        build_type = get_build_type()

    options: List[Dict[str, str]] = [
        {"value": "auto", "label": "Auto (recommended)"},
        {"value": "cpu", "label": "CPU"},
    ]

    if build_type == BuildType.FULL_GPU:
        try:
            from helpers.device_utils import enumerate_devices
            devices = enumerate_devices()
            if devices.get("cuda", {}).get("available"):
                options.append({"value": "cuda:auto", "label": "CUDA: Auto"})
                for d in devices.get("cuda", {}).get("devices", []):
                    options.append({
                        "value": f"cuda:{d['index']}",
                        "label": f"CUDA: GPU {d['index']} \u2013 {d['name']} ({d['memory_total']})",
                    })
        except Exception:
            options.append({"value": "cuda:auto", "label": "CUDA: Auto"})

    elif build_type == BuildType.HYBRID_GPU:
        options.append({
            "value": "remote",
            "label": "Remote GPU (worker) - Extend with any TTS endpoint"
        })
    elif build_type == BuildType.STANDARD:
        enable_remote = os.getenv("A0_ENABLE_REMOTE_TTS", "false").lower() == "true"
        if enable_remote:
            options.append({
                "value": "remote",
                "label": "Remote GPU (worker) - Optional add-on"
            })

    return options


def get_stt_device_options(build_type: Optional[BuildType] = None) -> List[Dict[str, str]]:
    if build_type is None:
        build_type = get_build_type()

    options: List[Dict[str, str]] = [
        {"value": "auto", "label": "Auto (recommended)"},
        {"value": "cpu", "label": "CPU"},
    ]

    if build_type == BuildType.FULL_GPU:
        try:
            from helpers.device_utils import enumerate_devices
            devices = enumerate_devices()
            if devices.get("cuda", {}).get("available"):
                options.append({"value": "cuda:auto", "label": "CUDA: Auto"})
                for d in devices.get("cuda", {}).get("devices", []):
                    options.append({
                        "value": f"cuda:{d['index']}",
                        "label": f"CUDA: GPU {d['index']} \u2013 {d['name']} ({d['memory_total']})",
                    })
        except Exception:
            options.append({"value": "cuda:auto", "label": "CUDA: Auto"})

    return options


def get_stt_defaults(build_type: Optional[BuildType] = None) -> Dict[str, Any]:
    if build_type is None:
        build_type = get_build_type()

    if build_type == BuildType.FULL_GPU:
        return {"stt_device": "cuda:auto"}
    return {"stt_device": "auto"}


def get_tts_defaults(build_type: Optional[BuildType] = None) -> Dict[str, Any]:
    if build_type is None:
        build_type = get_build_type()

    defaults: Dict[str, Any] = {
        "tts_kokoro": True,
        "tts_kokoro_voice": "am_michael",
        "tts_kokoro_voice_secondary": "",
        "tts_kokoro_voice_blend": 50,
        "tts_kokoro_speed": 1.1,
    }

    if build_type == BuildType.HYBRID_GPU:
        defaults.update({
            "tts_device": "remote",
            "tts_kokoro_remote_url": "http://kokoro-gpu-worker:8891",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })
    elif build_type == BuildType.FULL_GPU:
        defaults.update({
            "tts_device": "cuda:auto",
            "tts_kokoro_remote_url": "",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })
    elif build_type == BuildType.STANDARD:
        enable_remote = os.getenv("A0_ENABLE_REMOTE_TTS", "false").lower() == "true"
        if enable_remote:
            defaults.update({
                "tts_device": "remote",
                "tts_kokoro_remote_url": "http://kokoro-gpu-worker:8891",
                "tts_kokoro_remote_token": "",
                "tts_kokoro_remote_timeout": 20,
            })
        else:
            defaults.update({
                "tts_device": "auto",
                "tts_kokoro_remote_url": "",
                "tts_kokoro_remote_token": "",
                "tts_kokoro_remote_timeout": 20,
            })
    else:
        defaults.update({
            "tts_device": "auto",
            "tts_kokoro_remote_url": "",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })

    return defaults


def is_setting_visible(setting_id: str, build_type: Optional[BuildType] = None) -> bool:
    if build_type is None:
        build_type = get_build_type()

    hybrid_only_settings = {
        "tts_kokoro_remote_url",
        "tts_kokoro_remote_token",
        "tts_kokoro_remote_timeout",
    }

    if setting_id in hybrid_only_settings:
        if build_type == BuildType.HYBRID_GPU:
            return True
        if build_type == BuildType.STANDARD:
            return os.getenv("A0_ENABLE_REMOTE_TTS", "false").lower() == "true"
        return False

    return True


def get_tts_description(build_type: Optional[BuildType] = None) -> str:
    if build_type is None:
        build_type = get_build_type()

    base_description = "Enable higher quality server-side AI text-to-speech."

    if build_type == BuildType.HYBRID_GPU:
        return (
            f"{base_description} This build supports extending TTS capabilities "
            "with any TTS model that supports endpoint APIs via the remote worker option. "
            "Kokoro is the default TTS model."
        )
    elif build_type == BuildType.FULL_GPU:
        return (
            f"{base_description} This build has GPU acceleration enabled in the main "
            "container for Kokoro TTS (default model)."
        )
    else:
        return f"{base_description} Kokoro is the default TTS model."


def get_tts_device_description(build_type: Optional[BuildType] = None) -> str:
    if build_type is None:
        build_type = get_build_type()

    base_description = "Select the device used for TTS synthesis."

    if build_type == BuildType.HYBRID_GPU:
        return (
            f"{base_description} Use 'Remote GPU (worker)' to extend with any "
            "TTS model that supports endpoint APIs."
        )
    elif build_type == BuildType.FULL_GPU:
        return f"{base_description} This build has GPU acceleration enabled in the main container."
    else:
        return base_description
