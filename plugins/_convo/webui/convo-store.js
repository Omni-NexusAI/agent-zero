import { createStore } from '/js/AlpineStore.js';
import { callJsonApi } from '/js/api.js';
import { createNamespacedClient } from '/js/websocket.js';
import { getCurrentContextId, openModal } from '/js/shortcuts.js';
import { AudioSession } from './audio.js';

// Non-reactive owned resources: Alpine must not proxy AudioNodes or Socket.IO.
let client = null, audio = null, generation = 0, interrupting = Promise.resolve();
let nativePromise = null, dictationPromise = null, dictationHeld = false;
let historyTarget = '', historySequence = 0, refreshTimer = null;
let capturing = false, lastActivity = 0, noticePending = false;
const noticeSeen = new Set();
const endpoint = '/plugins/_convo/conversation';

async function native() {
    if (!nativePromise) nativePromise = (async () => {
        const path = '/plugins/_whisper_stt/webui/whisper-stt-store.js';
        const modern = await fetch(path, { cache: 'no-store' }).then(r => r.ok).catch(() => false);
        if (modern) {
            const { store } = await import(path);
            await store.initRuntime?.();
            return { store, device: () => store.getSelectedDevice(), transcribe: '/plugins/_whisper_stt/transcribe' };
        }
        const [{ store }, { store: devices }] = await Promise.all([
            import('/components/chat/speech/speech-store.js'), import('/components/settings/speech/microphone-setting-store.js'),
        ]);
        return { store, device: () => devices.getSelectedDevice(), transcribe: '/transcribe' };
    })();
    return nativePromise;
}

async function request(event, data = {}, socket = client) {
    if (!socket) throw new Error('Convo is disconnected.');
    const envelope = await socket.request('convo.' + event, data, { timeoutMs: event === 'start' || event === 'retarget' ? 50000 : 10000 });
    const result = envelope.results?.find(r => r.handlerId?.includes('Realtime')) || envelope.results?.[0];
    if (!result?.ok || !result.data?.ok) throw new Error(result?.error?.error || (result?.data?.stale ? 'Stale voice operation withheld.' : 'Convo request was rejected. Check host diagnostics.'));
    return result.data;
}

function identity() { return store.session ? { session_id: store.session.id, epoch: store.session.epoch } : {}; }
function fail(error) { store.error = error?.message || String(error); }

