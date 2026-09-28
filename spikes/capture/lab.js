// Task 9 spike (throwaway): capture lab measurements. Plain browser JS, no build step, no dependencies.
'use strict';

const results = { device: '', userAgent: navigator.userAgent, startedAt: new Date().toISOString(), sections: {} };
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FRAME_S = 0.01;
let liveStream = null;

function show(section, data) {
  results.sections[section] = data;
  $(`out-${section.toLowerCase()}`).textContent = JSON.stringify(data, null, 1);
  try { localStorage.setItem('capture-lab', JSON.stringify(results)); } catch { /* private mode */ }
}

// ── Live indicator: red whenever any mic/camera track is live ─────────────────────────────────────────
const streams = new Set();
function refreshIndicator() {
  const live = [...streams].some((s) => s.getTracks().some((t) => t.readyState === 'live'));
  $('indicator').className = live ? 'live' : '';
  $('indicator').textContent = live ? '● Mic / camera LIVE' : '○ Mic & camera off';
}
// Updated the moment a stream starts or stops, and polled for tracks that end on their own.
function track(stream) {
  streams.add(stream);
  stream.getTracks().forEach((t) => t.addEventListener('ended', refreshIndicator));
  refreshIndicator();
  return stream;
}
setInterval(refreshIndicator, 250);

function stopAll() {
  for (const s of streams) s.getTracks().forEach((t) => t.stop());
  streams.clear();
  liveStream = null;
  refreshIndicator();
}

// ── A. Capabilities ───────────────────────────────────────────────────────────────────────────────────
const TYPES = [
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4',
  'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav',
];
const supportedTypes = () => (window.MediaRecorder ? TYPES.filter((t) => MediaRecorder.isTypeSupported(t)) : []);

async function capabilities() {
  const perms = {};
  for (const name of ['microphone', 'camera']) {
    try { perms[name] = (await navigator.permissions.query({ name })).state; } catch (e) { perms[name] = `n/a (${e.name})`; }
  }
  let estimate = null;
  try { const e = await navigator.storage.estimate(); estimate = { quotaMB: Math.round(e.quota / 1e6), usageMB: Math.round(e.usage / 1e6) }; } catch { /* unsupported */ }
  let persisted = null;
  try { persisted = await navigator.storage.persisted(); } catch { /* unsupported */ }
  show('A', {
    secureContext: window.isSecureContext,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    recorderTypes: supportedTypes(),
    setSinkId: 'setSinkId' in HTMLMediaElement.prototype,
    selectAudioOutput: Boolean(navigator.mediaDevices && navigator.mediaDevices.selectAudioOutput),
    constraints: navigator.mediaDevices ? navigator.mediaDevices.getSupportedConstraints() : null,
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    opfs: Boolean(navigator.storage && navigator.storage.getDirectory),
    storage: estimate,
    persisted,
    webCodecs: typeof VideoEncoder !== 'undefined',
    videoCaptureStream: 'captureStream' in HTMLMediaElement.prototype,
    canvasCaptureStream: 'captureStream' in HTMLCanvasElement.prototype,
    speechVoices: typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().length : null,
    permissions: perms,
  });
}

// ── B. Permission & lifecycle ─────────────────────────────────────────────────────────────────────────
async function getAV(audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }) {
  return track(await navigator.mediaDevices.getUserMedia({ audio, video: { width: 1280, height: 720 } }));
}

$('b-start').onclick = async () => {
  const t0 = performance.now();
  try {
    liveStream = await getAV();
    const tracks = liveStream.getTracks().map((t) => ({ kind: t.kind, label: t.label, readyState: t.readyState, settings: t.getSettings() }));
    show('B', { promptToLiveMs: Math.round(performance.now() - t0), tracks });
  } catch (e) {
    show('B', { error: `${e.name}: ${e.message}` });
  }
};
$('b-stop').onclick = async () => {
  const before = liveStream ? liveStream.getTracks().map((t) => t.readyState) : [];
  const kept = liveStream;
  stopAll();
  await sleep(150);
  const after = kept ? kept.getTracks().map((t) => t.readyState) : [];
  show('B', { ...results.sections.B, stop: { before, after, allEnded: after.every((s) => s === 'ended') } });
};

