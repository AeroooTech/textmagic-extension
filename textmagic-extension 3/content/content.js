// SnapText Content Script v3.0.1
(function () {
  'use strict';
  if (window.__snapTextV3) return;
  window.__snapTextV3 = true;

  let snippets = [];
  let settings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };
  let dropdown = null;

  // Sync Settings
  chrome.storage.local.get(['snippets', 'settings'], (d) => {
    snippets = d.snippets || [];
    if (d.settings) settings = { ...settings, ...d.settings };
  });

  chrome.storage.onChanged.addListener((ch) => {
    if (ch.snippets) snippets = ch.snippets.newValue || [];
    if (ch.settings) settings = { ...settings, ...(ch.settings.newValue || {}) };
  });

  // Helper: Get Element in Shadow DOM (Zendesk)
  function getEditableElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    const isEditable = (node) => {
      if (!node) return false;
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return true;
      return node.isContentEditable;
    };
    return isEditable(el) ? el : null;
  }

  async function resolveVars(content) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    content = content
      .replace(/\{\{date\}\}/g, `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}`)
      .replace(/\{\{time\}\}/g, `${p(now.getHours())}:${p(now.getMinutes())}`)
      .replace(/\{\{url\}\}/g, window.location.href)
      .replace(/\{\{title\}\}/g, document.title);

    if (content.includes('{{clipboard}}')) {
      try { content = content.replace(/\{\{clipboard\}\}/g, await navigator.clipboard.readText()); }
      catch { content = content.replace(/\{\{clipboard\}\}/g, ''); }
    }
    return content;
  }

  function insertIntoInput(el, clean, triggerLen, hasCursor, cursorIdx) {
    const pos = el.selectionStart;
    const before = el.value.substring(0, pos - triggerLen);
    const after = el.value.substring(pos);
    const fullText = before + clean + after;

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

  // Expansion Logic
  async function expandSnippet(targetEl, snippet, triggerLen) {
    if (dropdown) hideDropdown();
    let content = await resolveVars(snippet.content);
    const hasCursor = content.includes('{{cursor}}');
    const cursorIdx = hasCursor ? content.indexOf('{{cursor}}') : -1;
    const clean = content.replace('{{cursor}}', '');

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      insertIntoInput(targetEl, clean, triggerLen, hasCursor, cursorIdx);
    } else {
      // ContentEditable logic simplified for reliability
      document.execCommand('insertText', false, clean);
    }

    chrome.runtime.sendMessage({ type: 'INCREMENT_USE', id: snippet.id });
    if (settings.toastEnabled !== false) {
      const t = document.createElement('div');
      t.textContent = `⚡ ${snippet.label || snippet.trigger}`;
      Object.assign(t.style, { position:'fixed', bottom:'20px', right:'20px', background:'#6366f1', color:'#fff', padding:'8px 12px', borderRadius:'8px', zIndex:'9999' });
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2000);
    }
  }

  document.addEventListener('keyup', (e) => {
    const el = getEditableElement();
    if (!el) return;

    const val = el.value || el.innerText || "";
    const prefix = settings.prefix || "/";
    
    // Einfache Trigger-Prüfung am Ende des Wortes
    const lastWord = val.split(/\s/).pop();
    if (lastWord && lastWord.startsWith(prefix)) {
      const match = snippets.find(s => s.trigger === lastWord);
      if (match && (e.key === ' ' || e.key === 'Tab')) {
        expandSnippet(el, match, lastWord.length);
      }
    }
  }, true);

  function hideDropdown() { if(dropdown) { dropdown.remove(); dropdown = null; } }
})();
