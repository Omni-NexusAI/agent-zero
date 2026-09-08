export function wavBase64(chunks, sourceRate, targetRate = 16000) {
    const count = chunks.reduce((n, c) => n + c.length, 0);
    const joined = new Float32Array(count);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    const frames = Math.floor(count * targetRate / sourceRate);
    const bytes = new Uint8Array(44 + frames * 2);
    const view = new DataView(bytes.buffer);
    const tag = (start, text) => [...text].forEach((c, i) => view.setUint8(start + i, c.charCodeAt(0)));
    tag(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) {
        const begin = Math.floor(i * sourceRate / targetRate);
        const end = Math.min(count, Math.max(begin + 1, Math.floor((i + 1) * sourceRate / targetRate)));
        let value = 0;
        for (let j = begin; j < end; j++) value += joined[j];
        value = Math.max(-1, Math.min(1, value / (end - begin)));
        view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}

export class SpeechBoundary {
    constructor({ rate, maximum = 20, onStart, onTurn }) {
        Object.assign(this, { rate, maximum, onStart, onTurn });
        this.reset();
    }
    reset() { this.chunks = []; this.duration = 0; this.silence = 0; this.speech = 0; this.admitted = false; }
    push(chunk) {
        const duration = chunk.length / this.rate;
        const rms = Math.sqrt(chunk.reduce((n, v) => n + v * v, 0) / chunk.length);
        const voiced = rms > .02;
        if (!this.chunks.length && !voiced) return;
        this.chunks.push(chunk);
        this.duration += duration;
        this.silence = voiced ? 0 : this.silence + duration;
        this.speech = voiced ? this.speech + duration : this.speech;
        if (!this.admitted && this.speech >= .45) {
            this.admitted = true;
            this.onStart();
        }
        if (this.duration >= this.maximum || this.silence >= .9) {
            const chunks = this.chunks;
            const admitted = this.admitted;
            this.reset();
            if (admitted) this.onTurn(chunks);
        }
    }
}

export class AudioSession {
    constructor({ onStart, onTurn, onError, maximum, deviceId }) {
        Object.assign(this, { onStart, onTurn, onError, maximum, deviceId });
        this.closed = false;
        this.queue = [];
        this.playing = null;
        this.playbackGeneration = 0;
    }
    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
                deviceId: this.deviceId ? { exact: this.deviceId } : undefined,
                channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
            }});
            if (this.closed) return this.close();
            this.context = new AudioContext();
            await this.context.resume();
            await this.context.audioWorklet.addModule('/plugins/_convo/webui/audio-worklet.js');
            if (this.closed) return this.close();
            this.boundary = new SpeechBoundary({ rate: this.context.sampleRate, maximum: this.maximum,
                onStart: this.onStart, onTurn: chunks => this.onTurn(wavBase64(chunks, this.context.sampleRate)) });
            this.source = this.context.createMediaStreamSource(this.stream);
            this.capture = new AudioWorkletNode(this.context, 'convo-capture');
            this.sink = this.context.createGain(); this.sink.gain.value = 0;
            this.source.connect(this.capture).connect(this.sink).connect(this.context.destination);
            this.capture.port.onmessage = event => { if (!this.closed) this.boundary.push(event.data); };
        } catch (error) { this.close(); throw error; }
    }
    interrupt() {
        this.playbackGeneration++;
        this.queue = [];
        const playing = this.playing; this.playing = null;
        if (playing) { playing.onended = null; try { playing.stop(); } catch {} playing.disconnect(); }
    }
    enqueue(base64, completed, started = () => {}) {
        if (this.closed) return;
        if (this.queue.length >= 24) { this.interrupt(); this.onError(new Error('Playback fell behind; queued audio was discarded.')); return; }
        this.queue.push({ base64, completed, started, generation: this.playbackGeneration });
        void this.drain();
    }
    async drain() {
        if (this.playing || this.decoding || this.closed || !this.queue.length) return;
        this.decoding = true;
        const item = this.queue.shift();
        try {
            const bytes = Uint8Array.from(atob(item.base64), c => c.charCodeAt(0));
            const buffer = await this.context.decodeAudioData(bytes.buffer);
            if (this.closed || item.generation !== this.playbackGeneration) return;
            const source = this.context.createBufferSource(); source.buffer = buffer;
            source.connect(this.context.destination); this.playing = source;
            source.onended = () => {
                source.disconnect();
                if (this.playing === source) this.playing = null;
                if (!this.closed && item.generation === this.playbackGeneration) item.completed();
                void this.drain();
            };
            source.start();
            item.started();
        } catch (error) { this.interrupt(); this.onError(error); }
        finally { this.decoding = false; if (!this.playing && !this.closed) void this.drain(); }
    }
    close() {
        this.closed = true; this.interrupt();
        this.stream?.getTracks().forEach(track => track.stop());
        this.source?.disconnect(); this.capture?.disconnect(); this.sink?.disconnect();
        if (this.context && this.context.state !== 'closed') void this.context.close();
    }
}
