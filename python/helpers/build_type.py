"""
Build type detection and configuration for Agent Zero.

This module centralizes build type detection and provides configuration
functions for controlling which settings appear in the UI and their defaults
based on the build variant (CPU-only, Full GPU, Hybrid GPU).
"""

from enum import Enum
from typing import Any, Dict, List, Optional
import os


class BuildType(Enum):
    """Enumeration of supported Agent Zero build types."""
    CPU_ONLY = "cpu"
    FULL_GPU = "fullgpu"
    HYBRID_GPU = "hybridgpu"


def get_build_type() -> BuildType:
    """
    Detect the current build type from environment variables.
    
    Detection priority:
    1. BUILD_VARIANT environment variable (set during Docker build)
    2. Fallback detection based on PYTORCH_VARIANT and A0_TTS_REMOTE_WORKER
    
    Returns:
        BuildType: The detected build type
    """
    # Primary detection: BUILD_VARIANT set during Docker build
    variant = os.getenv("BUILD_VARIANT", "").lower().strip()
    
    if variant == "hybridgpu":
        return BuildType.HYBRID_GPU
    elif variant == "fullgpu":
        return BuildType.FULL_GPU
    elif variant == "cpu":
        return BuildType.CPU_ONLY
    
    # Fallback detection for legacy/runtime environments
    pytorch_variant = os.getenv("PYTORCH_VARIANT", "cpu").lower()
    is_remote_worker_build = os.getenv("A0_TTS_REMOTE_WORKER", "false").lower() == "true"
    
    if is_remote_worker_build:
        return BuildType.HYBRID_GPU
    elif pytorch_variant == "cuda":
        return BuildType.FULL_GPU
    
    return BuildType.CPU_ONLY


def get_build_type_label(build_type: Optional[BuildType] = None) -> str:
    """
    Get a human-readable label for the build type.
    
    Args:
        build_type: The build type to get label for. If None, detects current.
    
    Returns:
        str: Human-readable build type label
    """
    if build_type is None:
        build_type = get_build_type()
    
    labels = {
        BuildType.CPU_ONLY: "CPU-only",
        BuildType.FULL_GPU: "Full GPU",
        BuildType.HYBRID_GPU: "Hybrid GPU",
    }
    return labels.get(build_type, "Unknown")


def get_tts_device_options(build_type: Optional[BuildType] = None) -> List[Dict[str, str]]:
    """
    Return TTS device options based on build type.
    
    Args:
        build_type: The build type. If None, detects current.
    
    Returns:
        List of dicts with 'value' and 'label' keys for device options
    """
    if build_type is None:
        build_type = get_build_type()
    
    # Base options available for all builds
    options: List[Dict[str, str]] = [
        {"value": "auto", "label": "Auto (recommended)"},
        {"value": "cpu", "label": "CPU"},
    ]
    
    if build_type == BuildType.FULL_GPU:
        # Full GPU build: add CUDA device options
        try:
            from python.helpers.device_utils import enumerate_devices
            devices = enumerate_devices()
            if devices.get("cuda", {}).get("available"):
                options.append({"value": "cuda:auto", "label": "CUDA: Auto"})
                for d in devices.get("cuda", {}).get("devices", []):
                    options.append({
                        "value": f"cuda:{d['index']}",
                        "label": f"CUDA: GPU {d['index']} – {d['name']} ({d['memory_total']})",
                    })
        except Exception:
            # Fallback if CUDA detection fails
            options.append({"value": "cuda:auto", "label": "CUDA: Auto"})
    
    elif build_type == BuildType.HYBRID_GPU:
        # Hybrid GPU build: add remote worker option
        options.append({
            "value": "remote",
            "label": "Remote GPU (worker) - Extend with any TTS endpoint"
        })
    
    return options


