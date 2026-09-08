import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function fixture({ startBarrier = null, captureBarrier = null } = {}) {
    const calls = [], sessions = [], microphones = [];
    let selected = 'a', epoch = 0, session = 'session-a';
    const nativeMic = { status:'LISTENING', dispose() { calls.push('native.dispose'); }, async toggle() { calls.push('native.toggle'); }, async finishConvoDictation() { calls.push('native.finish'); } };
    const nativeStore = { microphoneInput: null, getSelectedDevice:()=>({deviceId:'mic'}), async initRuntime(){}, async initMicrophone(){ this.microphoneInput=nativeMic; calls.push('native.init'); } };
    const context = vm.createContext({ setTimeout, clearTimeout, setInterval, clearInterval, console, crypto:globalThis.crypto,
        window: { confirm:()=>true, addEventListener(){} }, document: { hidden:false, addEventListener(){}, getElementById(){return null;} },
        fetch:async()=>({ok:true}) });
    class Client {
        addHandlers() {}
        async on(event, cb) { this.receive=cb; }
        onDisconnect(cb) { this.disconnected=cb; }
        disconnect() { calls.push('socket.close'); }
        async request(event, data) {
            calls.push(event);
            if (event === 'convo.start' && startBarrier) await startBarrier;
            if (event === 'convo.interrupt' || event === 'convo.retarget') epoch++;
            return { results:[{handlerId:'plugin.Realtime',ok:true,data:{ok:true,session:{id:session,epoch,target:data.target||selected}}}] };
        }
    }
    class Audio {
        constructor(options) { Object.assign(this, options); microphones.push(this); }
        async start() { calls.push('capture.start'); if(captureBarrier) await captureBarrier; }
        interrupt() { calls.push('playback.interrupt'); }
        close() { this.closed=true; calls.push('capture.close'); }
        enqueue(value, done) { this.done=done; }
    }
    const exports = {
        '/js/AlpineStore.js': { createStore:(_,value)=>value },
        '/js/api.js': { callJsonApi:async(_,payload)=>payload.action==='status' ? {settings:{enabled:true,max_audio_seconds:20,transcription_enabled:false}} : {events:[],jobs:[]} },
        '/js/websocket.js': { createNamespacedClient:()=>{const client=new Client(); sessions.push(client);return client;} },
        '/js/shortcuts.js': {getCurrentContextId:()=>selected,openModal:async()=>{}},
        './audio.js': {AudioSession:Audio},
        '/plugins/_whisper_stt/webui/whisper-stt-store.js': {store:nativeStore},
    };
    const modules=new Map();
    async function resolve(specifier) {
        if(!modules.has(specifier)) {
            const values=exports[specifier]; if(!values) throw new Error('Unexpected import '+specifier);
            const module=new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
            modules.set(specifier,module); await module.link(()=>{}); await module.evaluate();
        }
        return modules.get(specifier);
    }
    const source=await readFile(new URL('../webui/convo-store.js',import.meta.url),'utf8');
    const module=new vm.SourceTextModule(source,{context,importModuleDynamically:resolve});
    await module.link(resolve); await module.evaluate();
    return {store:module.namespace.store,calls,sessions,microphones,nativeStore,setTarget:v=>selected=v};
}

test('Start, interrupt, stop have one owned socket and microphone',async()=>{
    const f=await fixture(); await f.store.start();
    assert.equal(f.microphones.length,1); assert.equal(f.store.session.id,'session-a');
    await f.store.interrupt(); assert.equal(f.store.session.epoch,1);
    await f.store.stop(); assert.equal(f.store.session,null); assert.equal(f.microphones[0].closed,true);
    assert.ok(f.calls.includes('convo.stop'));
});

test('A late start cannot revive a stopped voice session',async()=>{
    let resolve; const barrier=new Promise(r=>resolve=r);
    const f=await fixture({startBarrier:barrier}); const pending=f.store.start();
    while(!f.calls.includes('convo.start')) await new Promise(r=>setTimeout(r,1));
    await f.store.stop(); resolve(); await pending;
    assert.equal(f.store.session,null); assert.equal(f.microphones.length,0);
});

test('Closing during microphone permission/setup releases late capture',async()=>{
    let resolve; const barrier=new Promise(r=>resolve=r);
    const f=await fixture({captureBarrier:barrier}); const pending=f.store.start();
    while(!f.calls.includes('capture.start')) await new Promise(r=>setTimeout(r,1));
    await f.store.stop(); resolve(); await pending;
    assert.equal(f.store.session,null); assert.equal(f.microphones[0].closed,true);
});

test('Retarget keeps the voice session and discards the old capture owner',async()=>{
    const f=await fixture(); await f.store.start(); f.setTarget('b'); await f.store.retarget();
    assert.equal(f.store.target,'b'); assert.equal(f.store.session.id,'session-a');
    assert.equal(f.store.session.epoch,1); assert.equal(f.microphones[0].closed,true);
    assert.equal(f.calls.filter(x=>x==='convo.start').length,1); await f.store.stop();
});

test('Explicit dictation flushes through native recorder before releasing it',async()=>{
    const f=await fixture(); await f.store.beginDictation(); assert.equal(f.store.dictating,true);
    await f.store.endDictation(); assert.equal(f.store.dictating,false); assert.ok(f.calls.includes('native.finish'));
    assert.equal(f.nativeStore.microphoneInput,null);
});