export const store = createStore('convo', {
    settings: null, session: null, state: 'off', error: '', mode: 'active', target: '',
    events: [], jobs: [], draft: '', dictating: false, panelOpen: false, busy: false,
    get enabled() { return !!this.settings?.enabled; },
    get active() { return !!this.session; },
    async refresh() {
        try {
            const data = await callJsonApi(endpoint, { action: 'status' });
            this.settings = data.settings;
            if (!this.enabled && (this.active || this.busy)) await this.stop();
        } catch (error) { fail(error); }
    },
    async show() {
        await this.refresh(); this.panelOpen = true;
        if (!this.active) this.target = getCurrentContextId() || '';
        await openModal('/plugins/_convo/webui/main.html');
        await this.history();
    },
    async openSettings() {
        const { store: settings } = await import('/components/plugins/plugin-settings-store.js');
        await settings.openConfig('_convo');
    },
    async openStudio() { await openModal('/plugins/_convo/webui/studio.html'); },
    async migrateSettings() {
        try {
            const preview = await callJsonApi(endpoint, { action: 'migration_preview' });
            if (!preview.changed) { this.error = 'No legacy settings need migration.'; return; }
            if (!window.confirm('Merge legacy Enhanced Speech settings into Convo? Existing Convo values win; rollback state will be retained.')) return;
            await callJsonApi(endpoint, { action: 'migrate' });
            await this.refresh(); this.error = 'Migration saved. Close and reopen plugin settings before editing them.';
        } catch (error) { fail(error); }
    },
    async toggle() { if (this.active || this.busy) await this.stop(); else await this.start(); },
    async start() {
        if (this.busy || this.active) return;
        const attempt = ++generation; this.busy = true; this.error = ''; this.state = 'connecting';
        let ownedClient = null, ownedAudio = null;
        try {
            await this.refresh();
            if (!this.enabled) throw new Error('Enable Convo and configure its providers in plugin settings.');
            const binding = await native();
            if (attempt !== generation) return;
            await this.endDictation();
            const mic = binding.store.microphoneInput;
            if (mic) {
                if (typeof mic.dispose !== 'function') throw new Error('Native microphone cannot be safely released on this host. Reload with the Convo compatibility adapter.');
                mic.dispose(); binding.store.microphoneInput = null;
            }
            this.target = getCurrentContextId() || '';
            if (!this.target) throw new Error('Select or create a chat first.');
            ownedClient = createNamespacedClient('/ws'); client = ownedClient;
            ownedClient.addHandlers(['plugins/_convo/realtime']);
            ownedClient.onDisconnect(() => { if (client === ownedClient) { fail(new Error('Voice disconnected. Jobs continue in their target chats.')); void this.stop(); } });
            await ownedClient.on('convo.event', envelope => {
                const event = envelope.data;
                if (client !== ownedClient || !this.session || event?.session_id !== this.session.id || event.epoch !== this.session.epoch) return;
                if (event.type === 'state') { this.state = event.state; lastActivity = Date.now(); }
                if (event.type === 'error') fail(new Error(event.message));
                if (event.type === 'text.delta') this.draft += event.text;
                if (event.type === 'audio.phrase') {
                    this.state = 'speaking';
                    audio?.enqueue(event.audio, () => {
                        if (event.epoch === this.session?.epoch) void request('playback', { ...identity(), turn_id: event.turn_id, phrase_id: event.phrase_id, status: 'completed' }).catch(fail);
                    }, () => {
                        if (event.epoch === this.session?.epoch) void request('playback', { ...identity(), turn_id: event.turn_id, phrase_id: event.phrase_id, status: 'started' }).catch(fail);
                    });
                }
                if (event.type === 'job.queued' || (event.type === 'state' && event.state === 'listening')) void this.history();
            });
            const response = await request('start', { target: this.target, mode: this.mode }, ownedClient);
            if (attempt !== generation) { await request('stop', { session_id: response.session.id }, ownedClient).catch(() => {}); return; }
            this.session = response.session;
            ownedAudio = new AudioSession({ maximum: this.settings.max_audio_seconds, deviceId: binding.device()?.deviceId,
                onStart: () => { if (attempt === generation) { capturing = true; lastActivity = Date.now(); interrupting = this.interrupt(); } },
                onTurn: value => { if (attempt === generation) void this.turn(value, attempt); },
                onError: fail });
            audio = ownedAudio;
            await ownedAudio.start();
            if (attempt !== generation) return;
            this.state = 'listening'; await this.history();
        } catch (error) { if (attempt === generation) { fail(error); await this.stop(); } }
        finally {
            if (attempt !== generation) { ownedAudio?.close(); ownedClient?.disconnect(); }
            else this.busy = false;
        }
    },
    async stop() {
        generation++; this.busy = false; this.state = 'off';
        capturing = false;
        const current = this.session, socket = client;
        this.session = null; client = null; audio?.close(); audio = null; this.draft = '';
        if (current && socket) await request('stop', { session_id: current.id }, socket).catch(() => {});
        socket?.disconnect();
    },
    async interrupt() {
        audio?.interrupt(); this.draft = '';
        if (!this.session) return;
        const before = this.session.id;
        try {
            const result = await request('interrupt', identity());
            if (this.session?.id === before) { this.session = result.session; this.state = 'listening'; }
        } catch (error) { fail(error); await this.stop(); }
    },
    async turn(value, attempt) {
        capturing = false; lastActivity = Date.now();
        await interrupting;
        if (attempt !== generation || !this.session) return;
        const turn_id = crypto.randomUUID(); const ids = identity(); this.draft = '';
        try {
            const transcription = async () => {
                const binding = await native();
                const result = await callJsonApi(binding.transcribe, { audio: value, mime_type: 'audio/wav' });
                return result?.text || '';
            };
            if (this.settings.text_input_required) {
                const transcript = await transcription();
                if (attempt !== generation || ids.epoch !== this.session?.epoch) return;
                await request('turn', { ...ids, turn_id, transcript });
            } else {
                await request('turn', { ...ids, turn_id, audio: value });
                if (this.settings.transcription_enabled && this.mode === 'active') void transcription().then(text => {
                    if (ids.session_id === this.session?.id && text) return request('transcript', { ...ids, turn_id, text });
                }).catch(() => { this.error = 'Transcription unavailable; the audio conversation is unaffected.'; });
            }
        } catch (error) { fail(error); }
    },
    async retarget() {
        const target = getCurrentContextId();
        if (!target || target === this.target) return;
        if (!this.session) { this.target = target; await this.history(); return; }
        const attempt = ++generation;
        capturing = false;
        this.busy = true;
        const ownedAudio = audio; audio = null; ownedAudio?.close();
        try {
            const result = await request('retarget', { ...identity(), target });
            if (attempt !== generation) return;
            this.session = result.session; this.target = target; this.draft = '';
            const binding = await native();
            if (attempt !== generation) return;
            const replacement = new AudioSession({ maximum: this.settings.max_audio_seconds, deviceId: binding.device()?.deviceId,
                onStart: () => { if (attempt === generation) { capturing = true; lastActivity = Date.now(); interrupting = this.interrupt(); } },
                onTurn: value => { if (attempt === generation) void this.turn(value, attempt); }, onError: fail });
            audio = replacement; await replacement.start();
            if (attempt !== generation) replacement.close();
        } catch (error) { fail(error); await this.stop(); }
        finally { if (attempt === generation) this.busy = false; }
        await this.history();
    },
    async history() {
        const target = this.target;
        if (!target) return;
        if (historyTarget !== target) { historyTarget = target; historySequence = 0; this.events = []; this.jobs = []; }
        try {
            const result = await callJsonApi(endpoint, { action: 'history', target, after: historySequence });
            if (this.target !== target) return;
            const known = new Set(this.events.map(e => e.seq));
            this.events.push(...result.events.filter(e => !known.has(e.seq)));
            historySequence = Math.max(historySequence, ...result.events.map(e => e.seq));
            this.jobs = result.jobs;
            if (this.active) void this.deliverNotice();
        } catch (error) { fail(error); }
    },
    eventText(event) {
        if (event.kind === 'user.accepted') return event.payload.transcript || '[Audio input; no verbatim transcript]';
        return event.payload.text || event.payload.reason || event.payload.result || event.payload.job_id || '';
    },
    async deliverNotice() {
        if (!this.session || noticePending || capturing || this.busy || this.state !== 'listening' || audio?.playing || audio?.decoding || audio?.queue?.length || Date.now() - lastActivity < 4000) return;
        const job = this.jobs.find(job => job.session === this.session.id && job.target === this.target && ['completed','failed','uncertain'].includes(job.status) && !noticeSeen.has(job.id));
        if (!job) return;
        noticePending = true;
        try {
            const result = await request('notice', { ...identity(), job_id: job.id });
            if (!result.busy) noticeSeen.add(job.id);
        } catch (error) { fail(error); noticeSeen.add(job.id); }
        finally { noticePending = false; }
    },
    async cancelJob(job) { try { await callJsonApi(endpoint, { action: 'cancel_job', target: job.target, job_id: job.id }); await this.history(); } catch (error) { fail(error); } },
    async steerJob(job) {
        const text = window.prompt('Explicitly steer this running job:');
        if (text?.trim()) try { await callJsonApi(endpoint, { action: 'steer_job', target: job.target, job_id: job.id, text }); } catch (error) { fail(error); }
    },
    async beginDictation() {
        dictationHeld = true;
        if (dictationPromise) return dictationPromise;
        dictationPromise = (async () => {
            await this.stop();
            const binding = await native();
            if (!dictationHeld) return;
            await binding.store.initMicrophone();
            if (!dictationHeld) { binding.store.microphoneInput?.dispose?.(); binding.store.microphoneInput = null; return; }
            await binding.store.microphoneInput?.toggle(); this.dictating = true;
        })().catch(fail).finally(() => { dictationPromise = null; });
        return dictationPromise;
    },
    async endDictation() {
        dictationHeld = false; await dictationPromise;
        if (!this.dictating) return;
        this.dictating = false;
        const binding = await native();
        const mic = binding.store.microphoneInput;
        if (typeof mic?.finishConvoDictation === 'function') { await mic.finishConvoDictation(); binding.store.microphoneInput = null; }
        else { await mic?.toggle(); }
    },
    async toggleDictation() { if (this.dictating || dictationHeld) await this.endDictation(); else await this.beginDictation(); },
});

