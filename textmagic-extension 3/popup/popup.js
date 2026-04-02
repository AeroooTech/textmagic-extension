// SnapText Popup v3.0.2

let snippets = [];
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
  const d = await chrome.storage.local.get(['snippets']);
  snippets = d.snippets || [];
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
  if (q) filtered = filtered.filter(s => s.trigger.toLowerCase().includes(q) || (s.label||'').toLowerCase().includes(q));
  filtered.sort((a,b) => (b.useCount||0) - (a.useCount||0));

  const el = document.getElementById('list');
  el.innerHTML = '';

  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="ei">${q?'🔍':'⚡'}</div><div>${q ? 'Keine Treffer.' : 'Noch keine Snippets.'}</div></div>`;
    return;
  }

  filtered.forEach(sn => {
    const d = document.createElement('div'); d.className = 'sni';
    d.innerHTML = `<span class="trig">${esc(sn.trigger)}</span><div class="si"><div class="sl2">${esc(sn.label || 'Ohne Titel')}</div><div class="sp">${esc(sn.content.replace(/\n/g,' ').slice(0,40))}…</div></div>
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
      if (btn.dataset.a === 'cp') { await navigator.clipboard.writeText(sn.content); btn.textContent = '✓'; setTimeout(()=>btn.textContent='⎘', 1200); }
      else if (btn.dataset.a === 'ed') openPanel(sn);
      else if (btn.dataset.a === 'dl') { if (confirm(`Löschen?`)) { snippets = snippets.filter(s => s.id !== sn.id); await persist(); } }
    };
  });
}

function openPanel(sn = null) {
  editingId = sn?.id || null;
  document.getElementById('pt').textContent = sn ? '✏ Bearbeiten' : '＋ Neues Snippet';
  document.getElementById('f-t').value = sn ? sn.trigger : '';
  document.getElementById('f-l').value = sn?.label || '';
  document.getElementById('f-c').value = sn?.content || '';
  
  const panel = document.getElementById('panel');
  document.getElementById('spanel').classList.remove('open');
  if (sn || !panel.classList.contains('open')) panel.classList.add('open');
  else panel.classList.remove('open');
}

document.getElementById('btn-add').onclick = () => { document.getElementById('spanel').classList.remove('open'); openPanel(null); };
document.getElementById('btn-set').onclick = () => { document.getElementById('panel').classList.remove('open'); document.getElementById('spanel').classList.toggle('open'); };
document.getElementById('btn-ext').onclick = () => chrome.runtime.openOptionsPage();
document.getElementById('srch').oninput = renderList;

function buildVarTags() {
  const el = document.getElementById('vtags'); el.innerHTML = '';
  VARS.forEach(([v, d]) => {
    const t = document.createElement('span'); t.className = 'vt'; t.textContent = v; t.title = d;
    t.onclick = () => insertAt(document.getElementById('f-c'), v); el.appendChild(t);
  });
}

function insertAt(ta, text) {
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0,s) + text + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + text.length; ta.focus();
}

// Speichern (Präfix-Zwang komplett entfernt!)
document.getElementById('btn-save').onclick = async () => {
  const trigger = document.getElementById('f-t').value.trim();
  const label   = document.getElementById('f-l').value.trim();
  const content = document.getElementById('f-c').value;

  if (!trigger || !content) return alert('Trigger und Inhalt sind Pflicht.');
  if (trigger.includes(' ')) return alert('Trigger darf keine Leerzeichen enthalten!');

  if (editingId) {
    snippets = snippets.map(s => s.id === editingId ? { ...s, trigger, label, content } : s);
    editingId = null;
  } else {
    if (snippets.find(s => s.trigger === trigger)) return alert(`Existiert bereits!`);
    snippets.push({ id: crypto.randomUUID(), trigger, label, content, category: 'Allgemein', useCount: 0, createdAt: Date.now() });
  }

  await persist();
  document.getElementById('panel').classList.remove('open');
};

async function persist() { await chrome.storage.local.set({ snippets }); renderAll(); }
function renderAll() { renderStats(); renderCats(); renderList(); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

init();
