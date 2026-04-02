// SnapText Content Script v3.0.3
(function () {
  'use strict';
  if (window.__snapTextV3) return;
  window.__snapTextV3 = true;

  let snippets = [];
  let settings = { toastEnabled: true, dropdownEnabled: true };
  let dropdown = null;
  let pickerActive = false, pickerHoverEl = null, pickerBar = null, pickerTooltip = null;

  chrome.storage.local.get(['snippets', 'settings'], (d) => {
    snippets = d.snippets || [];
    if (d.settings) settings = { ...settings, ...d.settings };
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.snippets) snippets = ch.snippets.newValue || [];
    if (ch.settings) settings = { ...settings, ...(ch.settings.newValue || {}) };
  });

  async function resolveVars(content) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    content = content
      .replace(/\{\{date\}\}/g, `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}`)
      .replace(/\{\{time\}\}/g, `${p(now.getHours())}:${p(now.getMinutes())}`)
      .replace(/\{\{datetime\}\}/g, `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`)
      .replace(/\{\{weekday\}\}/g, ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][now.getDay()])
      .replace(/\{\{month\}\}/g, ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][now.getMonth()])
      .replace(/\{\{year\}\}/g, String(now.getFullYear()))
      .replace(/\{\{url\}\}/g, window.location.href)
      .replace(/\{\{domain\}\}/g, window.location.hostname)
      .replace(/\{\{title\}\}/g, document.title);

    if (content.includes('{{clipboard}}')) {
      try { content = content.replace(/\{\{clipboard\}\}/g, await navigator.clipboard.readText()); }
      catch { content = content.replace(/\{\{clipboard\}\}/g, ''); }
    }

    content = content.replace(/\{\{page:([^}]+)\}\}/g, (_, sel) => {
      try { const el = document.querySelector(sel); if (el) return ('value' in el ? el.value : el.innerText || el.textContent || '').trim(); } catch {}
      return `[${sel}]`;
    });
    return content;
  }

  function textBeforeCaret(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value.substring(0, el.selectionStart);
    }
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return '';
      const range = sel.getRangeAt(0).cloneRange();
      try {
        range.setStart(el, 0);
        return range.toString().slice(-400);
      } catch { return ''; }
    }
    return '';
  }

  async function expandSnippet(targetEl, snippet, charsToDelete) {
    hideDropdown();
    let content = await resolveVars(snippet.content);
    const hasCursor = content.includes('{{cursor}}');
    const cursorIdx = hasCursor ? content.indexOf('{{cursor}}') : -1;
    const clean = content.replace('{{cursor}}', '');

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      insertIntoInput(targetEl, clean, charsToDelete, hasCursor, cursorIdx);
    } else {
      insertIntoContentEditable(targetEl, clean, charsToDelete, hasCursor, cursorIdx);
    }

    chrome.runtime.sendMessage({ type: 'INCREMENT_USE', id: snippet.id });
    if (settings.toastEnabled !== false) showToast(snippet.label || snippet.trigger);
  }

  function insertIntoInput(el, clean, triggerLen, hasCursor, cursorIdx) {
    const pos = el.selectionStart;
    const before = el.value.substring(0, Math.max(0, pos - triggerLen));
    const after  = el.value.substring(pos);
    const fullText = before + clean + after;

    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (setter) setter.call(el, fullText);
    else el.value = fullText;

    el.dispatchEvent(new InputEvent('input',  { bubbles: true, inputType: 'insertText', data: clean }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    const newPos = before.length + (hasCursor ? cursorIdx : clean.length);
    el.setSelectionRange(newPos, newPos);
    el.focus();
  }

  function insertIntoContentEditable(el, clean, triggerLen, hasCursor, cursorIdx) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    try {
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const start = Math.max(0, range.startOffset - triggerLen);
        range.setStart(container, start);
        range.deleteContents();
      }
    } catch {}

    const lines = clean.split('\n');
    let cursorNode = null, cursorOff = 0, charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
      }
      const tn = document.createTextNode(lines[i]);
      range.insertNode(tn);
      range.setStartAfter(tn);
      range.collapse(true);

      if (hasCursor && !cursorNode) {
        const lineEnd = charCount + lines[i].length;
        if (cursorIdx <= lineEnd) { cursorNode = tn; cursorOff = cursorIdx - charCount; }
      }
      charCount += lines[i].length + 1;
    }

    sel.removeAllRanges();
    const nr = document.createRange();
    if (hasCursor && cursorNode) nr.setStart(cursorNode, Math.min(cursorOff, cursorNode.length));
    else nr.setStart(range.startContainer, range.startOffset);
    nr.collapse(true);
    sel.addRange(nr);

    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', code: 'Space' }));
  }

  function mkEl(tag, styles = {}) { const el = document.createElement(tag); Object.assign(el.style, styles); return el; }

  function showDropdown(anchorEl, matches, buffer) {
    hideDropdown();
    if (!matches.length || settings.dropdownEnabled === false) return;

    dropdown = mkEl('div', {
      position:'fixed', zIndex:'2147483647', background:'#1a1730', border:'1px solid #4f46e5',
      borderRadius:'11px', overflow:'hidden', boxShadow:'0 12px 48px rgba(79,70,229,.55)',
      minWidth:'290px', maxWidth:'420px', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize:'13px', color:'#e0e7ff',
    });

    const r = anchorEl.getBoundingClientRect();
    dropdown.style.left = Math.min(r.left, window.innerWidth - 310) + 'px';
    if (window.innerHeight - r.bottom > 160) dropdown.style.top = (r.bottom + 5) + 'px';
    else dropdown.style.bottom = (window.innerHeight - r.top + 5) + 'px';

    const hdr = mkEl('div', { padding:'5px 12px', fontSize:'10px', color:'#6366f1', fontWeight:'700', textTransform:'uppercase', background:'rgba(99,102,241,.07)' });
    hdr.textContent = '⚡ SnapText';
    dropdown.appendChild(hdr);

    let sel = 0; const rows = [];
    const hilite = idx => rows.forEach((r, i) => r.style.background = i === idx ? 'rgba(99,102,241,.2)' : 'transparent');

    matches.slice(0, 8).forEach((sn, idx) => {
      const row = mkEl('div', { display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px', cursor:'pointer' });
      const badge = mkEl('span', { background:'#312e81', padding:'2px 8px', borderRadius:'5px', fontSize:'11px', fontWeight:'700', color:'#a5b4fc', fontFamily:'monospace' });
      badge.textContent = sn.trigger;
      const info = mkEl('div', { flex:'1', minWidth:'0' });
      const lbl = mkEl('div', { fontWeight:'600', fontSize:'12.5px', color:'#e0e7ff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' });
      lbl.textContent = sn.label || 'Snippet';
      info.append(lbl); row.append(badge, info);
      row.onmouseenter = () => hilite(idx);
      row.onmousedown = e => { e.preventDefault(); expandSnippet(anchorEl, sn, buffer.length); };
      dropdown.appendChild(row); rows.push(row);
    });

    hilite(0);
    document.body.appendChild(dropdown);

    dropdown._nav = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); hilite(sel = (sel + 1) % rows.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hilite(sel = (sel - 1 + rows.length) % rows.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); expandSnippet(anchorEl, matches[sel], buffer.length); }
      else if (e.key === 'Escape') hideDropdown();
    };
    document.addEventListener('keydown', dropdown._nav, true);
  }

  function hideDropdown() {
    if (!dropdown) return;
    if (dropdown._nav) document.removeEventListener('keydown', dropdown._nav, true);
    dropdown.remove(); dropdown = null;
  }

  function showToast(label) {
    document.getElementById('st-toast')?.remove();
    const t = mkEl('div', { position:'fixed', bottom:'22px', right:'22px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', padding:'8px 16px', borderRadius:'9px', fontSize:'13px', fontWeight:'600', zIndex:'2147483647', pointerEvents:'none' });
    t.id = 'st-toast'; t.textContent = `⚡ ${label}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  document.addEventListener('keyup', e => {
    if (['Shift','Control','Alt','Meta','CapsLock','Dead'].includes(e.key)) return;
    if (dropdown && ['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key)) return;

    const el = getEditableElement();
    if (!el) { hideDropdown(); return; }

    const text = textBeforeCaret(el);
    if (!text) { hideDropdown(); return; }

    const match = text.match(/(\S+)(\s*)$/);
    if (!match) { hideDropdown(); return; }

    const triggerWord = match[1];
    const trailingSpace = match[2];

    const exactMatch = snippets.find(s => s.trigger === triggerWord);

    if (exactMatch && (e.key === ' ' || e.key === 'Tab' || e.key === 'Enter')) {
      if (e.key === 'Tab') e.preventDefault();
      const charsToDelete = triggerWord.length + trailingSpace.length;
      expandSnippet(el, exactMatch, charsToDelete);
      return;
    }

    if (trailingSpace === '' && triggerWord.length >= 2) {
      const matches = snippets.filter(s => s.trigger.startsWith(triggerWord));
      if (matches.length) { showDropdown(el, matches, triggerWord); return; }
    }
    
    hideDropdown();
  }, true);

  function getEditableElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    const isEditable = (n) => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable);
    return isEditable(el) ? el : null;
  }

  document.addEventListener('click', e => { if (dropdown && !dropdown.contains(e.target)) hideDropdown(); }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'START_PICKER') { startPicker(msg.varName, sendResponse); return true; }
  });

  function startPicker(varName, respondFn) {
    if (pickerActive) return;
    pickerActive = true;
    pickerBar = mkEl('div', { position:'fixed', top:'0', left:'0', right:'0', height:'48px', background:'linear-gradient(90deg,#4338ca,#7c3aed)', color:'#fff', display:'flex', alignItems:'center', padding:'0 20px', zIndex:'2147483647', fontWeight:'600' });
    pickerBar.setAttribute('data-st-picker','1');
    pickerBar.innerHTML = `<span style="flex:1">🎯 Klicke auf das Element für <strong>"${varName}"</strong></span>`;
    const cancelBtn = mkEl('button', { background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', color:'#fff', padding:'5px 14px', borderRadius:'7px', cursor:'pointer' });
    cancelBtn.textContent = '✕ Abbrechen'; cancelBtn.onclick = () => { cancelPicker(); respondFn(null); };
    pickerBar.appendChild(cancelBtn); document.body.appendChild(pickerBar);

    document.body.style.cursor = 'crosshair';
    const onHover = e => {
      if (e.target.closest('[data-st-picker]')) return;
      if (pickerHoverEl) { pickerHoverEl.style.outline = pickerHoverEl._stOut || ''; pickerHoverEl.style.backgroundColor = pickerHoverEl._stBg || ''; }
      pickerHoverEl = e.target;
      pickerHoverEl._stOut = pickerHoverEl.style.outline; pickerHoverEl._stBg = pickerHoverEl.style.backgroundColor;
      pickerHoverEl.style.outline = '2px solid #6366f1'; pickerHoverEl.style.backgroundColor = 'rgba(99,102,241,.08)';
    };
    const onClick = e => {
      if (e.target.closest('[data-st-picker]')) return;
      e.preventDefault(); e.stopPropagation();
      const el = pickerHoverEl || e.target;
      const selector = buildSelector(el);
      const value = ('value' in el ? el.value : el.innerText || el.textContent || '').trim().slice(0, 80);
      cancelPicker(); respondFn({ selector, value });
    };
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('click', onClick, true);

    function cancelPicker() {
      pickerActive = false;
      if (pickerHoverEl) { pickerHoverEl.style.outline = pickerHoverEl._stOut || ''; pickerHoverEl.style.backgroundColor = pickerHoverEl._stBg || ''; }
      pickerBar?.remove(); pickerBar = null; document.body.style.cursor = '';
      document.removeEventListener('mouseover', onHover, true); document.removeEventListener('click', onClick, true);
    }
  }

  function buildSelector(el) {
    if (el.id && !/^\d/.test(el.id) && !el.id.includes(' ')) return '#' + CSS.escape(el.id);
    let path = [], cur = el;
    while (cur && cur !== document.body && path.length < 3) {
      let seg = cur.tagName.toLowerCase();
      const cls = Array.from(cur.classList).filter(c => !/^(is-|has-|hover|active|focus)/.test(c))[0];
      if (cls) seg += '.' + CSS.escape(cls);
      path.unshift(seg); cur = cur.parentElement;
    }
    return path.join(' > ');
  }
})();
