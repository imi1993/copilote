// Copilote de réunion - service worker. Rien ne démarre sans un clic ou le raccourci de l'utilisatrice.
const PLATFORMS = [
  [/^https:\/\/meet\.google\.com\//, 'Google Meet'],
  [/^https:\/\/[^/]*zoom\.us\/(wc|j|s)\//, 'Zoom'],
  [/^https:\/\/teams\.(microsoft|live)\.com\//, 'Teams']
];
const platformOf = (url) => { for (const [re, n] of PLATFORMS) if (re.test(url || '')) return n; return null; };

async function refreshBadge(tabId, url) {
  const p = platformOf(url);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c9b27c' });
  await chrome.action.setBadgeText({ tabId, text: p ? 'OK' : '' });
  await chrome.action.setTitle({ tabId, title: p ? `${p} détecté : démarrer l'écoute` : "Copilote de réunion : démarrer l'écoute (onglet audio)" });
}
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (info.url || info.status === 'complete') refreshBadge(id, tab.url); });
chrome.tabs.onActivated.addListener(async ({ tabId }) => { const t = await chrome.tabs.get(tabId); refreshBadge(tabId, t.url); });

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (!has) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capturer et transcrire le son de la réunion' });
}

chrome.action.onClicked.addListener(async (tab) => {
  // sidePanel.open doit être appelé tout de suite (geste de l'utilisatrice)
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await ensureOffscreen();
    await chrome.storage.session.set({ listening: true, tabId: tab.id, platform: platformOf(tab.url) || 'Onglet' });
    chrome.storage.session.set({ st: { state: 'starting', platform: platformOf(tab.url) || 'Onglet', at: Date.now() } });
    for (let i = 0; i < 8; i++) { // l'écran de capture peut mettre un instant à être prêt
      const ok = await chrome.runtime.sendMessage({ to: 'offscreen', type: 'start', streamId }).catch(() => null);
      if (ok && ok.ok) break;
      await new Promise((r) => setTimeout(r, 400));
    }
  } catch (e) {
    chrome.runtime.sendMessage({ to: 'panel', type: 'state', state: 'error', error: String(e && e.message || e) }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((m) => {
  if (m.to === 'panel' && m.type === 'state') chrome.storage.session.get('st').then(({ st = {} }) => chrome.storage.session.set({ st: { state: m.state, platform: st.platform, detail: m.detail, error: m.error, at: Date.now() } }));
  if (m.to !== 'bg') return;
  if (m.type === 'stop') {
    chrome.runtime.sendMessage({ to: 'offscreen', type: 'stop' }).catch(() => {});
    chrome.storage.session.set({ listening: false });
    setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 500);
  }
});
