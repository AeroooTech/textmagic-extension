// SnapText Popup v3.0.1 - Vollständig

let snippets = [];
let settings = { prefix: '/', toastEnabled: true, dropdownEnabled: true };
let activeCat = 'Alle';
let editingId  = null;
let pageVars   = []; 

const VARS = [
  ['{{date}}','Datum'], ['{{time}}','Zeit'], ['{{datetime}}','Datum+Zeit'],
  ['{{weekday}}','Wochentag'], ['{{month}}','Monat'], ['{{year}}','Jahr'],
  ['{{clipboard}}','Zwischenablage'], ['{{cursor}}','Cursor-Pos.'],
  ['{{url}}','URL'], ['{{title}}','Seitentitel'],
];

async function init() {
  const d = await chrome.storage.local.get(['snippets','settings']);
  snippets = d.snippets || [];
  if (d.settings) settings = { ...settings, ...d.settings };

  // Einstellungen laden
  document.getElementById('st-t').checked = settings.toastEnabled !== false;
  document.getElementById('st-d').checked = settings.dropdownEnabled !== false;
  document.getElementById('pfi').value    = settings.prefix || '/';

  buildVarTags();
  renderAll();
}

function renderStats() {
  const uses = snippets.reduce((a,s) => a + (s.useCount||0), 0);
  document.getElementById('sc').textContent = snippets.length;
  document.getElementById('su').textContent = uses;
  document.getElementById('ss').textContent = Math.round(uses * 8 / 60);
}

function renderCats() {
  const cats = ['Alle', ...new Set(snippets.map(s=>s.category).filter(Boolean))];
  const el = document.getElementById('cats');
  el.innerHTML = '';
  cats.forEach(c => {
    const b = document.createElement('button');
    b.className = 'cp' + (c===activeCat ? ' on' : '');
    b.textContent = c;
    b.onclick = () => { activeCat = c; renderCats(); renderList(); };
    el.appendChild(b);
  });
}

