import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SpeechBoundary, wavBase64 } from '../webui/audio.js';

test('WAV conversion preserves original sample duration', () => {
    const bytes = Buffer.from(wavBase64([new Float32Array(48000).fill(.25)], 48000), 'base64');
    assert.equal(bytes.subarray(0,4).toString(), 'RIFF');
    assert.equal(bytes.readUInt32LE(24), 16000);
    assert.equal(bytes.length, 32044);
    assert.equal(bytes.readInt16LE(44), 8192);
});

test('Admission requires 450ms and retains pre-admission original samples', () => {
    let starts = 0; const turns = [];
    const boundary = new SpeechBoundary({rate: 16000, onStart: () => starts++, onTurn: v => turns.push(v)});
    const speech = new Float32Array(1600).fill(.1);
    for (let n=0;n<4;n++) boundary.push(speech);
    assert.equal(starts, 0);
    boundary.push(speech); assert.equal(starts, 1);
    for (let n=0;n<10;n++) boundary.push(new Float32Array(1600));
    assert.equal(turns.length, 1); assert.equal(turns[0][0], speech);
});

test('Short noises and idle silence produce no uploads', () => {
    let turns = 0, starts = 0;
    const boundary = new SpeechBoundary({rate:16000, onStart:()=>starts++, onTurn:()=>turns++});
    boundary.push(new Float32Array(1600).fill(.1));
    for (let n=0;n<100;n++) boundary.push(new Float32Array(1600));
    assert.equal(starts, 0); assert.equal(turns, 0); assert.equal(boundary.chunks.length, 0);
});
