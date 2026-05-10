import { callJsonApi } from "/js/api.js";
import { store as speechStore } from "/components/chat/speech/speech-store.js";
import { store as inputStore } from "/components/chat/input/input-store.js";
import { store as microphoneSettingStore } from "/components/settings/speech/microphone-setting-store.js";
import { store as settingsStore } from "/components/settings/settings-store.js";

const Status = {
  INACTIVE: "inactive",
  ACTIVATING: "activating",
  LISTENING: "listening",
  RECORDING: "recording",
  WAITING: "waiting",
  PROCESSING: "processing",
};

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

const MIN_AUDIO_BYTES = 256;
const RECORDER_TIMESLICE_MS = 250;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function notifyTranscriptionError(error) {
  if (typeof window.toastFetchError === "function") {
    window.toastFetchError("Transcription error", error);
  } else {
    console.error("Transcription error", error);
  }
}

async function fetchSpeechCapabilities() {
  return await callJsonApi("plugins/_enhanced_speech/capabilities", {});
}

function applySpeechCapabilities(capabilities) {
  if (!capabilities || !settingsStore.additional) return;

  if (Array.isArray(capabilities.stt_device_options)) {
    settingsStore.additional.stt_device_options = capabilities.stt_device_options;
  }
  if (Array.isArray(capabilities.tts_device_options)) {
    settingsStore.additional.tts_device_options = capabilities.tts_device_options;
  }
  settingsStore.additional.enhanced_speech_capabilities = capabilities;

  if (settingsStore.settings) {
    const sttOptions = new Set((capabilities.stt_device_options || []).map((option) => option.value));
    const ttsOptions = new Set((capabilities.tts_device_options || []).map((option) => option.value));
    if (!sttOptions.has(settingsStore.settings.stt_device)) {
      settingsStore.settings.stt_device = capabilities.default_stt_device || "auto";
    }
    if (!ttsOptions.has(settingsStore.settings.tts_device)) {
      settingsStore.settings.tts_device = capabilities.default_tts_device || "auto";
    }
  }

  if (capabilities.warnings?.length) {
    console.warn("[Enhanced Speech]", capabilities.warnings.join(" "));
  }
}