function renderList() {
  const q = document.getElementById('srch').value.toLowerCase();
  let filtered = [...snippets];
  if (activeCat !== 'Alle') filtered = filtered.filter(s => s.category === activeCat);
  if (q) filtered = filtered.filter(s =>
    s.trigger.toLowerCase().includes(q) ||
    (s.label||'').toLowerCase().includes(q) ||
    s.content.toLowerCase().includes(q)
  );
  filtered.sort((a,b) => (b.useCount||0) - (a.useCount||0));

  const el = document.getElementById('list');
  el.innerHTML = '';

  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="ei">${q?'🔍':'⚡'}</div>
      <div>${q ? 'Keine Treffer.' : 'Noch keine Snippets.'}</div></div>`;
    return;
  }

  filtered.forEach(sn => {
    const d = document.createElement('div');
    d.className = 'sni';
    d.innerHTML = `
      <span class="trig">${esc(sn.trigger)}</span>
      <div class="si">
        <div class="sl2">${esc(sn.label || 'Ohne Titel')}</div>
        <div class="sp">${esc(sn.content.replace(/\n/g,' ').slice(0,48))}${sn.content.length>48?'…':''}</div>
      </div>
      <div class="sacts">
        <button class="ab" data-id="${sn.id}" data-a="cp" title="Kopieren">⎘</button>
        <button class="ab" data-id="${sn.id}" data-a="ed" title="Bearbeiten">✏</button>
        <button class="ab d" data-id="${sn.id}" data-a="dl" title="Löschen">✕</button>
      </div>`;
    el.appendChild(d);
  });

  el.querySelectorAll('.ab').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const sn = snippets.find(s => s.id === btn.dataset.id);
      if (!sn) return;
      if (btn.dataset.a === 'cp') {
        await navigator.clipboard.writeText(sn.content);
        btn.textContent = '✓'; setTimeout(()=>btn.textContent='⎘', 1200);
      } else if (btn.dataset.a === 'ed') {
        openPanel(sn);
      } else if (btn.dataset.a === 'dl') {
        if (confirm(`"${sn.trigger}" löschen?`)) {
          snippets = snippets.filter(s => s.id !== sn.id);
          await persist();
        }
      }
    };
  });
}

function openPanel(sn = null) {
  editingId = sn?.id || null;
  pageVars  = [];

  document.getElementById('pt').textContent = sn ? '✏ Bearbeiten' : '＋ Neues Snippet';
  document.getElementById('f-t').value = sn ? sn.trigger : (settings.prefix || '/');
  document.getElementById('f-l').value = sn?.label || '';
  document.getElementById('f-c').value = sn?.content || '';

  if (sn) {
    const re = /\{\{page:([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(sn.content)) !== null) {
      pageVars.push({ name: m[1], selector: m[1], preview: '' });
    }
  }

  renderPageVars();
  closePanelStatus();

  const panel = document.getElementById('panel');
  const spanel = document.getElementById('spanel');
  spanel.classList.remove('open');

  if (sn || !panel.classList.contains('open')) panel.classList.add('open');
  else panel.classList.toggle('open');

  if (panel.classList.contains('open')) document.getElementById('f-t').focus();
}

document.getElementById('btn-add').onclick = () => {
  document.getElementById('spanel').classList.remove('open');
  openPanel(null);
};

document.getElementById('btn-set').onclick = () => {
  document.getElementById('panel').classList.remove('open');
  document.getElementById('spanel').classList.toggle('open');
};

document.getElementById('btn-ext').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('srch').oninput = renderList;

function buildVarTags() {
  const el = document.getElementById('vtags');
  el.innerHTML = '';
  VARS.forEach(([v, d]) => {
    const t = document.createElement('span');
    t.className = 'vt'; t.textContent = v; t.title = d;
    t.onclick = () => insertAt(document.getElementById('f-c'), v);
    el.appendChild(t);
  });
}

function insertAt(ta, text) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length;
  ta.focus();
}

document.getElementById('btn-pick').onclick = async () => {
  const varName = prompt('Name für die Seiten-Variable:\n(z.B. Kundenname, Ticketnummer)');
  if (!varName?.trim()) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return alert('Kein aktiver Tab gefunden.');

  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    return alert('Picker funktioniert nicht auf internen Chrome-Seiten.');
  }

  const pickBtn = document.getElementById('btn-pick');
  pickBtn.disabled = true;
  pickBtn.textContent = '⏳ Warte auf Auswahl…';
  showPickerStatus();

  chrome.runtime.sendMessage(
    { type: 'START_PICKER_FROM_POPUP', tabId: tab.id, varName: varName.trim() },
    (result) => {
      pickBtn.disabled = false;
      pickBtn.textContent = '🎯 Element auf Seite auswählen';
      closePanelStatus();

      if (chrome.runtime.lastError || !result || result.error) {
        console.error('Picker error:', chrome.runtime.lastError || result?.error);
        return;
      }

      pageVars.push({ name: varName.trim(), selector: result.selector, preview: result.value || '' });
      renderPageVars();
      insertAt(document.getElementById('f-c'), `{{page:${result.selector}}}`);
    }
  );
};

function showPickerStatus() { document.getElementById('picker-status').classList.add('show'); }
function closePanelStatus() { document.getElementById('picker-status').classList.remove('show'); }

function renderPageVars() {
  const list = document.getElementById('pv-list');
  list.innerHTML = '';
  if (!pageVars.length) return;

  pageVars.forEach((pv, i) => {
    const d = document.createElement('div');
    d.className = 'pvi';
    d.innerHTML = `
      <span class="pvn">${esc(pv.name)}</span>
      <span class="pvs2" title="${esc(pv.selector)}">${esc(pv.selector)}${pv.preview ? ` → "${esc(pv.preview.slice(0,30))}"` : ''}</span>
      <button class="pv-ins" data-i="${i}">+ Einfügen</button>
      <button class="pv-del" data-i="${i}">✕</button>`;
    list.appendChild(d);
  });

  list.querySelectorAll('.pv-ins').forEach(b => {
    b.onclick = () => insertAt(document.getElementById('f-c'), `{{page:${pageVars[+b.dataset.i].selector}}}`);
  });
  list.querySelectorAll('.pv-del').forEach(b => {
    b.onclick = () => { pageVars.splice(+b.dataset.i, 1); renderPageVars(); };
  });
}

document.getElementById('btn-save').onclick = async () => {
  const trigger = document.getElementById('f-t').value.trim();
  const label   = document.getElementById('f-l').value.trim();
  const content = document.getElementById('f-c').value;

  if (!trigger || !content) return alert('Trigger und Inhalt sind Pflichtfelder.');

  const prefix = settings.prefix || '/';
  if (!trigger.startsWith(prefix)) {
    return alert(`Der Trigger muss mit dem Präfix "${prefix}" beginnen.\nBeispiel: ${prefix}mfg`);
  }

  if (editingId) {
    snippets = snippets.map(s => s.id === editingId ? { ...s, trigger, label, content } : s);
    editingId = null;
  } else {
    if (snippets.find(s => s.trigger === trigger)) {
      return alert(`Trigger "${trigger}" existiert bereits. Bitte anderen Namen wählen.`);
    }
    snippets.push({
      id: crypto.randomUUID(), trigger, label, content,
      category: 'Allgemein', useCount: 0, createdAt: Date.now()
    });
  }

  await persist();
  document.getElementById('panel').classList.remove('open');
  pageVars = [];
};

document.getElementById('st-t').onchange = saveSettings;
document.getElementById('st-d').onchange = saveSettings;

document.getElementById('pfbtn').onclick = async () => {
  const v = document.getElementById('pfi').value.trim();
  if (!v) return alert('Präfix darf nicht leer sein.');
  settings.prefix = v;
  await saveSettings();
  const btn = document.getElementById('pfbtn');
  btn.textContent = '✓';
  setTimeout(() => btn.textContent = 'Speichern', 1400);
};

async function saveSettings() {
  settings.toastEnabled    = document.getElementById('st-t').checked;
  settings.dropdownEnabled = document.getElementById('st-d').checked;
  await chrome.storage.local.set({ settings });
}

async function persist() {
  await chrome.storage.local.set({ snippets });
  renderAll();
}

function renderAll() { renderStats(); renderCats(); renderList(); }

function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