export function install() {
    if (globalThis.__convoInstalled) return;
    globalThis.__convoInstalled = true;
    let timer = null, held = false, suppressClick = false;
    const nativeLabels = new WeakMap();
    const micEvent = event => event.target?.closest?.('#microphone-button');
    document.addEventListener('pointerdown', event => {
        if (!store.enabled || !micEvent(event) || event.button !== 0) return;
        event.preventDefault(); event.stopImmediatePropagation(); held = false; suppressClick = false;
        clearTimeout(timer); timer = setTimeout(() => { held = true; suppressClick = true; void store.beginDictation(); }, 450);
    }, true);
    const release = () => { clearTimeout(timer); if (held) { held = false; void store.endDictation(); } };
    document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true);
    window.addEventListener('blur', release);
    document.addEventListener('click', event => {
        if (!store.enabled || !micEvent(event)) return;
        event.preventDefault(); event.stopImmediatePropagation(); clearTimeout(timer);
        if (!suppressClick) void store.toggle(); suppressClick = false;
    }, true);
    document.addEventListener('keydown', event => {
        if (!store.enabled || event.repeat || event.isComposing) return;
        const parts = (store.settings.hotkey || '').split('+'); const key = parts.pop();
        if (event.ctrlKey !== parts.includes('Ctrl') || event.shiftKey !== parts.includes('Shift') || event.altKey !== parts.includes('Alt') || event.metaKey !== parts.includes('Meta')) return;
        if ((key === 'Space' && event.code === 'Space') || (key && event.key.toLowerCase() === key.toLowerCase())) { event.preventDefault(); void store.toggle(); }
    });
    window.addEventListener('pagehide', () => { audio?.close(); client?.disconnect(); });
    refreshTimer = setInterval(() => {
        if (!document.hidden || store.active || store.busy) {
            void store.refresh(); if (store.active || store.panelOpen) void store.history();
            const mic = document.getElementById('microphone-button');
            if (mic) {
                if (store.enabled) {
                    if (!nativeLabels.has(mic)) nativeLabels.set(mic, mic.getAttribute('aria-label'));
                    mic.dataset.convo = store.state; mic.setAttribute('aria-label', 'Convo: click to start or stop; hold for dictation');
                } else if (mic.dataset.convo) {
                    delete mic.dataset.convo;
                    const label = nativeLabels.get(mic);
                    if (label == null) mic.removeAttribute('aria-label'); else mic.setAttribute('aria-label', label);
                    nativeLabels.delete(mic);
                }
            }
        }
    }, 2000);
    void store.refresh();
}
