// SnapText – Background Service Worker v3.0.4
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('snippets');
  if (!data.snippets) {
    const defaults = [
      { id: crypto.randomUUID(), trigger: '/mfg', content: 'Mit freundlichen Grüßen,\n{{cursor}}', label: 'MFG Grußformel', category: 'E-Mail', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '!datum', content: '{{date}}', label: 'Heutiges Datum', category: 'Datum & Zeit', useCount: 0, createdAt: Date.now() }
    ];
    await chrome.storage.local.set({
      snippets: defaults,
      settings: { toastEnabled: true, dropdownEnabled: true }
    });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'snaptext-save', title: '⚡ Als SnapText Snippet speichern', contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'snaptext-save' && info.selectionText) {
    const { snippets = [] } = await chrome.storage.local.get('snippets');
    snippets.push({
      id: crypto.randomUUID(),
      trigger: '/' + 'neu' + Date.now().toString().slice(-4),
      content: info.selectionText,
      label: info.selectionText.slice(0, 40),
      category: 'Allgemein', useCount: 0, createdAt: Date.now()
    });
    await chrome.storage.local.set({ snippets });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'INCREMENT_USE') {
    chrome.storage.local.get('snippets').then(d => {
      const updated = (d.snippets || []).map(s =>
        s.id === msg.id ? { ...s, useCount: (s.useCount || 0) + 1 } : s
      );
      chrome.storage.local.set({ snippets: updated });
    });
    return false;
  }

  if (msg.type === 'START_PICKER_FROM_POPUP') {
    const { tabId, varName } = msg;
    chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', varName });
    return false; 
  }
});