// ── PCM capture via AudioWorklet (ground truth for C and D) ───────────────────────────────────────────
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage({ t: currentTime, samples: ch.slice(0) });
    return true;
  }
}
registerProcessor('tap', Tap);`;

async function pcmCapture(stream) {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'tap');
  const frames = []; // [contextTime, rms] per 10 ms
  let buffer = [];
  let bufferStart = null;
  const perFrame = Math.round(ctx.sampleRate * FRAME_S);
  node.port.onmessage = ({ data }) => {
    if (bufferStart === null) bufferStart = data.t;
    buffer.push(...data.samples);
    while (buffer.length >= perFrame) {
      const slice = buffer.splice(0, perFrame);
      let sum = 0;
      for (const v of slice) sum += v * v;
      frames.push([bufferStart, Math.sqrt(sum / perFrame)]);
      bufferStart += FRAME_S;
    }
  };
  source.connect(node);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);
  const contextTimeAt = (perf) => {
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    return ts && ts.performanceTime ? ts.contextTime + (perf - ts.performanceTime) / 1000 : ctx.currentTime;
  };
  return { ctx, frames, contextTimeAt, stop: async () => { source.disconnect(); node.disconnect(); await ctx.close(); } };
}

const db = (rms) => 20 * Math.log10(Math.max(rms, 1e-9));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const within = (frames, a, b) => frames.filter(([t]) => t >= a && t < b).map(([, r]) => db(r));

// ── C. Echo tail ──────────────────────────────────────────────────────────────────────────────────────
async function echoRun(ec) {
  const stream = track(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: ec, noiseSuppression: ec, autoGainControl: ec } }));
  const cap = await pcmCapture(stream);
  await sleep(1300);
  const audio = new Audio('assets/phrase.wav');
  let startT = null;
  let endT = null;
  audio.onplaying = () => { startT = cap.contextTimeAt(performance.now()); };
  const ended = new Promise((resolve) => { audio.onended = () => { endT = cap.contextTimeAt(performance.now()); resolve(); }; });
  await audio.play();
  await ended;
  await sleep(2600);
  const frames = cap.frames.slice();
  const t0 = frames.length ? frames[0][0] : 0;
  await cap.stop();
  stream.getTracks().forEach((t) => t.stop());
  streams.delete(stream);
  const floor = median(within(frames, t0 + 0.2, t0 + 1.2));
  const during = Math.max(...within(frames, startT, endT));
  // Settle: first moment after the end from which 300 ms stay within 6 dB of the room's noise floor.
  let settleMs = null;
  for (let t = endT; t < endT + 2.3; t += FRAME_S) {
    const next = within(frames, t, t + 0.3);
    if (next.length > 20 && next.every((v) => v <= floor + 6)) { settleMs = Math.round((t - endT) * 1000); break; }
  }
  const tailPeak = Math.max(...within(frames, endT, endT + 0.15));
  return {
    echoCancellation: ec,
    floorDb: Math.round(floor),
    playbackAboveFloorDb: Math.round(during - floor),
    tailPeakAboveFloorDb: Math.round(tailPeak - floor),
    settleMs: settleMs === null ? '>2300' : settleMs,
    trackSettings: stream.getAudioTracks()[0]?.getSettings(),
  };
}

$('c-run').onclick = async () => {
  stopAll();
  const runs = [];
  for (const ec of [true, true, true, false, false, false]) {
    show('C', { status: `running (${runs.length + 1}/6)… stay quiet`, runs });
    try { runs.push(await echoRun(ec)); } catch (e) { runs.push({ echoCancellation: ec, error: `${e.name}: ${e.message}` }); }
    await sleep(500);
  }
  const numeric = (ec) => runs.filter((r) => r.echoCancellation === ec && typeof r.settleMs === 'number').map((r) => r.settleMs);
  const on = numeric(true);
  const recommended = on.length === 3 ? Math.max(300, Math.ceil((Math.max(...on) + 100) / 50) * 50) : null;
  show('C', { runs, settleMsWithEc: on, settleMsWithoutEc: numeric(false), recommendedSettleMs: recommended });
};

// ── D. Take start clipping ────────────────────────────────────────────────────────────────────────────
function envelope(samples, rate) {
  const n = Math.round(rate * FRAME_S);
  const out = [];
  for (let i = 0; i + n <= samples.length; i += n) {
    let sum = 0;
    for (let j = i; j < i + n; j += 1) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / n));
  }
  return out;
}

async function decode(blob) {
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 16000, 16000);
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  return { samples: buffer.getChannelData(0), rate: buffer.sampleRate, duration: buffer.duration };
}

/** Finds where the recording starts on the PCM timeline by matching dB envelopes. */
function align(recordEnv, pcm, searchFrom, searchTo) {
  const rec = recordEnv.map(db);
  let best = { t: null, err: Infinity };
  const firstT = pcm[0][0];
  for (let t = searchFrom; t <= searchTo; t += FRAME_S) {
    const start = Math.round((t - firstT) / FRAME_S);
    if (start < 0) continue;
    let err = 0;
    let n = 0;
    for (let k = 0; k < Math.min(rec.length, 80); k += 1) {
      const p = pcm[start + k];
      if (!p) break;
      err += Math.abs(db(p[1]) - rec[k]);
      n += 1;
    }
    if (n > 40 && err / n < best.err) best = { t, err: err / n };
  }
  return best.t;
}

$('d-run').onclick = async () => {
  stopAll();
  const stream = track(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const type = supportedTypes().find((t) => t.startsWith('audio/')) ?? '';
  const takes = [];
  for (let i = 1; i <= 10; i += 1) {
    const cap = await pcmCapture(stream);
    $('cue').className = '';
    $('cue-text').textContent = `Take ${i}/10: wait…`;
    await sleep(700);
    const floorFrames = cap.frames.slice(-50).map(([, r]) => db(r));
    const floor = median(floorFrames);
    $('cue').className = 'go';
    $('cue-text').textContent = `Take ${i}/10: say "Paper"`;
    // Start-at-onset: begin recording when the voice is detected (≥ 15 dB over the floor for 30 ms).
    const detected = await new Promise((resolve) => {
      const started = performance.now();
      const poll = setInterval(() => {
        const last = cap.frames.slice(-3);
        if (last.length === 3 && last.every(([, r]) => db(r) > floor + 15)) { clearInterval(poll); resolve(cap.contextTimeAt(performance.now())); }
        if (performance.now() - started > 6000) { clearInterval(poll); resolve(null); }
      }, 5);
    });
    let take = { take: i, floorDb: Math.round(floor) };
    if (detected === null) {
      take.error = 'no voice detected';
    } else {
      const chunks = [];
      const rec = new MediaRecorder(audioOnly, type ? { mimeType: type } : undefined);
      rec.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((resolve) => { rec.onstop = resolve; });
      const callT = cap.contextTimeAt(performance.now());
      rec.start();
      await sleep(1500);
      rec.stop();
      await stopped;
      const pcm = cap.frames.slice();
      // True onset: first frame ≥ 10 dB over the floor, within 400 ms before detection.
      const onset = pcm.find(([t, r]) => t > detected - 0.4 && db(r) > floor + 10)?.[0] ?? detected;
      try {
        const decoded = await decode(new Blob(chunks, { type: rec.mimeType }));
        const recStart = align(envelope(decoded.samples, decoded.rate), pcm, callT - 0.3, callT + 0.5);
        take = { ...take, mimeType: rec.mimeType, detectLatencyMs: Math.round((detected - onset) * 1000), startCallLatencyMs: Math.round((callT - detected) * 1000), clippedMs: recStart === null ? null : Math.max(0, Math.round((recStart - onset) * 1000)), decodedS: Number(decoded.duration.toFixed(2)) };
      } catch (e) {
        take = { ...take, mimeType: rec.mimeType, decodeError: `${e.name}: ${e.message}` };
      }
    }
    await cap.stop();
    takes.push(take);
    show('D', { status: `take ${i} done`, takes });
    $('cue').className = '';
  }
  // Rolling recorder: record continuously in 100 ms slices; keep the first slice (header) + the last ~1 s.
  const rolling = await rollingTrimTest(audioOnly, type);
  stopAll();
  $('cue-text').textContent = 'done';
  const clipped = takes.map((t) => t.clippedMs).filter((v) => typeof v === 'number');
  show('D', { takes, clippedMsMedian: median(clipped), clippedMsMax: clipped.length ? Math.max(...clipped) : null, rolling });
};

async function rollingTrimTest(stream, type) {
  const chunks = [];
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(100);
  await sleep(3000);
  rec.stop();
  await stopped;
  const whole = new Blob(chunks, { type: rec.mimeType });
  const trimmed = new Blob([chunks[0], ...chunks.slice(-10)], { type: rec.mimeType });
  const out = { mimeType: rec.mimeType, slices: chunks.length };
  for (const [name, blob] of [['whole', whole], ['headerPlusLast1s', trimmed]]) {
    try { out[name] = { bytes: blob.size, decodedS: Number((await decode(blob)).duration.toFixed(2)) }; } catch (e) { out[name] = { bytes: blob.size, decodeError: e.name }; }
  }
  return out;
}

// ── E. Formats & sizes ────────────────────────────────────────────────────────────────────────────────
async function record(stream, mimeType, ms) {
  const chunks = [];
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start();
  await sleep(ms);
  rec.stop();
  await stopped;
  return new Blob(chunks, { type: rec.mimeType });
}

function probe(blob) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    const done = (r) => { resolve(r); URL.revokeObjectURL(v.src); };
    v.onloadedmetadata = () => {
      const reported = v.duration;
      if (reported === Infinity) {
        // Chrome's WebM has no duration in the header; seeking far forces it to compute one.
        v.ontimeupdate = () => { v.ontimeupdate = null; done({ plays: true, durationS: Number(v.duration.toFixed(2)), headerDuration: 'Infinity' }); };
        v.currentTime = 1e6;
      } else {
        done({ plays: true, durationS: Number(reported.toFixed(2)), headerDuration: 'present' });
      }
    };
    v.onerror = () => done({ plays: false, error: v.error ? v.error.code : 'unknown' });
    setTimeout(() => done({ plays: false, error: 'timeout' }), 8000);
    v.src = URL.createObjectURL(blob);
  });
}

function link(container, blob, name) {
  const a = document.createElement('a');
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.${ext}`;
  a.textContent = `⬇ ${a.download} (${Math.round(blob.size / 1024)} KB)`;
  container.append(a, document.createElement('br'));
}

