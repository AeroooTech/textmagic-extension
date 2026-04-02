(function () {
  'use strict';
  if (window.__snapTextV3) return;
  window.__snapTextV3 = true;

  let snippets = [];
  let settings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };

  chrome.storage.local.get(['snippets', 'settings'], (d) => {
    snippets = d.snippets || [];
    if (d.settings) settings = { ...settings, ...d.settings };
  });

  async function expandSnippet(targetEl, snippet, triggerLen) {
    let content = await resolveVars(snippet.content);
    const hasCursor = content.includes('{{cursor}}');
    const cursorIdx = hasCursor ? content.indexOf('{{cursor}}') : -1;
    const clean = content.replace('{{cursor}}', '');

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      insertIntoInput(targetEl, clean, triggerLen, hasCursor, cursorIdx);
    } else {
      insertIntoContentEditable(targetEl, clean, triggerLen, hasCursor, cursorIdx);
    }

    chrome.runtime.sendMessage({ type: 'INCREMENT_USE', id: snippet.id });
    if (settings.toastEnabled !== false) showToast(snippet.label || snippet.trigger);
  }

  function insertIntoInput(el, clean, triggerLen, hasCursor, cursorIdx) {
    const pos = el.selectionStart;
    const before = el.value.substring(0, pos - triggerLen);
    const after = el.value.substring(pos);
    const fullText = before + clean + after;

    // FIX für Zendesk/React: Native Setter verwenden
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value'
    ).set;
    
    if (nativeSetter) nativeSetter.call(el, fullText);
    else el.value = fullText;

    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const newPos = before.length + (hasCursor ? cursorIdx : clean.length);
    el.setSelectionRange(newPos, newPos);
    el.focus();
  }

  function getEditableElement() {
    let el = document.activeElement;
    // Durchsuche Shadow DOM (wichtig für Zendesk)
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) ? el : null;
  }

  // Hilfsfunktionen (resolveVars, showToast, handleKey etc.) hier ergänzen...
  // [Hier den restlichen Code aus deiner ursprünglichen content.js einfügen]
})();