def get_tts_defaults(build_type: Optional[BuildType] = None) -> Dict[str, Any]:
    """
    Return TTS default values based on build type.
    
    Args:
        build_type: The build type. If None, detects current.
    
    Returns:
        Dict with TTS setting defaults
    """
    if build_type is None:
        build_type = get_build_type()
    
    # Common defaults
    defaults: Dict[str, Any] = {
        "tts_kokoro": True,
        "tts_kokoro_voice": "am_michael",
        "tts_kokoro_voice_secondary": "",
        "tts_kokoro_speed": 1.1,
    }
    
    if build_type == BuildType.HYBRID_GPU:
        # Hybrid build defaults: use remote worker
        defaults.update({
            "tts_device": "remote",
            "tts_kokoro_remote_url": "http://kokoro-gpu-worker:8891",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })
    elif build_type == BuildType.FULL_GPU:
        # Full GPU build defaults: use CUDA auto
        defaults.update({
            "tts_device": "cuda:auto",
            "tts_kokoro_remote_url": "",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })
    else:
        # CPU-only build defaults
        defaults.update({
            "tts_device": "auto",
            "tts_kokoro_remote_url": "",
            "tts_kokoro_remote_token": "",
            "tts_kokoro_remote_timeout": 20,
        })
    
    return defaults


def is_setting_visible(setting_id: str, build_type: Optional[BuildType] = None) -> bool:
    """
    Check if a setting should be visible for this build type.
    
    Args:
        setting_id: The ID of the setting to check
        build_type: The build type. If None, detects current.
    
    Returns:
        bool: True if the setting should be visible
    """
    if build_type is None:
        build_type = get_build_type()
    
    # Settings that are only visible for Hybrid GPU builds
    hybrid_only_settings = {
        "tts_kokoro_remote_url",
        "tts_kokoro_remote_token",
        "tts_kokoro_remote_timeout",
    }
    
    # Settings that are only visible for Full GPU builds
    fullgpu_only_settings = {
        # Currently none - CUDA device selector is part of tts_device dropdown
    }
    
    if setting_id in hybrid_only_settings:
        return build_type == BuildType.HYBRID_GPU
    
    if setting_id in fullgpu_only_settings:
        return build_type == BuildType.FULL_GPU
    
    # All other settings are visible for all build types
    return True


def get_tts_description(build_type: Optional[BuildType] = None) -> str:
    """
    Get the TTS section description based on build type.
    
    Args:
        build_type: The build type. If None, detects current.
    
    Returns:
        str: HTML description for the TTS settings section
    """
    if build_type is None:
        build_type = get_build_type()
    
    base_description = "Enable higher quality server-side AI text-to-speech."
    
    if build_type == BuildType.HYBRID_GPU:
        return (
            f"{base_description} This build supports extending A0's TTS capabilities "
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
    """
    Get the TTS device setting description based on build type.
    
    Args:
        build_type: The build type. If None, detects current.
    
    Returns:
        str: Description for the TTS device dropdown
    """
    if build_type is None:
        build_type = get_build_type()
    
    base_description = "Select the device used for TTS synthesis."
    
    if build_type == BuildType.HYBRID_GPU:
        return (
            f"{base_description} Use 'Remote GPU (worker)' to extend A0 with any "
            "TTS model that supports endpoint APIs."
        )
    elif build_type == BuildType.FULL_GPU:
        return f"{base_description} This build has GPU acceleration enabled in the main container."
    else:
        return base_description


# Port configuration for Docker deployments
DEFAULT_PORTS = {
    BuildType.CPU_ONLY: {
        "container_name": "A0-cpu",
        "stack_name": "a0-cpu-custom",
        "external_port": 8891,
        "internal_port": 80,
    },
    BuildType.FULL_GPU: {
        "container_name": "A0-fullgpu",
        "stack_name": "a0-fullgpu-custom",
        "external_port": 8892,
        "internal_port": 80,
    },
    BuildType.HYBRID_GPU: {
        "main": {
            "container_name": "A0-hybrid",
            "stack_name": "a0-hybrid-custom",
            "external_port": 8893,
            "internal_port": 80,
        },
        "worker": {
            "container_name": "Kokoro-GPU-worker",
            "external_port": 8894,
            "internal_port": 8891,
        },
    },
}


def get_port_config(build_type: Optional[BuildType] = None) -> Dict[str, Any]:
    """
    Get the default port configuration for a build type.
    
    Args:
        build_type: The build type. If None, detects current.
    
    Returns:
        Dict with port configuration
    """
    if build_type is None:
        build_type = get_build_type()
    
    return DEFAULT_PORTS.get(build_type, DEFAULT_PORTS[BuildType.CPU_ONLY])
