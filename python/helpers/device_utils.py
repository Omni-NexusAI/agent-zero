# device_utils.py
# Device enumeration and policy resolution for Kokoro TTS

from typing import Dict, Any, Tuple, List
from python.helpers.print_style import PrintStyle


def enumerate_devices() -> Dict[str, Any]:
    """
    Enumerate available compute devices.
    
    Returns:
        dict: {
            "cpu": {"available": True},
            "cuda": {
                "available": bool,
                "count": int,
                "devices": [{"index": 0, "name": str, "memory_total": str, "memory_free": str}]
            }
        }
    """
    result: Dict[str, Any] = {
        "cpu": {"available": True}
    }
    
    # Check for CUDA
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        result["cuda"] = {
            "available": cuda_available,
            "count": torch.cuda.device_count() if cuda_available else 0,
            "devices": []
        }
        
        if cuda_available:
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                memory_total = props.total_memory / (1024**3)  # Convert to GB
                memory_free = (props.total_memory - torch.cuda.memory_allocated(i)) / (1024**3)
                
                result["cuda"]["devices"].append({
                    "index": i,
                    "name": props.name,
                    "memory_total": f"{memory_total:.1f} GB",
                    "memory_free": f"{memory_free:.1f} GB",
                    "compute_capability": f"{props.major}.{props.minor}"
                })
    except ImportError:
        result["cuda"] = {
            "available": False,
            "count": 0,
            "devices": [],
            "error": "PyTorch not installed"
        }
    except Exception as e:
        result["cuda"] = {
            "available": False,
            "count": 0,
            "devices": [],
            "error": str(e)
        }
    
    return result


def resolve_device(policy: str) -> Tuple[str, Dict[str, Any]]:
    """
    Resolve device policy string to torch device string and metadata.
    
    Args:
        policy: One of "auto", "cpu", "cuda:auto", "cuda:{index}"
        
    Returns:
        tuple: (torch_device_str, metadata_dict)
        
    Examples:
        >>> resolve_device("auto")
        ("cuda:0", {"policy": "auto", "resolved": "cuda:0", "reason": "CUDA available"})
        
        >>> resolve_device("cpu")
        ("cpu", {"policy": "cpu", "resolved": "cpu", "reason": "Explicit CPU"})
        
        >>> resolve_device("cuda:1")
        ("cuda:1", {"policy": "cuda:1", "resolved": "cuda:1", "reason": "Explicit GPU 1"})
    """
    policy = policy.lower().strip()
    metadata: Dict[str, Any] = {
        "policy": policy,
        "resolved": "cpu",
        "reason": "Default fallback",
        "warnings": []
    }
    
    try:
        import torch
    except ImportError:
        metadata["warnings"].append("PyTorch not installed, falling back to CPU")
        return "cpu", metadata
    
    # Handle "auto" policy
    if policy == "auto":
        if torch.cuda.is_available():
            device = "cuda:0"
            metadata["resolved"] = device
            metadata["reason"] = "CUDA available (auto-selected)"
        else:
            device = "cpu"
            metadata["resolved"] = device
            metadata["reason"] = "CUDA unavailable (auto-selected CPU)"
        return device, metadata
    
    # Handle explicit "cpu"
    if policy == "cpu":
        metadata["resolved"] = "cpu"
        metadata["reason"] = "Explicit CPU policy"
        return "cpu", metadata
    
    # Handle "cuda:auto"
    if policy == "cuda:auto":
        if not torch.cuda.is_available():
            metadata["warnings"].append("CUDA requested but unavailable, falling back to CPU")
            metadata["resolved"] = "cpu"
            metadata["reason"] = "CUDA unavailable"
            return "cpu", metadata
        device = "cuda:0"  # Default to first GPU
        metadata["resolved"] = device
        metadata["reason"] = "CUDA auto-select (GPU 0)"
        return device, metadata
    
    # Handle "cuda:{index}"
    if policy.startswith("cuda:"):
        try:
            gpu_index_str = policy.split(":", 1)[1]
            gpu_index = int(gpu_index_str)
            
            if not torch.cuda.is_available():
                metadata["warnings"].append(f"CUDA GPU {gpu_index} requested but CUDA unavailable, falling back to CPU")
                metadata["resolved"] = "cpu"
                metadata["reason"] = "CUDA unavailable"
                return "cpu", metadata
            
            if gpu_index < 0 or gpu_index >= torch.cuda.device_count():
                metadata["warnings"].append(
                    f"GPU {gpu_index} requested but only {torch.cuda.device_count()} GPU(s) available, falling back to CPU"
                )
                metadata["resolved"] = "cpu"
                metadata["reason"] = f"Invalid GPU index {gpu_index}"
                return "cpu", metadata
            
            device = f"cuda:{gpu_index}"
            metadata["resolved"] = device
            metadata["reason"] = f"Explicit GPU {gpu_index}"
            return device, metadata
            
        except (ValueError, IndexError):
            metadata["warnings"].append(f"Invalid CUDA policy format '{policy}', falling back to CPU")
            metadata["resolved"] = "cpu"
            metadata["reason"] = "Invalid policy format"
            return "cpu", metadata
    
    # Unknown policy
    metadata["warnings"].append(f"Unknown device policy '{policy}', falling back to CPU")
    metadata["resolved"] = "cpu"
    metadata["reason"] = "Unknown policy"
    return "cpu", metadata


def log_device_resolution(device: str, metadata: Dict[str, Any]) -> None:
    """Log device resolution details with appropriate styling."""
    PrintStyle.standard(f"TTS Device: {metadata['resolved']} ({metadata['reason']})")
    
    for warning in metadata.get("warnings", []):
        PrintStyle.hint(f"TTS Device Warning: {warning}")
