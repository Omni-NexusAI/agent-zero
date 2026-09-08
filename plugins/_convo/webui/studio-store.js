import { createStore } from '/js/AlpineStore.js';
import { callJsonApi } from '/js/api.js';

let previewUrl = null, previewAudio = null;
async function operation(name, payload = {}, item_id = '', confirmed = false) {
    return (await callJsonApi('/plugins/_convo/conversation', { action: 'studio', operation: name, payload, item_id, confirmed })).data;
}

export const studio = createStore('convoStudio', {
    models: {}, profiles: [], catalog: [], manifest: null, progress: null, error: '', busy: false,
    selectedModel: '', selectedVoice: '', cloneName: '', cloneText: '', cloneAudio: '',
    previewText: 'The voice connection is ready.', tuning: null, tuningJson: '',
    async run(action) {
        if (this.busy) return;
        this.busy = true; this.error = '';
        try { await action(); } catch (error) { this.error = error.message || 'Managed Studio operation failed.'; }
        finally { this.busy = false; }
    },
    async refresh() {
        return this.run(async () => {
            this.models = await operation('models');
            this.profiles = (await operation('profiles')).voices || [];
            this.catalog = (await operation('catalog')).models || [];
            this.tuning = await operation('tuning');
            if (!this.selectedModel) this.selectedModel = this.models.current || '';
        });
    },
    async load() { return this.run(async () => {
        if (!window.confirm('Load this model into the Convo-owned audio service? Other speech services will not be changed.')) return;
        this.models = await operation('load', { model_key: this.selectedModel }, '', true);
    }); },
    async unload() { return this.run(async () => {
        if (!window.confirm('Unload the Convo-owned speech model?')) return;
        this.models = await operation('unload', {}, '', true);
    }); },
    async inspect(model) { return this.run(async () => { this.manifest = await operation('download', { action: 'inspect', model }); }); },
    async download() { return this.run(async () => {
        if (!this.manifest || !window.confirm('Download the displayed immutable revision under its listed license? Weights will remain outside the image.')) return;
        this.progress = await operation('download', { action: 'start', model: this.manifest.model, manifest_id: this.manifest.id }, '', true);
    }); },
    async downloadStatus() { return this.run(async () => {
        if (this.manifest) this.progress = await operation('download', { action: 'status', model: this.manifest.model });
    }); },
    async cancelDownload() { return this.run(async () => {
        if (this.manifest) this.progress = await operation('download', { action: 'cancel', model: this.manifest.model }, '', true);
    }); },
    async reference(event) {
        const file = event.target.files?.[0]; this.cloneAudio = '';
        if (!file) return;
        if (file.size > 6 * 1024 ** 2 || !file.name.toLowerCase().endsWith('.wav')) { this.error = 'Select a WAV reference smaller than 6 MiB.'; return; }
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        this.cloneAudio = btoa(binary);
    },
    async createProfile() { return this.run(async () => {
        if (!this.cloneName.trim() || !this.cloneText.trim() || !this.cloneAudio) throw new Error('Provide a name, matching transcript and reference WAV.');
        this.profiles = (await operation('create_profile', { name: this.cloneName, ref_text: this.cloneText, ref_audio: this.cloneAudio, task_type: 'Base', x_vector_only_mode: false }, '', true)).voices || [];
        this.cloneAudio = ''; this.cloneText = ''; this.cloneName = '';
    }); },
    async preview() { return this.run(async () => {
        previewAudio?.pause(); if (previewUrl) URL.revokeObjectURL(previewUrl);
        const result = await operation('preview', { model: this.selectedModel, voice: this.selectedVoice, text: this.previewText }, '', true);
        const bytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
        previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        previewAudio = new Audio(previewUrl); await previewAudio.play();
    }); },
    stopPreview() { previewAudio?.pause(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; },
    async exportTuning() { return this.run(async () => { this.tuningJson = JSON.stringify(await operation('export_tuning'), null, 2); }); },
    async importTuning() { return this.run(async () => {
        if (!window.confirm('Import the displayed tuning data into the Convo-owned Studio?')) return;
        this.tuning = await operation('import_tuning', JSON.parse(this.tuningJson), '', true);
    }); },
});
