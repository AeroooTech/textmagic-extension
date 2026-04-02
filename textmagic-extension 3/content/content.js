// SnapText Content Script v3
// Fixes: prefix regex for any char, Zendesk/Shadow DOM, picker via BG relay

(function () {
  'use strict';
  if (window.__snapTextV3) return;
  window.__snapTextV3 = true;

  // ─── State ────────────────────────────────────────────────────────────────
  let snippets = [];
  let settings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };
  let dropdown = null;
  let pickerActive = false;
  let pickerHoverEl = null;
  let pickerBar = null;
  let pickerTooltip = null;

  // ─── Load & sync settings ─────────────────────────────────────────────────
  chrome.storage.local.get(['snippets', 'settings'], (d) => {
    snippets = d.snippets || [];
    if (d.settings) settings = { ...settings, ...d.settings };
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.snippets) snippets = ch.snippets.newValue || [];
    if (ch.settings) settings = { ...settings, ...(ch.settings.newValue || {}) };
  });

  // ─── Variable resolution ──────────────────────────────────────────────────
  async function resolveVars(content) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    content = content
      .replace(/\{\{date\}\}/g,     `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()}`)
      .replace(/\{\{time\}\}/g,     `${p(now.getHours())}:${p(now.getMinutes())}`)
      .replace(/\{\{datetime\}\}/g, `${p(now.getDate())}.${p(now.getMonth()+1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`)
      .replace(/\{\{weekday\}\}/g,  ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][now.getDay()])
      .replace(/\{\{month\}\}/g,    ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][now.getMonth()])
      .replace(/\{\{year\}\}/g,     String(now.getFullYear()))
      .replace(/\{\{url\}\}/g,      window.location.href)
      .replace(/\{\{domain\}\}/g,   window.location.hostname)
      .replace(/\{\{title\}\}/g,    document.title);

    if (content.includes('{{clipboard}}')) {
      try { content = content.replace(/\{\{clipboard\}\}/g, await navigator.clipboard.readText()); }
      catch { content = content.replace(/\{\{clipboard\}\}/g, ''); }
    }

    // Page selectors: {{page:selector}}
    content = content.replace(/\{\{page:([^}]+)\}\}/g, (_, sel) => {
      try {
        const el = document.querySelector(sel);
        if (el) return ('value' in el ? el.value : el.innerText || el.textContent || '').trim();
      } catch {}
      return `[${sel}]`;
    });

    return content;
  }

  // ─── Get text before caret ────────────────────────────────────────────────
  function textBeforeCaret(el) {
    // Standard inputs
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value.substring(0, el.selectionStart);
    }
    // contenteditable (Gmail, Zendesk, Notion, …)
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return '';
      const range = sel.getRangeAt(0).cloneRange();
      try {
        // Move start to beginning of the contenteditable
        range.setStart(el, 0);
        return range.toString().slice(-400);
      } catch {
        // Fallback: walk text nodes manually
        return getTextNodesBefore(sel.anchorNode, sel.anchorOffset, el);
      }
    }
    return '';
  }

  function getTextNodesBefore(node, offset, root) {
    let text = '';
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      if (walk.currentNode === node) { text += walk.currentNode.textContent.slice(0, offset); break; }
      text += walk.currentNode.textContent;
    }
    return text.slice(-400);
  }

  // ─── Insert expanded text ─────────────────────────────────────────────────
  async function expandSnippet(targetEl, snippet, triggerLen) {
    hideDropdown();
    let content = await resolveVars(snippet.content);
    const hasCursor = content.includes('{{cursor}}');
    const cursorIdx = hasCursor ? content.indexOf('{{cursor}}') : -1;
    const clean = content.replace('{{cursor}}', '');

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      insertIntoInput(targetEl, clean, triggerLen, hasCursor, cursorIdx);
    } else if (targetEl.isContentEditable) {
      insertIntoContentEditable(targetEl, clean, triggerLen, hasCursor, cursorIdx);
    } else {
      // Zendesk/other: try to find the real editable inside
      const inner = targetEl.querySelector('[contenteditable="true"],textarea,input');
      if (inner) {
        inner.focus();
        if (inner.tagName === 'INPUT' || inner.tagName === 'TEXTAREA') insertIntoInput(inner, clean, triggerLen, hasCursor, cursorIdx);
        else insertIntoContentEditable(inner, clean, triggerLen, hasCursor, cursorIdx);
      }
    }

    chrome.runtime.sendMessage({ type: 'INCREMENT_USE', id: snippet.id });
    if (settings.toastEnabled !== false) showToast(snippet.label || snippet.trigger);
  }

  function insertIntoInput(el, clean, triggerLen, hasCursor, cursorIdx) {
    const pos = el.selectionStart;
    const before = el.value.substring(0, pos - triggerLen);
    const after  = el.value.substring(pos);

    // Use native value setter so React/Vue detect the change
    const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, before + clean + after);
    else el.value = before + clean + after;

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

    // Delete the trigger characters going backwards from caret
    try {
      const container = range.startContainer;
      if (container.nodeType === Node.TEXT_NODE) {
        const start = Math.max(0, range.startOffset - triggerLen);
        range.setStart(container, start);
        range.deleteContents();
      }
    } catch {}

    // Insert line by line
    const lines = clean.split('\n');
    let cursorNode = null, cursorOff = 0, charCount = 0;

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        // Use <br> for single-line editable, or a new block for multi-line
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
    if (hasCursor && cursorNode) { nr.setStart(cursorNode, Math.min(cursorOff, cursorNode.length)); }
    else { nr.setStart(range.startContainer, range.startOffset); }
    nr.collapse(true);
    sel.addRange(nr);

    // Fire input events for frameworks
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    // Zendesk specifically needs a keyup event to process text
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ', code: 'Space' }));
  }

  // ─── Buffer matching with any prefix ─────────────────────────────────────
  // KEY FIX: We can't rely on word-boundary for arbitrary prefix chars like '-'
  // Strategy: scan text backwards from caret, collect non-whitespace chars,
  // check if that string starts with the configured prefix.

  function getBufferAtCaret(text, prefix) {
    // Walk backwards in text from end, collect non-whitespace run
    let i = text.length - 1;
    while (i >= 0 && text[i] !== ' ' && text[i] !== '\n' && text[i] !== '\t') i--;
    const word = text.substring(i + 1);
    if (word.startsWith(prefix)) return word;
    return null;
  }

  // ─── Dropdown ─────────────────────────────────────────────────────────────
  function showDropdown(anchorEl, matches, buffer) {
    hideDropdown();
    if (!matches.length || settings.dropdownEnabled === false) return;

    dropdown = document.createElement('div');
    dropdown.setAttribute('data-st', 'dd');
    Object.assign(dropdown.style, {
      position: 'fixed', zIndex: '2147483647',
      background: '#1a1730', border: '1px solid #4f46e5',
      borderRadius: '11px', overflow: 'hidden',
      boxShadow: '0 12px 48px rgba(79,70,229,.55)',
      minWidth: '290px', maxWidth: '420px',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      fontSize: '13px', color: '#e0e7ff',
    });

    // Position
    const r = anchorEl.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 160;
    dropdown.style.left = Math.min(r.left, window.innerWidth - 310) + 'px';
    if (below) dropdown.style.top  = (r.bottom + 5) + 'px';
    else        dropdown.style.bottom = (window.innerHeight - r.top + 5) + 'px';

    // Header
    const hdr = mkEl('div', { padding:'5px 12px', fontSize:'10px', color:'#6366f1',
      fontWeight:'700', textTransform:'uppercase', letterSpacing:'.8px',
      borderBottom:'1px solid rgba(99,102,241,.2)', background:'rgba(99,102,241,.07)' });
    hdr.textContent = '⚡ SnapText';
    dropdown.appendChild(hdr);

    let sel = 0;
    const rows = [];

    const hilite = idx => rows.forEach((r, i) => r.style.background = i === idx ? 'rgba(99,102,241,.2)' : 'transparent');

    matches.slice(0, 8).forEach((sn, idx) => {
      const row = mkEl('div', {
        display:'flex', alignItems:'center', gap:'10px', padding:'9px 14px',
        cursor:'pointer', transition:'background .08s',
        background: idx === 0 ? 'rgba(99,102,241,.2)' : 'transparent',
        borderBottom: idx < matches.length - 1 ? '1px solid rgba(99,102,241,.12)' : 'none'
      });
      const badge = mkEl('span', { background:'#312e81', padding:'2px 8px', borderRadius:'5px',
        fontSize:'11px', fontWeight:'700', color:'#a5b4fc', whiteSpace:'nowrap',
        flexShrink:'0', fontFamily:'monospace' });
      badge.textContent = sn.trigger;

      const info = mkEl('div', { flex:'1', minWidth:'0' });
      const lbl  = mkEl('div', { fontWeight:'600', fontSize:'12.5px', color:'#e0e7ff',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' });
      lbl.textContent = sn.label || 'Snippet';
      const prv  = mkEl('div', { fontSize:'11px', color:'#5a5e8a',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' });
      prv.textContent = sn.content.replace(/\n/g,' ').slice(0, 44) + (sn.content.length > 44 ? '…' : '');
      info.append(lbl, prv);
      row.append(badge, info);

      row.addEventListener('mouseenter', () => hilite(idx));
      row.addEventListener('mousedown', e => { e.preventDefault(); expandSnippet(anchorEl, sn, buffer.length); });
      dropdown.appendChild(row);
      rows.push(row);
    });

    const ftr = mkEl('div', { padding:'5px 12px', fontSize:'10px', color:'#3a3d65',
      borderTop:'1px solid rgba(99,102,241,.12)', background:'rgba(0,0,0,.18)' });
    ftr.textContent = '↑↓ · Enter/Tab einfügen · Esc schließen';
    dropdown.appendChild(ftr);
    document.body.appendChild(dropdown);

    dropdown._nav = e => {
      const len = rows.length;
      if (e.key === 'ArrowDown')  { e.preventDefault(); hilite(sel = (sel + 1) % len); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hilite(sel = (sel - 1 + len) % len); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        if (matches[sel]) expandSnippet(anchorEl, matches[sel], buffer.length);
        hideDropdown();
      } else if (e.key === 'Escape') { hideDropdown(); }
    };
    document.addEventListener('keydown', dropdown._nav, true);
  }

  function hideDropdown() {
    if (!dropdown) return;
    if (dropdown._nav) document.removeEventListener('keydown', dropdown._nav, true);
    dropdown.remove(); dropdown = null;
  }

  function mkEl(tag, styles = {}) {
    const el = document.createElement(tag);
    Object.assign(el.style, styles);
    return el;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(label) {
    document.getElementById('st-toast')?.remove();
    const t = mkEl('div', {
      position:'fixed', bottom:'22px', right:'22px',
      background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
      color:'#fff', padding:'8px 16px', borderRadius:'9px',
      fontSize:'13px', fontFamily:'system-ui,sans-serif', fontWeight:'600',
      zIndex:'2147483647', boxShadow:'0 4px 24px rgba(99,102,241,.55)',
      opacity:'1', transition:'opacity .3s', pointerEvents:'none'
    });
    t.id = 'st-toast';
    t.textContent = `⚡ ${label}`;
    document.body.appendChild(t);
    setTimeout(() => t.style.opacity = '0', 1600);
    setTimeout(() => t.remove(), 1950);
  }

  // ─── Main keyup ───────────────────────────────────────────────────────────
  document.addEventListener('keyup', handleKey, true);

  function handleKey(e) {
    if (['Shift','Control','Alt','Meta','CapsLock','Dead','Process'].includes(e.key)) return;

    // Let dropdown handle nav keys
    if (dropdown && ['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key)) return;

    const el = getEditableElement();
    if (!el) { hideDropdown(); return; }

    const text   = textBeforeCaret(el);
    const prefix = settings.prefix || '/';
    const buffer = getBufferAtCaret(text, prefix);

    if (!buffer) { hideDropdown(); return; }

    // Space key: was already inserted into the field, strip it then expand
    if (e.key === ' ') {
      const exact = snippets.find(s => s.trigger === buffer);
      if (exact) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          const pos = el.selectionStart;
          // Remove the space that keyup sees already in the field
          const setter = Object.getOwnPropertyDescriptor(
            el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
          const newVal = el.value.substring(0, pos - 1) + el.value.substring(pos);
          if (setter) setter.call(el, newVal); else el.value = newVal;
          el.setSelectionRange(pos - 1, pos - 1);
        } else {
          // contenteditable: delete the space via execCommand
          try { document.execCommand('delete', false); } catch {}
        }
        expandSnippet(el, exact, buffer.length);
        return;
      }
    }

    // Tab: expand if exact match
    if (e.key === 'Tab') {
      const exact = snippets.find(s => s.trigger === buffer);
      if (exact) { e.preventDefault(); expandSnippet(el, exact, buffer.length); return; }
    }

    // Show dropdown for partial matches
    if (buffer.length >= prefix.length) {
      const matches = snippets.filter(s => s.trigger.startsWith(buffer));
      if (matches.length) showDropdown(el, matches, buffer);
      else hideDropdown();
    }
  }

  // ─── Find the currently active editable ──────────────────────────────────
  // Zendesk renders editors inside Shadow DOM, so we need to search through it
  function getEditableElement() {
    let el = document.activeElement;
    if (!el) return null;

    // Traverse into shadow roots
    while (el.shadowRoot) {
      const inner = el.shadowRoot.activeElement;
      if (!inner) break;
      el = inner;
    }

    if (isEditable(el)) return el;

    // Zendesk / Salesforce: look for focused element in all shadow roots
    const fromShadow = findFocusedInShadow(document);
    if (fromShadow) return fromShadow;

    return null;
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' && !['checkbox','radio','file','button','submit','reset'].includes(el.type)) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function findFocusedInShadow(root) {
    const hosts = root.querySelectorAll('*');
    for (const host of hosts) {
      if (!host.shadowRoot) continue;
      const ae = host.shadowRoot.activeElement;
      if (ae && isEditable(ae)) return ae;
      const deeper = findFocusedInShadow(host.shadowRoot);
      if (deeper) return deeper;
    }
    return null;
  }

  // Also listen on click to hide dropdown
  document.addEventListener('click', e => {
    if (dropdown && !dropdown.contains(e.target)) hideDropdown();
  }, true);

  // ─── Page Variable Picker ─────────────────────────────────────────────────
  // Picker is triggered directly by a message from the background/popup.
  // It shows an inspector-style overlay on hover with selector tooltip.

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PING') { sendResponse({ ok: true }); return true; }
    if (msg.type === 'START_PICKER') { startPicker(msg.varName, sendResponse); return true; }
    if (msg.type === 'CANCEL_PICKER') { cancelPicker(); return false; }
  });

  function startPicker(varName, respondFn) {
    if (pickerActive) cancelPicker();
    pickerActive = true;

    // ── Top bar ──
    pickerBar = document.createElement('div');
    Object.assign(pickerBar.style, {
      position:'fixed', top:'0', left:'0', right:'0', height:'48px',
      background:'linear-gradient(90deg,#4338ca,#7c3aed)',
      color:'#fff', display:'flex', alignItems:'center', gap:'14px',
      padding:'0 20px', zIndex:'2147483647',
      fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      fontSize:'14px', fontWeight:'600',
      boxShadow:'0 4px 24px rgba(99,102,241,.6)',
    });
    pickerBar.setAttribute('data-st-picker','1');
    const msg2 = document.createElement('span');
    msg2.style.flex = '1';
    msg2.innerHTML = `🎯 Klicke auf das Element für <strong>"${varName}"</strong> — bewege die Maus um Elemente zu markieren`;
    const cancelBtn = document.createElement('button');
    Object.assign(cancelBtn.style, {
      background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)',
      color:'#fff', padding:'5px 14px', borderRadius:'7px', cursor:'pointer',
      fontSize:'13px', fontFamily:'inherit', fontWeight:'600'
    });
    cancelBtn.textContent = '✕ Abbrechen';
    cancelBtn.onclick = () => { cancelPicker(); respondFn(null); };
    pickerBar.append(msg2, cancelBtn);
    document.body.appendChild(pickerBar);

    // ── Tooltip showing selector ──
    pickerTooltip = document.createElement('div');
    Object.assign(pickerTooltip.style, {
      position:'fixed', zIndex:'2147483647', pointerEvents:'none',
      background:'#1a1730', border:'1px solid #6366f1', borderRadius:'7px',
      padding:'6px 12px', fontSize:'12px', fontFamily:'monospace',
      color:'#a5b4fc', boxShadow:'0 4px 16px rgba(99,102,241,.4)',
      maxWidth:'400px', display:'none', whiteSpace:'nowrap',
      overflow:'hidden', textOverflow:'ellipsis'
    });
    document.body.appendChild(pickerTooltip);

    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click',     onClick, true);
    document.addEventListener('keydown',   onKeydown, true);

    function onHover(e) {
      if (e.target.closest('[data-st-picker]')) return;

      // Restore previous
      if (pickerHoverEl && pickerHoverEl !== e.target) {
        pickerHoverEl.style.outline    = pickerHoverEl._stOut || '';
        pickerHoverEl.style.outlineOffset = pickerHoverEl._stOff || '';
        pickerHoverEl.style.backgroundColor = pickerHoverEl._stBg || '';
      }

      pickerHoverEl = e.target;
      pickerHoverEl._stOut = pickerHoverEl.style.outline;
      pickerHoverEl._stOff = pickerHoverEl.style.outlineOffset;
      pickerHoverEl._stBg  = pickerHoverEl.style.backgroundColor;

      pickerHoverEl.style.outline        = '2px solid #6366f1';
      pickerHoverEl.style.outlineOffset  = '2px';
      pickerHoverEl.style.backgroundColor = 'rgba(99,102,241,.08)';

      // Show selector in tooltip
      const sel = buildSelector(pickerHoverEl);
      const val = getElValue(pickerHoverEl);
      pickerTooltip.textContent = `${sel}${val ? `  →  "${val.slice(0,40)}"` : ''}`;
      pickerTooltip.style.display = 'block';
    }

    function onMove(e) {
      if (!pickerTooltip) return;
      const x = e.clientX + 14, y = e.clientY + 14;
      const tw = pickerTooltip.offsetWidth;
      pickerTooltip.style.left = (x + tw > window.innerWidth ? x - tw - 28 : x) + 'px';
      pickerTooltip.style.top  = Math.min(y, window.innerHeight - 50) + 'px';
    }

    function onClick(e) {
      if (e.target.closest('[data-st-picker]')) return;
      e.preventDefault(); e.stopPropagation();

      const el = pickerHoverEl || e.target;
      const selector = buildSelector(el);
      const value    = getElValue(el);

      cancelPicker();
      respondFn({ selector, value });
    }

    function onKeydown(e) {
      if (e.key === 'Escape') { cancelPicker(); respondFn(null); }
    }

    function cancelPicker() {
      pickerActive = false;
      if (pickerHoverEl) {
        pickerHoverEl.style.outline         = pickerHoverEl._stOut || '';
        pickerHoverEl.style.outlineOffset   = pickerHoverEl._stOff || '';
        pickerHoverEl.style.backgroundColor = pickerHoverEl._stBg  || '';
        pickerHoverEl = null;
      }
      pickerBar?.remove();     pickerBar = null;
      pickerTooltip?.remove(); pickerTooltip = null;
      document.body.style.cursor = '';
      document.removeEventListener('mouseover', onHover,   true);
      document.removeEventListener('mousemove', onMove,    true);
      document.removeEventListener('click',     onClick,   true);
      document.removeEventListener('keydown',   onKeydown, true);
    }
  }

  function cancelPicker() {
    // outer cancelPicker – called via message
    pickerActive = false;
    pickerBar?.remove();     pickerBar = null;
    pickerTooltip?.remove(); pickerTooltip = null;
    if (pickerHoverEl) {
      pickerHoverEl.style.outline         = pickerHoverEl._stOut || '';
      pickerHoverEl.style.outlineOffset   = pickerHoverEl._stOff || '';
      pickerHoverEl.style.backgroundColor = pickerHoverEl._stBg  || '';
      pickerHoverEl = null;
    }
    document.body.style.cursor = '';
  }

  function getElValue(el) {
    if (!el) return '';
    if ('value' in el && el.value !== undefined && el.value !== '') return el.value;
    return (el.innerText || el.textContent || '').trim().slice(0, 80);
  }

  // ─── CSS selector builder ─────────────────────────────────────────────────
  function buildSelector(el) {
    // Use ID if stable-looking
    if (el.id && !/^\d/.test(el.id) && !el.id.includes(' ')) {
      return '#' + CSS.escape(el.id);
    }

    // Build path from element up to a stable ancestor
    const parts = [];
    let cur = el;
    let depth = 0;

    while (cur && cur !== document.body && cur !== document.documentElement && depth < 5) {
      let seg = cur.tagName.toLowerCase();

      if (cur.id && !/^\d/.test(cur.id)) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }

      // Add meaningful classes (skip utility/state classes)
      const goodClasses = Array.from(cur.classList).filter(c =>
        c.length > 2 &&
        !/^(is-|has-|js-|ng-|v-|react-|active|hover|focus|open|closed|show|hide|disabled|selected|checked)/.test(c) &&
        !/^[\d]/.test(c)
      ).slice(0, 2);
      if (goodClasses.length) seg += '.' + goodClasses.map(c => CSS.escape(c)).join('.');

      // Add attribute hints for inputs
      if (cur.tagName === 'INPUT' && cur.name) seg += `[name="${cur.name}"]`;
      if (cur.tagName === 'INPUT' && cur.placeholder) seg += `[placeholder="${cur.placeholder.slice(0,20)}"]`;

      // nth-of-type for disambiguation
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) seg += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      }

      parts.unshift(seg);
      cur = cur.parentElement;
      depth++;
    }

    const fullSel = parts.join(' > ');

    // Validate that selector uniquely matches
    try {
      const found = document.querySelectorAll(fullSel);
      if (found.length === 1 && found[0] === el) return fullSel;
      if (found.length > 1) {
        // Make more specific by adding nth-of-type at the leaf
        const idx = Array.from(found).indexOf(el);
        return fullSel + `:nth-of-type(${idx + 1})`;
      }
    } catch {}

    return fullSel || el.tagName.toLowerCase();
  }

})();
