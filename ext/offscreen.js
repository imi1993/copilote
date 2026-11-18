// Capture le son de l'onglet et l'envoie au moteur de transcription (page du site, dans un cadre).
const ENGINE_ORIGIN = 'https://copilote.harmoniq-ai.fr';
const frame = document.getElementById('engine');
let ctx, stream, proc, chunks = [], engineReady = false, lastSound = Date.now(), tick = 0;
const send = (o) => chrome.runtime.sendMessage({ to: 'panel', ...o }).catch(() => {});

window.addEventListener('message', (e) => {
  if (e.origin !== ENGINE_ORIGIN) return;
  const d = e.data || {};
  if (d.type === 'ready') { engineReady = true; send({ type: 'state', state: 'listening' }); }
  if (d.type === 'busy') send({ type: 'busy', on: d.on });
  if (d.type === 'status') send({ type: 'state', state: 'loading', detail: d.text });
  if (d.type === 'text') send({ type: 'text', text: d.text });
  if (d.type === 'error') send({ type: 'state', state: 'error', error: d.text });
});

async function start(streamId) {
  if (ctx) stop(); // jamais deux captures en même temps
  stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false });
  ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  src.connect(ctx.destination); // la réunion reste audible
  proc = ctx.createScriptProcessor(4096, 1, 1);
  src.connect(proc); proc.connect(ctx.destination);
  chunks = [];
  proc.onaudioprocess = (e) => {
    const d = new Float32Array(e.inputBuffer.getChannelData(0)); let m = 0; for (const x of d) m = Math.max(m, Math.abs(x));
    if (m > 0.01) lastSound = Date.now();
    if (++tick % 3 === 0) chrome.runtime.sendMessage({ to: 'panel', type: 'level', v: m, quiet: Date.now() - lastSound }).catch(() => {});
    chunks.push(d);
    if (chunks.length >= 20) { // environ 5 secondes
      const len = chunks.reduce((s, x) => s + x.length, 0), a = new Float32Array(len); let o = 0;
      for (const c of chunks) { a.set(c, o); o += c.length; }
      chunks = [];
      if (engineReady) frame.contentWindow.postMessage({ type: 'audio', samples: a }, ENGINE_ORIGIN, [a.buffer]);
    }
  };
}
function stop() {
  try { proc && proc.disconnect(); ctx && ctx.close(); stream && stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  send({ type: 'state', state: 'stopped' });
}
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  if (m.to !== 'offscreen') return;
  if (m.type === 'start') { sendResponse({ ok: true }); lastSound = Date.now(); start(m.streamId).catch((e) => send({ type: 'state', state: 'error', error: String(e && e.message || e) })); }
  if (m.type === 'stop') stop();
});
