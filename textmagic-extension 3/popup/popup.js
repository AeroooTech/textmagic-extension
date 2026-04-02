let snippets = [];
let settings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };

async function init() {
  const d = await chrome.storage.local.get(['snippets','settings']);
  snippets = d.snippets || [];
  if (d.settings) settings = { ...settings, ...d.settings };
  renderList();
}

async function persist() {
  // FIX: Konsistente Benennung
  await chrome.storage.local.set({ snippets });
  renderList();
}

// [Restliche Funktionen wie renderList, openPanel etc. aus deiner popup.js kopieren]
init();