async function refreshSpeechCapabilities() {
  try {
    applySpeechCapabilities(await fetchSpeechCapabilities());
  } catch (error) {
    console.debug("[Enhanced Speech] Capability detection unavailable", error);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

function voiceMessageText(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.toLowerCase().startsWith("(voice)") ? value : `(voice) ${value}`;
}

function mirrorInputValue(message) {
  inputStore.message = message;

  const chatInput = document.getElementById("chat-input");
  if (!chatInput) return;

  chatInput.value = message;
  chatInput.dispatchEvent(new Event("input", { bubbles: true }));
  if (typeof inputStore.adjustTextareaHeight === "function") {
    inputStore.adjustTextareaHeight();
  }
}

class EnhancedMicrophoneInput {
  constructor(updateCallback) {
    this.mediaRecorder = null;
    this.stream = null;
    this.audioChunks = [];
    this.lastChunk = null;
    this.updateCallback = updateCallback;
    this.messageSent = false;
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.analyserNode = null;
    this._status = Status.INACTIVE;
    this.lastAudioTime = null;
    this.waitingTimer = null;
    this.silenceStartTime = null;
    this.hasStartedRecording = false;
    this.analysisFrame = null;
    this.stopPromise = null;
    this.processingPromise = null;
    this.mimeType = "";
  }

  get status() {
    return this._status;
  }

  set status(newStatus) {
    if (this._status === newStatus) return;
    const oldStatus = this._status;
    this._status = newStatus;
    this.handleStatusChange(oldStatus, newStatus);
  }

  async initialize() {
    this.status = Status.ACTIVATING;
    try {
      const selectedDevice = microphoneSettingStore.getSelectedDevice();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:
            selectedDevice && selectedDevice.deviceId
              ? { exact: selectedDevice.deviceId }
              : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });

      this.mimeType = pickMimeType();
      const options = this.mimeType ? { mimeType: this.mimeType } : undefined;
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.mimeType = this.mediaRecorder.mimeType || this.mimeType || "audio/webm";

      this.mediaRecorder.ondataavailable = (event) => {
        if (!event.data || event.data.size <= 0) return;
        if (this.status === Status.LISTENING) {
          this.lastChunk = event.data;
          return;
        }
        this.audioChunks.push(event.data);
      };

      this.setupAudioAnalysis(this.stream);
      return true;
    } catch (error) {
      console.error("[Enhanced Speech] Microphone initialization error:", error);
      if (typeof window.toast === "function") {
        window.toast("Failed to access microphone. Please check permissions.", "error");
      }
      this.status = Status.INACTIVE;
      return false;
    }
  }

  handleStatusChange(_oldStatus, newStatus) {
    if (newStatus !== Status.RECORDING) this.lastChunk = null;

    switch (newStatus) {
      case Status.INACTIVE:
        this.handleInactiveState();
        break;
      case Status.LISTENING:
        this.handleListeningState();
        break;
      case Status.RECORDING:
        this.handleRecordingState();
        break;
      case Status.WAITING:
        this.handleWaitingState();
        break;
      case Status.PROCESSING:
        this.handleProcessingState();
        break;
    }
  }

  handleInactiveState() {
    this.stopAudioAnalysis();
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
    }
    this.finalizeRecording();
  }

  handleListeningState() {
    this.finalizeRecording();
    this.audioChunks = [];
    this.hasStartedRecording = false;
    this.silenceStartTime = null;
    this.lastAudioTime = null;
    this.messageSent = false;
    this.startAudioAnalysis();
  }

  handleRecordingState() {
    if (!this.hasStartedRecording && this.mediaRecorder?.state !== "recording") {
      this.hasStartedRecording = true;
      this.audioChunks = [];
      if (this.lastChunk) {
        this.audioChunks.push(this.lastChunk);
        this.lastChunk = null;
      }
      this.mediaRecorder.start(RECORDER_TIMESLICE_MS);
      console.log("[Enhanced Speech] Speech recording started", this.mimeType);
    }
    if (this.waitingTimer) {
      clearTimeout(this.waitingTimer);
      this.waitingTimer = null;
    }
  }

  handleWaitingState() {
    this.waitingTimer = setTimeout(() => {
      if (this.status === Status.WAITING) this.status = Status.PROCESSING;
    }, speechStore.stt_waiting_timeout);
  }

  handleProcessingState() {
    if (!this.processingPromise) {
      this.processingPromise = this.process().finally(() => {
        this.processingPromise = null;
      });
    }
  }

  setupAudioAnalysis(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.minDecibels = -90;
    this.analyserNode.maxDecibels = -10;
    this.analyserNode.smoothingTimeConstant = 0.85;
    this.mediaStreamSource.connect(this.analyserNode);
  }

  startAudioAnalysis() {
    const analyzeFrame = () => {
      if (this.status === Status.INACTIVE) return;

      const dataArray = new Uint8Array(this.analyserNode.fftSize);
      this.analyserNode.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const amplitude = (dataArray[i] - 128) / 128;
        sum += amplitude * amplitude;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const now = Date.now();

      if (rms > this.densify(speechStore.stt_silence_threshold)) {
        this.lastAudioTime = now;
        this.silenceStartTime = null;

        if (
          (this.status === Status.LISTENING || this.status === Status.WAITING) &&
          !speechStore.isSpeaking
        ) {
          this.status = Status.RECORDING;
        }
      } else if (this.status === Status.RECORDING) {
        if (!this.silenceStartTime) this.silenceStartTime = now;

        const silenceDuration = now - this.silenceStartTime;
        if (silenceDuration >= speechStore.stt_silence_duration) {
          this.status = Status.WAITING;
        }
      }

      this.analysisFrame = requestAnimationFrame(analyzeFrame);
    };

    this.analysisFrame = requestAnimationFrame(analyzeFrame);
  }

  stopAudioAnalysis() {
    if (this.analysisFrame) {
      cancelAnimationFrame(this.analysisFrame);
      this.analysisFrame = null;
    }
  }

  finalizeRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
      this.hasStartedRecording = false;
      return Promise.resolve();
    }
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      const done = () => {
        recorder.removeEventListener("stop", done);
        this.hasStartedRecording = false;
        this.stopPromise = null;
        resolve();
      };
      recorder.addEventListener("stop", done, { once: true });
      try {
        if (recorder.state === "recording" && typeof recorder.requestData === "function") {
          recorder.requestData();
        }
      } catch (error) {
        console.debug("[Enhanced Speech] requestData failed", error);
      }
      recorder.stop();
    });

    return this.stopPromise;
  }

  densify(x) {
    return Math.exp(-5 * (1 - x));
  }

  async process() {
    await this.finalizeRecording();

    const size = this.audioChunks.reduce((total, chunk) => total + chunk.size, 0);
    if (size < MIN_AUDIO_BYTES) {
      console.debug("[Enhanced Speech] Ignoring empty or tiny recording", size);
      this.audioChunks = [];
      this.status = Status.LISTENING;
      return;
    }

    const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
    const base64 = await blobToBase64(audioBlob);

    try {
      let result;
      const payload = {
        audio: base64,
        mime_type: audioBlob.type || this.mimeType,
      };
      try {
        result = await callJsonApi("plugins/_enhanced_speech/transcribe", payload);
      } catch (pluginError) {
        console.debug("[Enhanced Speech] Plugin transcribe failed; falling back to core /transcribe", pluginError);
        result = await callJsonApi("/transcribe", payload);
      }
      const text = this.filterResult(result.text || "");

      if (text) {
        console.log("[Enhanced Speech] Transcription:", text);
        await this.updateCallback(text, true);
      }
    } catch (error) {
      notifyTranscriptionError(error);
    } finally {
      this.audioChunks = [];
      this.status = Status.LISTENING;
    }
  }

  filterResult(text) {
    text = text.trim();
    let ok = false;
    while (!ok) {
      if (!text) break;
      if (text[0] === "{" && text[text.length - 1] === "}") break;
      if (text[0] === "(" && text[text.length - 1] === ")") break;
      if (text[0] === "[" && text[text.length - 1] === "]") break;
      ok = true;
    }
    if (ok) return text;
    console.log("[Enhanced Speech] Discarding transcription:", text);
    return "";
  }

  async toggle() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    if (this.status === Status.INACTIVE || this.status === Status.ACTIVATING) {
      this.status = Status.LISTENING;
    } else {
      this.status = Status.INACTIVE;
    }
  }

  async requestPermission() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (error) {
      console.error("[Enhanced Speech] Error accessing microphone:", error);
      if (typeof window.toast === "function") {
        window.toast(
          "Microphone access denied. Please enable microphone access in your browser settings.",
          "error",
        );
      }
      return false;
    }
  }
}

