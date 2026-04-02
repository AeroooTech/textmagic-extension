// SnapText – Background Service Worker v3
// Handles: snippet init, context menu, picker relay between popup↔content

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('snippets');
  if (!data.snippets) {
    const defaults = [
      { id: crypto.randomUUID(), trigger: '/mfg',    content: 'Mit freundlichen Grüßen,\n{{cursor}}', label: 'MFG Grußformel', category: 'E-Mail', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/datum',  content: '{{date}}', label: 'Heutiges Datum', category: 'Datum & Zeit', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/zeit',   content: '{{time}}', label: 'Aktuelle Uhrzeit', category: 'Datum & Zeit', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/clip',   content: '{{clipboard}}', label: 'Zwischenablage', category: 'Allgemein', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/hallo',  content: 'Hallo {{cursor}},\n\nvielen Dank für deine Nachricht.', label: 'Begrüßung', category: 'E-Mail', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/ticket', content: 'Seite: {{title}}\nURL: {{url}}\nDatum: {{date}} {{time}}\n\nBeschreibung: {{cursor}}', label: 'Bug-Ticket', category: 'Support', useCount: 0, createdAt: Date.now() },
    ];
    await chrome.storage.local.set({
      snippets: defaults,
      settings: { prefix: '/', toastEnabled: true, dropdownEnabled: true }
    });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'snaptext-save', title: '⚡ Als SnapText Snippet speichern', contexts: ['selection']
    });
  });
});

// Context menu → save selected text
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'snaptext-save' && info.selectionText) {
    const { snippets = [], settings = {} } = await chrome.storage.local.get(['snippets','settings']);
    const prefix = settings.prefix || '/';
    snippets.push({
      id: crypto.randomUUID(),
      trigger: prefix + 'neu' + Date.now().toString().slice(-4),
      content: info.selectionText,
      label: info.selectionText.slice(0, 40),
      category: 'Allgemein', useCount: 0, createdAt: Date.now()
    });
    await chrome.storage.local.set({ snippets });
  }
});

// ── Message hub ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Increment usage
  if (msg.type === 'INCREMENT_USE') {
    chrome.storage.local.get('snippets').then(d => {
      const snips = (d.snippets || []).map(s =>
        s.id === msg.id ? { ...s, useCount: (s.useCount || 0) + 1 } : s
      );
      chrome.storage.local.set({ snips });
    });
    return false;
  }

  // ── PICKER RELAY ──
  // Popup sends START_PICKER_FROM_POPUP → we inject script if needed → forward to tab content script
  if (msg.type === 'START_PICKER_FROM_POPUP') {
    const { tabId, varName } = msg;

    // Ensure content script is injected
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content/content.js'] },
      () => {
        // Ignore "already injected" errors
        const err = chrome.runtime.lastError;
        // Small delay to let content script init
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', varName }, (result) => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              sendResponse({ error: lastErr.message });
            } else {
              sendResponse(result);
            }
          });
        }, 150);
      }
    );
    return true; // keep sendResponse alive
  }

  return false;
});
