// SnapText – Background Service Worker v3.0.1
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('snippets');
  if (!data.snippets) {
    const defaults = [
      { id: crypto.randomUUID(), trigger: '/mfg', content: 'Mit freundlichen Grüßen,\n{{cursor}}', label: 'MFG Grußformel', category: 'E-Mail', useCount: 0, createdAt: Date.now() },
      { id: crypto.randomUUID(), trigger: '/datum', content: '{{date}}', label: 'Heutiges Datum', category: 'Datum & Zeit', useCount: 0, createdAt: Date.now() }
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
    chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] }, () => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: 'START_PICKER', varName }, (result) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(result);
          }
        });
      }, 150);
    });
    return true; 
  }
  return false;
});