export default async function patchEnhancedSttRecorder() {
  if (speechStore._enhancedSpeechRecorderPatched) return;

  const originalInitMicrophone = speechStore.initMicrophone?.bind(speechStore);
  speechStore._enhancedSpeechOriginalInitMicrophone = originalInitMicrophone;
  speechStore._enhancedSpeechRecorderPatched = true;
  speechStore._enhancedSpeechSubmitVoiceText = async function submitVoiceText(text) {
    const message = voiceMessageText(text);
    if (!message) return;

    if (this.microphoneInput?.messageSent) {
      console.debug("[Enhanced Speech] Voice message already sent for this capture");
      return;
    }

    if (this.microphoneInput) this.microphoneInput.messageSent = true;
    mirrorInputValue(message);

    if (typeof globalThis.sendMessage !== "function") {
      throw new Error("sendMessage is not available");
    }
    await globalThis.sendMessage();
  };

  speechStore.initMicrophone = async function initEnhancedMicrophone() {
    if (this.microphoneInput) return this.microphoneInput;

    this.microphoneInput = new EnhancedMicrophoneInput(async (text, isFinal) => {
      if (isFinal) await this._enhancedSpeechSubmitVoiceText(text);
    });

    const initialized = await this.microphoneInput.initialize();
    if (!initialized) {
      this.microphoneInput = null;
      return null;
    }
    return this.microphoneInput;
  };

  const originalSettingsOnOpen = settingsStore.onOpen?.bind(settingsStore);
  if (originalSettingsOnOpen && !settingsStore._enhancedSpeechCapabilitiesPatched) {
    settingsStore._enhancedSpeechCapabilitiesPatched = true;
    settingsStore.onOpen = async function enhancedSpeechSettingsOnOpen(...args) {
      const result = await originalSettingsOnOpen(...args);
      await refreshSpeechCapabilities();
      return result;
    };
  }

  await refreshSpeechCapabilities();

  console.log("[Enhanced Speech] STT recorder patch active");
}