$('e-run').onclick = async () => {
  stopAll();
  const stream = await getAV();
  $('links-e').textContent = '';
  const rows = [];
  for (const type of supportedTypes().filter((t) => t.startsWith('video/'))) {
    show('E', { status: `recording ${type}…`, rows });
    try {
      const blob = await record(stream, type, 3000);
      rows.push({ requested: type, got: blob.type, kb: Math.round(blob.size / 1024), kbPerSecond: Math.round(blob.size / 1024 / 3), ...(await probe(blob)) });
      link($('links-e'), blob, type.replace(/[^a-z0-9]+/gi, '-'));
    } catch (e) {
      rows.push({ requested: type, error: `${e.name}: ${e.message}` });
    }
  }
  stopAll();
  show('E', { rows });
};

// ── F. Joining two takes ──────────────────────────────────────────────────────────────────────────────
async function rerecord(blobs, mimeType) {
  // Plays the takes back to back into a canvas + WebAudio mix and records that (works without captureStream on <video>).
  const video = document.createElement('video');
  video.playsInline = true;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const g = canvas.getContext('2d');
  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(video);
  const dest = ctx.createMediaStreamDestination();
  source.connect(dest);
  const mixed = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const chunks = [];
  const rec = new MediaRecorder(mixed, { mimeType });
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  let drawing = true;
  const draw = () => { if (!drawing) return; g.drawImage(video, 0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
  rec.start();
  draw();
  for (const blob of blobs) {
    video.src = URL.createObjectURL(blob);
    await video.play();
    await new Promise((resolve) => { video.onended = resolve; });
  }
  drawing = false;
  rec.stop();
  await stopped;
  await ctx.close();
  return new Blob(chunks, { type: rec.mimeType });
}

$('f-run').onclick = async () => {
  stopAll();
  const stream = await getAV();
  const type = supportedTypes().find((t) => t.startsWith('video/')) ?? '';
  $('links-f').textContent = '';
  show('F', { status: 'recording take 1 (wave!)…' });
  const a = await record(stream, type, 2000);
  show('F', { status: 'recording take 2 (wave again)…' });
  const b = await record(stream, type, 2000);
  stopAll();
  const naive = new Blob([a, b], { type: a.type });
  show('F', { status: 'joining by re-recording (plays both takes, ~4 s)…' });
  let rerecorded = null;
  let rerecordError = null;
  try { rerecorded = await rerecord([a, b], type); } catch (e) { rerecordError = `${e.name}: ${e.message}`; }
  link($('links-f'), naive, 'joined-naive-concat');
  if (rerecorded) link($('links-f'), rerecorded, 'joined-rerecorded');
  show('F', {
    mimeType: a.type,
    take1: await probe(a),
    take2: await probe(b),
    naiveConcat: { kb: Math.round(naive.size / 1024), ...(await probe(naive)) },
    rerecorded: rerecorded ? { kb: Math.round(rerecorded.size / 1024), ...(await probe(rerecorded)) } : { error: rerecordError },
  });
};

// ── G. Audio output ───────────────────────────────────────────────────────────────────────────────────
$('g-list').onclick = async () => {
  let outputs = [];
  try {
    if (navigator.mediaDevices.selectAudioOutput) {
      const chosen = await navigator.mediaDevices.selectAudioOutput();
      outputs = [chosen];
    } else {
      outputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    }
  } catch (e) {
    show('G', { error: `${e.name}: ${e.message}` });
    return;
  }
  $('g-sink').innerHTML = '<option value="">system default</option>' + outputs.map((d) => `<option value="${d.deviceId}">${d.label || d.deviceId.slice(0, 8)}</option>`).join('');
  show('G', { method: navigator.mediaDevices.selectAudioOutput ? 'selectAudioOutput' : 'enumerateDevices', outputs: outputs.map((d) => d.label || '(no label)') });
};
$('g-play').onclick = async () => {
  const audio = new Audio('assets/phrase.wav');
  const sink = $('g-sink').value;
  let sinkResult = 'default';
  if (sink && audio.setSinkId) {
    try { await audio.setSinkId(sink); sinkResult = 'setSinkId ok'; } catch (e) { sinkResult = `setSinkId failed: ${e.name}`; }
  } else if (sink) {
    sinkResult = 'setSinkId unsupported';
  }
  await audio.play();
  show('G', { ...results.sections.G, played: { chosen: $('g-sink').selectedOptions[0]?.textContent ?? 'default', sinkResult } });
};
$('g-save').onclick = () => show('G', { ...results.sections.G, heardOn: $('g-heard').value });

// ── H. Background & lock screen ───────────────────────────────────────────────────────────────────────
let hLog = null;
$('h-start').onclick = async () => {
  stopAll();
  const stream = await getAV();
  const ctx = new AudioContext();
  ctx.createMediaStreamSource(stream);
  const t0 = performance.now();
  hLog = { events: [], stream, ctx };
  const log = (what) => hLog.events.push({ s: Number(((performance.now() - t0) / 1000).toFixed(1)), what });
  log('started');
  document.addEventListener('visibilitychange', () => log(`visibility ${document.visibilityState}`));
  window.addEventListener('pagehide', () => log('pagehide'));
  window.addEventListener('pageshow', () => log('pageshow'));
  ctx.onstatechange = () => log(`audiocontext ${ctx.state}`);
  for (const t of stream.getTracks()) {
    t.onmute = () => log(`${t.kind} muted`);
    t.onunmute = () => log(`${t.kind} unmuted`);
    t.onended = () => log(`${t.kind} ended`);
  }
  show('H', { status: 'running: switch app, come back, lock, unlock, then tap Finish' });
};
$('h-finish').onclick = () => {
  if (!hLog) return;
  const states = hLog.stream.getTracks().map((t) => `${t.kind}: ${t.readyState}${t.muted ? ' (muted)' : ''}`);
  const ctxState = hLog.ctx.state;
  hLog.ctx.close();
  stopAll();
  show('H', { events: hLog.events, finalTrackStates: states, audioContextState: ctxState });
};

// ── Sending ───────────────────────────────────────────────────────────────────────────────────────────
$('device').oninput = () => { results.device = $('device').value.trim(); };
$('send').onclick = async () => {
  results.device = $('device').value.trim() || results.device || 'unnamed';
  try {
    const r = await fetch('/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(results) });
    $('sent').textContent = r.ok ? '✓ sent' : `failed (${r.status})`;
  } catch (e) {
    $('sent').textContent = `failed: ${e.message}`;
  }
};
$('copy').onclick = () => navigator.clipboard.writeText(JSON.stringify(results, null, 1));

try {
  const saved = JSON.parse(localStorage.getItem('capture-lab') || 'null');
  if (saved && saved.userAgent === navigator.userAgent) Object.assign(results.sections, saved.sections);
  results.device = saved?.device ?? '';
  $('device').value = results.device;
  for (const [k, v] of Object.entries(results.sections)) $(`out-${k.toLowerCase()}`).textContent = JSON.stringify(v, null, 1);
} catch { /* nothing saved */ }
capabilities();
