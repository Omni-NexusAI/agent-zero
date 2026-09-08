// Kept in sync with helpers/convo_contract.py by the contract tests.
export const defaults = {
  "enabled": false,
  "ambient_enabled": false,
  "remote_ambient_consent": false,
  "transcription_enabled": false,
  "developer_mode": false,
  "style": "",
  "activation_names": [],
  "hotkey": "Ctrl+Shift+Space",
  "sidecar": {
    "url": "http://convo-runtime:8090",
    "token_env": "CONVO_SIDECAR_TOKEN",
    "remote": false
  },
  "roles": {
    "conversation": {
      "url": "http://host.docker.internal:8080/v1",
      "model": "",
      "token_env": "",
      "remote": false,
      "capabilities": {
        "audio_input": true,
        "cancellation": true,
        "tool_calls": true
      }
    },
    "classifier": {
      "url": "",
      "model": "",
      "token_env": "",
      "remote": false,
      "capabilities": {
        "audio_input": true,
        "cancellation": true
      }
    },
    "tts": {
      "backend": "openai",
      "url": "http://convo-audio:8080/v1",
      "model": "",
      "voice": "",
      "token_env": "",
      "remote": false,
      "capabilities": {
        "audio_output": true,
        "cloning": true
      }
    }
  },
  "compaction": {
    "trigger": 0.7,
    "target": 0.5,
    "recent_exchanges": 6,
    "context_tokens": 16384,
    "output_reserve": 2048
  },
  "direct_timeout": 30,
  "clarification_cooldown": 60,
  "audio_token_reserve": 4096,
  "max_audio_seconds": 20
};
export function fillDefaults(target, source = defaults) {
    for (const [key, value] of Object.entries(source)) {
        if (!(key in target)) target[key] = structuredClone(value);
        else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') fillDefaults(target[key], value);
    }
    return target;
}
