window.__radiceAvviata = true;
import { supabase, configurato, chiamaIA } from './db.js';
import { MESI, INIZ, tipo, CATS, GIARDINO, ZONE, ZONA_NOTE, LIVELLI } from './costanti.js';
import { moonAge, phaseName, waxing, moonSvg, monthPhases, TRAD } from './luna.js';
import { $, esc, ICON, toast, leggiLocale, scriviLocale, applyBrand, brandbar, copia } from './ui.js';
import { preparaImmagine } from './immagine.js';

/* ---------- stato ---------- */
const state = {
  uid: null, vivaio: null, piante: [], mine: [], done: new Set(), notifs: [],
  tab: 'home', scanMode: 'recog', filter: 'tutte', query: '', calOffset: 0,
  zona: leggiLocale('radice_zona') || 'nord',
  photoFile: null, photoURL: '', desc: '', busy: false, scanStatus: '', scanError: '', diag: null,
  genBusy: false, genError: '', confirmDel: null, contactOpen: false,
};
let sheetData = null;

const monthNow = () => new Date().getMonth() + 1;
const annoNow = () => new Date().getFullYear();
const byId = id => state.piante.find(p => p.id === id);
const plantOf = m => (m.pianta_id ? byId(m.pianta_id) : m.scheda_ia) || null;
const chiaveFatto = (miaId, anno, mese, i) => `${miaId}|${anno}-${mese}|${i}`;

/* ---------- avvio ---------- */
async function avvio() {
  if (!configurato) {
    return schermata(`<h1 style="font-size:22px">Configurazione mancante</h1><p class="muted">Apri il file <code>config.js</code> nel repository e incolla l'indirizzo e la chiave "anon" del progetto Supabase (Project Settings → API). Dopo un minuto ricarica la pagina.</p>`);
  }
  const params = new URLSearchParams(location.search);
  const slugUrl = params.get('v');
  const piantaUrl = params.get('p');
  const slug = slugUrl || leggiLocale('radice_vivaio');

  // Il cliente non si registra: accesso anonimo, i suoi dati restano legati a questo dispositivo
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      return schermata(`<h1 style="font-size:22px">Accesso non riuscito</h1><p class="muted">Nel progetto Supabase va attivato l'accesso anonimo: Authentication → Sign In / Providers → "Allow anonymous sign-ins".</p><p class="small muted">${esc(error.message)}</p>`);
    }
    session = data.session;
  }
  state.uid = session.user.id;

  if (!slug) return scegliVivaio();
  const { data: viv, error } = await supabase.from('vivai').select('*').eq('slug', slug).maybeSingle();
  if (error) return schermata(`<h1 style="font-size:22px">Errore di collegamento</h1><p class="muted">${esc(error.message)}</p>`);
  if (!viv) { scriviLocale('radice_vivaio', null); return scegliVivaio('Il vivaio del link non esiste più. Scegline uno.'); }

  state.vivaio = viv;
  scriviLocale('radice_vivaio', slug);
  applyBrand(viv.colore);
  document.title = `${viv.nome} · Radice`;

  await supabase.from('clienti_vivaio').upsert({ user_id: state.uid, vivaio_id: viv.id }, { onConflict: 'user_id,vivaio_id', ignoreDuplicates: true });
  await Promise.all([caricaPiante(), caricaMie(), caricaFatte(), caricaNotifiche()]);

  $('#tabbar').hidden = false;
  renderScreen();

  if (piantaUrl) {
    const p = byId(piantaUrl);
    if (p) {
      evento('scan_qr', p.id);
      openScheda(p, { verified: true, note: 'Hai inquadrato il cartellino: questa è la scheda della pianta che hai comprato.' });
    }
    history.replaceState(null, '', `${location.pathname}?v=${encodeURIComponent(slug)}`);
  }
}

function schermata(html) {
  $('#tabbar').hidden = true;
  $('#screen').innerHTML = `<div class="centro"><div class="card">${html}</div></div>`;
}

async function scegliVivaio(avviso) {
  const { data, error } = await supabase.from('vivai').select('slug,nome,luogo,colore').order('nome');
  if (error) return schermata(`<p class="muted">${esc(error.message)}</p>`);
  schermata(`<div><p class="eyebrow">Radice</p><h1 style="font-size:24px">Qual è il tuo vivaio?</h1></div>
    ${avviso ? `<div class="notice">${esc(avviso)}</div>` : ''}
    <p class="small muted">Di solito l'app si apre dal cartellino QR o dal link del vivaio. Se non l'hai, sceglilo qui.</p>
    ${data.length ? `<div class="vivaio-scelta">${data.map(v => `<button data-act="scegli" data-slug="${esc(v.slug)}"><span class="brandlogo" style="background:${esc(v.colore)};color:#fff;border:0">${esc(v.nome[0])}</span><span><b>${esc(v.nome)}</b><br><span class="small muted">${esc(v.luogo)}</span></span>${ICON.chev.replace('<svg', '<svg width="16" height="16"')}</button>`).join('')}</div>`
      : '<p class="notice">Nessun vivaio ancora registrato. Crealo dal pannello vivaio.</p>'}`);
}

/* ---------- dati ---------- */
async function caricaPiante() {
  const { data, error } = await supabase.from('piante').select('*').or(`vivaio_id.is.null,vivaio_id.eq.${state.vivaio.id}`).order('nome');
  if (error) toast('Catalogo non disponibile');
  state.piante = data || [];
}
async function caricaMie() {
  const { data } = await supabase.from('mie_piante').select('*').eq('user_id', state.uid).order('created_at');
  state.mine = data || [];
}
async function caricaFatte() {
  const { data } = await supabase.from('attivita_fatte').select('mia_pianta_id,anno,mese,indice').eq('user_id', state.uid);
  state.done = new Set((data || []).map(r => chiaveFatto(r.mia_pianta_id, r.anno, r.mese, r.indice)));
}
async function caricaNotifiche() {
  const { data } = await supabase.from('notifiche').select('*').eq('vivaio_id', state.vivaio.id).order('created_at', { ascending: false }).limit(20);
  state.notifs = data || [];
}
function evento(tipoEv, piantaId = null, meta = {}) {
  supabase.from('eventi').insert({ user_id: state.uid, vivaio_id: state.vivaio.id, tipo: tipoEv, pianta_id: piantaId, meta }).then(() => {});
}

/* ---------- attività ---------- */
function tasksFor(month) {
  const out = [];
  for (const m of state.mine) {
    const p = plantOf(m); if (!p) continue;
    (p.promemoria || []).forEach((t, i) => {
      if ((t.mesi || []).includes(month)) out.push({ m, p, t, i, k: chiaveFatto(m.id, annoNow(), month, i), mese: month });
    });
  }
  return out;
}
function nextTask(p) {
  const mo = monthNow();
  for (let k = 0; k < 12; k++) {
    const mm = ((mo - 1 + k) % 12) + 1;
    const t = (p.promemoria || []).find(x => (x.mesi || []).includes(mm));
    if (t) return { t, mm, k };
  }
  return null;
}
function level() {
  const n = state.done.size;
  let cur = LIVELLI[0], nxt = null;
  LIVELLI.forEach((l, i) => { if (n >= l[0]) { cur = l; nxt = LIVELLI[i + 1] || null; } });
  return { n, cur, nxt };
}
function taskHtml(x) {
  const done = state.done.has(x.k), tp = tipo(x.t.tipo);
  return `<label class="task ${done ? 'done' : ''}"><input type="checkbox" data-act="done" data-mia="${esc(x.m.id)}" data-mese="${x.mese}" data-i="${x.i}" ${done ? 'checked' : ''}>
    <span><b>${esc(x.t.testo)}</b><span class="meta"><span class="chip dot" style="--c:${tp.c}">${tp.l}</span><span class="small muted">${esc(x.p.nome)}</span></span></span></label>`;
}

/* ---------- schermate ---------- */
function scrHome() {
  const mo = monthNow(), tasks = tasksFor(mo), a = moonAge(new Date()), v = state.vivaio;
  const notifs = state.notifs.slice(0, 3);
  return brandbar(v) + `<div class="pad">
    <div class="actions">
      <button class="action primary" data-act="goscan" data-mode="recog">${ICON.cam}<b>Inquadra una pianta</b><span>Foto di foglie, fiori o frutti: ti diciamo cos'è e come curarla</span></button>
      <button class="action" data-act="goscan" data-mode="diag">${ICON.bug}<b>C'è un problema?</b><span>Foglie gialle, macchie, insetti</span></button>
      <button class="action" data-act="tab" data-t="cerca">${ICON.search}<b>Cerca una pianta</b><span>Le schede del vivaio per nome</span></button>
    </div>
    ${v.promo ? `<div class="promo"><span class="eyebrow">Dal vivaio</span><span>${esc(v.promo)}</span></div>` : ''}
    <section class="card"><div class="section-title"><h2>Da fare a ${MESI[mo - 1]}</h2><button class="linkbtn" data-act="tab" data-t="mie">Le mie piante</button></div>
      ${tasks.length ? `<div class="list">${tasks.map(taskHtml).join('')}</div>`
        : `<p class="muted small" style="margin-top:8px">${state.mine.length ? 'Nessuna attività per le tue piante questo mese.' : 'Aggiungi le tue piante per ricevere i promemoria del mese.'}</p>`}
    </section>
    ${notifs.length ? `<section class="card"><div class="section-title"><h2>Messaggi del vivaio</h2></div><div class="list">${notifs.map(n => `<div class="msg"><b>${esc(n.titolo)}</b><span class="small">${esc(n.testo)}</span><span class="small muted">${new Date(n.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</span></div>`).join('')}</div></section>` : ''}
    <button class="card moonrow" style="text-align:left;width:100%" data-act="tab" data-t="cal">${moonSvg(a, 44)}<span><b>${phaseName(a)}</b><br><span class="small muted">Luna ${waxing(a) ? 'crescente' : 'calante'} · apri il calendario</span></span></button>
    <section class="card contact"><div class="section-title"><h2>Chiedi al vivaio</h2></div><p class="small muted">Un dubbio? Scrivi o chiama: ti risponde chi ti ha venduto la pianta.</p>${contactLines('')}</section>
    <p class="small muted" style="text-align:center"><button class="linkbtn" data-act="cambiavivaio">Cambia vivaio</button></p>
  </div>`;
}

function contactLines(pianta) {
  const v = state.vivaio, digits = (v.whatsapp || '').replace(/\D/g, '');
  const testo = pianta ? `Buongiorno, ho una domanda sulla mia pianta: ${pianta}.` : 'Buongiorno, ho una domanda su una pianta.';
  const tel = (v.telefono || '').replace(/[^\d+]/g, '');
  return `${v.telefono ? `<div class="copyline"><span>${esc(v.telefono)}</span><span style="display:flex;gap:6px">${tel ? `<a class="btn quiet" style="padding:6px 10px;font-size:13px" href="tel:${esc(tel)}" data-act="contatto">Chiama</a>` : ''}<button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="copy" data-txt="${esc(v.telefono)}">Copia</button></span></div>` : ''}
    ${digits ? `<a class="btn full" href="https://wa.me/${digits}?text=${encodeURIComponent(testo)}" target="_blank" rel="noopener" data-act="contatto">${ICON.chat} Scrivi su WhatsApp</a>` : ''}
    ${!v.telefono && !digits ? '<p class="small muted">Il vivaio non ha ancora inserito i contatti.</p>' : ''}`;
}

function scrScan() {
  const m = state.scanMode;
  return `<div class="pad"><div><p class="eyebrow">Inquadra</p><h1 style="font-size:24px">${m === 'diag' ? 'Cosa ha la mia pianta?' : 'Che pianta è?'}</h1></div>
    <div class="modes" role="group" aria-label="Cosa vuoi fare">
      <button data-act="mode" data-mode="recog" aria-pressed="${m === 'recog'}">Riconosci la pianta</button>
      <button data-act="mode" data-mode="diag" aria-pressed="${m === 'diag'}">C'è un problema?</button></div>
    <label class="drop ${state.photoURL ? 'has' : ''}" id="drop" for="photo">
      <input type="file" id="photo" accept="image/*" capture="environment">
      ${state.photoURL ? `<img src="${state.photoURL}" alt="Foto scelta">`
        : `<span style="display:grid;gap:8px;justify-items:center">${ICON.cam}<b>Scatta o scegli una foto</b><span class="small muted">${m === 'diag' ? 'Inquadra da vicino la parte malata: foglie, macchie, insetti' : 'Inquadra foglie e fiori, con luce naturale'}</span></span>`}
    </label>
    ${state.photoURL ? '<button class="linkbtn" data-act="clearphoto" style="justify-self:start">Cambia foto</button>' : ''}
    ${m === 'diag' ? `<label class="field" for="desc">Cosa hai notato? (facoltativo)<textarea id="desc" maxlength="600" placeholder="Es. da una settimana le foglie in basso ingialliscono">${esc(state.desc)}</textarea></label>` : ''}
    ${state.busy ? `<div class="status"><span class="spinner"></span><span>${esc(state.scanStatus)}</span></div>`
      : `<button class="btn full" data-act="analyze" ${state.photoFile ? '' : 'disabled'}>${m === 'diag' ? 'Trova il problema' : 'Riconosci la pianta'}</button>`}
    ${state.scanError ? `<div class="notice err">${esc(state.scanError)}</div>` : ''}
    ${m === 'diag' && state.diag ? diagHtml(state.diag) : ''}
    <p class="small muted">Hai il cartellino del vivaio? Inquadra il QR con la fotocamera del telefono: la scheda si apre da sola.</p>
  </div>`;
}

function diagHtml(d) {
  if (d.errore) return `<div class="notice">${esc(d.errore)}</div>`;
  const prob = { alta: 'ok', media: 'ai', bassa: 'ai' }[d.probabilita] || 'ai';
  const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
  return `<section class="card diag" style="display:grid;gap:12px">
    <div><p class="eyebrow">Diagnosi${d.pianta ? ' · ' + esc(d.pianta) : ''}</p><h3>${esc(d.problema || 'Problema non chiaro')}</h3>
      <div class="badges"><span class="chip ${prob}">Probabilità ${esc(d.probabilita || '—')}</span><span class="chip ai">Generata con IA</span></div></div>
    ${d.segni ? `<p class="small">${esc(d.segni)}</p>` : ''}
    ${(d.cosa_fare_oggi || []).length ? `<div class="block"><b>Cosa fare oggi</b><ol>${li(d.cosa_fare_oggi)}</ol></div>` : ''}
    ${(d.prossimi_giorni || []).length ? `<div class="block"><b>Nei prossimi giorni</b><ul>${li(d.prossimi_giorni)}</ul></div>` : ''}
    ${(d.prodotti || []).length ? `<div class="block"><b>Cosa ti serve (lo trovi in vivaio)</b><ul>${li(d.prodotti)}</ul></div>` : ''}
    ${(d.altre_ipotesi || []).length ? `<div class="block"><b>Altre possibilità</b><ul>${li(d.altre_ipotesi)}</ul></div>` : ''}
    <div class="block contact"><b>Chiedi conferma al vivaio</b><p class="small muted">${esc(d.chiedi_al_vivaio || 'Se il problema peggiora in una settimana, porta una foto o un rametto in vivaio.')}</p>${contactLines(d.pianta || '')}</div>
  </section>`;
}

function scrCerca() {
  return `<div class="pad"><div><p class="eyebrow">Cerca</p><h1 style="font-size:24px">Cerca per nome</h1></div>
    <label class="sr" for="q">Nome della pianta</label>
    <input type="search" id="q" placeholder="Es. ortensia, pomodoro, Citrus…" value="${esc(state.query)}" autocomplete="off">
    <div class="filters" role="group" aria-label="Categorie">${CATS.map(([k, l]) => `<button data-act="filter" data-f="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</div>
    <div id="results"></div>
  </div>`;
}
function renderResults() {
  const el = $('#results'); if (!el) return;
  const q = state.query.trim().toLowerCase();
  const res = state.piante.filter(p => (state.filter === 'tutte' || p.categoria === state.filter)
    && (!q || [p.nome, p.latino, ...(p.alias || [])].some(s => String(s).toLowerCase().includes(q))));
  let h = res.length ? `<div class="card"><p class="small muted" style="margin-bottom:4px">${res.length} ${res.length === 1 ? 'pianta' : 'piante'} con scheda verificata</p><div class="list">${res.map(p => `<button class="prow" data-act="open" data-id="${esc(p.id)}"><span class="ini">${esc(p.nome[0])}</span><span><b>${esc(p.nome)}</b><span class="latino small">${esc(p.latino)}</span></span>${ICON.chev}</button>`).join('')}</div></div>` : '';
  if (q.length > 2 && !res.length) {
    h += `<div class="card" style="display:grid;gap:10px"><b>“${esc(state.query)}” non è nel catalogo del vivaio</b>
      <p class="small muted">Possiamo preparare una scheda con l'IA. È indicativa: per piante particolari chiedi conferma al vivaio.</p>
      ${state.genBusy ? '<div class="status"><span class="spinner"></span>Preparo la scheda…</div>' : `<button class="btn" data-act="gen">Crea la scheda di “${esc(state.query)}”</button>`}
      ${state.genError ? `<div class="notice err">${esc(state.genError)}</div>` : ''}</div>`;
  }
  el.innerHTML = h;
}

function scrMie() {
  const L = level();
  const pct = L.nxt ? Math.round((L.n - L.cur[0]) / (L.nxt[0] - L.cur[0]) * 100) : 100;
  return `<div class="pad"><div><p class="eyebrow">Le mie piante</p><h1 style="font-size:24px">${state.mine.length} ${state.mine.length === 1 ? 'pianta' : 'piante'} in cura</h1></div>
    <section class="card level"><div class="section-title"><span><span class="eyebrow">Il tuo livello</span><h2>${L.cur[1]}</h2></span><span class="mono small muted">${L.n} attività fatte</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="small muted">${L.nxt ? `Ancora ${L.nxt[0] - L.n} attività per diventare <b>${L.nxt[1]}</b>. Spunta i promemoria quando li fai.` : 'Hai raggiunto il livello più alto. Complimenti.'}</p></section>
    ${state.mine.length ? `<section class="card"><div class="list">${state.mine.map(m => {
      const p = plantOf(m); if (!p) return '';
      const n = nextTask(p);
      return `<div class="plantcard"><button style="border:0;background:none;padding:0;text-align:left" data-act="openmine" data-id="${esc(m.id)}"><b style="font-size:16px">${esc(p.nome)}</b> <span class="latino small">${esc(p.latino || '')}</span>
        <span class="badges">${m.pianta_id ? '<span class="chip ok">Scheda verificata</span>' : '<span class="chip ai">Scheda IA</span>'}</span>
        ${n ? `<span class="next" style="display:block"><span class="muted">${n.k === 0 ? 'Questo mese' : 'A ' + MESI[n.mm - 1]}:</span> ${esc(n.t.testo)}</span>` : ''}</button>
        <div class="ops"><button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="del" data-id="${esc(m.id)}">${state.confirmDel === m.id ? 'Conferma' : 'Rimuovi'}</button></div></div>`;
    }).join('')}</div></section>`
      : `<div class="card empty">${ICON.leaf.replace('<svg', '<svg width="36" height="36"')}<b>Nessuna pianta ancora</b><span class="small">Inquadra una pianta o apri una scheda, poi tocca “Aggiungi alle mie piante”.</span><button class="btn" data-act="goscan" data-mode="recog">Inquadra una pianta</button></div>`}
  </div>`;
}

function scrCal() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + state.calOffset, 1);
  const y = base.getFullYear(), m = base.getMonth() + 1, isNow = state.calOffset === 0;
  const refDay = isNow ? now : new Date(y, m - 1, 15, 12);
  const a = moonAge(refDay), ph = monthPhases(y, m), tasks = tasksFor(m);
  return `<div class="pad">
    <div class="monthnav"><button class="iconbtn" data-act="cal" data-d="-1" aria-label="Mese precedente">${ICON.back}</button>
      <div style="text-align:center"><p class="eyebrow">Calendario</p><h2>${MESI[m - 1]} ${y}</h2></div>
      <button class="iconbtn" data-act="cal" data-d="1" aria-label="Mese successivo">${ICON.chev}</button></div>
    <label class="field" for="zona">Zona climatica<select id="zona">${Object.entries(ZONE).map(([k, l]) => `<option value="${k}" ${state.zona === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <section class="card luna" style="display:grid;gap:12px">
      <div class="moonrow">${moonSvg(a, 56)}<div><span class="eyebrow">${isNow ? 'Oggi' : 'A metà mese'}</span><h2 style="font-size:19px">${phaseName(a)}</h2><span class="small muted">Luna ${waxing(a) ? 'crescente' : 'calante'}</span></div></div>
      <div class="phases">${ph.map(x => `<div>${moonSvg(x.a, 26)}<b>${x.day} ${MESI[m - 1].slice(0, 3)}</b><span class="muted">${x.n}</span></div>`).join('')}</div>
      <p class="small">${waxing(a) ? TRAD.cresc : TRAD.cal}</p>
      <p class="small muted">Sono usanze della tradizione: gli studi non hanno dimostrato un effetto della luna sulle piante. Stagione, meteo e terreno contano di più.</p>
    </section>
    <section class="card"><div class="section-title"><h2>Nel giardino a ${MESI[m - 1]}</h2></div>
      <ul class="tips" style="margin-top:8px">${GIARDINO[m].map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="small muted" style="margin-top:10px">${ZONA_NOTE[state.zona]}</p></section>
    <section class="card"><div class="section-title"><h2>Le tue piante</h2></div>
      ${tasks.length ? `<div class="list">${tasks.map(taskHtml).join('')}</div>` : '<p class="small muted" style="margin-top:6px">Nessun promemoria per le tue piante in questo mese.</p>'}</section>
  </div>`;
}

/* ---------- scheda ---------- */
function openScheda(p, opts = {}) {
  if (!p) return;
  sheetData = { p, opts }; state.contactOpen = false;
  renderSheet();
  const s = $('#sheet'); s.hidden = false; s.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  setTimeout(() => s.querySelector('[data-act="close"]')?.focus(), 30);
}
function closeSheet() {
  $('#sheet').hidden = true; sheetData = null; document.body.style.overflow = '';
  renderScreen();
}
function renderSheet() {
  if (!sheetData) return;
  const { p, opts } = sheetData, mo = monthNow(), verified = !!opts.verified;
  const owned = state.mine.some(m => (verified ? m.pianta_id === p.id : (!m.pianta_id && m.nome === p.nome)));
  const tipiUsati = [...new Set((p.promemoria || []).map(t => t.tipo))];
  const cells = INIZ.map((l, i) => {
    const dots = (p.promemoria || []).filter(t => (t.mesi || []).includes(i + 1)).map(t => `<i style="--c:${tipo(t.tipo).c}" title="${esc(tipo(t.tipo).l)}"></i>`).join('');
    return `<div class="${i + 1 === mo ? 'now' : ''}"><span>${l}</span>${dots}</div>`;
  }).join('');
  const fact = (k, v) => (v ? `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
  $('#sheet').innerHTML = `<div class="sheet-top"><button class="iconbtn" data-act="close" aria-label="Chiudi scheda">${ICON.back}</button><span class="small muted">${esc(state.vivaio.nome)}</span><span style="width:38px"></span></div>
  <div class="pad">
    ${opts.note ? `<div class="notice">${opts.note}</div>` : ''}
    <div class="tag"><span class="eyebrow">${esc(p.tipo || p.famiglia || '')}</span><h2>${esc(p.nome)}</h2><span class="latino">${esc(p.latino || '')}${p.famiglia ? ' · ' + esc(p.famiglia) : ''}</span>
      <div class="badges">${verified ? '<span class="chip ok">Scheda verificata dal vivaio</span>' : '<span class="chip ai">Generata con IA, da verificare</span>'}${p.rusticita ? `<span class="chip mono">${esc(p.rusticita)}</span>` : ''}${p.fioritura ? `<span class="chip">${esc(p.fioritura)}</span>` : ''}</div></div>
    ${(p.promemoria || []).length ? `<section class="card" style="display:grid;gap:10px"><div class="section-title"><h2>Calendario di cura</h2><span class="small muted">${ZONE[state.zona]}</span></div><div class="calstrip">${cells}</div>
      <div class="legend">${tipiUsati.map(t => `<span><i style="--c:${tipo(t).c}"></i>${tipo(t).l}</span>`).join('')}</div>
      <ul class="tips small">${p.promemoria.map(t => `<li><b>${(t.mesi || []).map(n => (MESI[n - 1] || '').slice(0, 3)).join(', ')}</b>: ${esc(t.testo)}</li>`).join('')}</ul></section>` : ''}
    <section class="card"><dl class="facts" style="margin:0">${fact('Luce', p.esposizione)}${fact('Acqua', p.acqua)}${fact('Terreno', p.terreno)}${fact('Concime', p.concime)}${fact('Potatura', p.potatura)}${fact('Semina e impianto', p.semina)}</dl></section>
    ${(p.migliora || []).length ? `<section class="card"><div class="section-title"><h2>Per fiorire e produrre di più</h2></div><ul class="tips" style="margin-top:8px">${p.migliora.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${(p.problemi || []).length ? `<section class="card"><div class="section-title"><h2>Problemi comuni</h2></div>${p.problemi.map(x => `<details class="prob"><summary>${esc(x.sintomo)}</summary><p><b>Causa:</b> ${esc(x.causa)}</p><p><b>Cosa fare:</b> ${esc(x.rimedio)}</p></details>`).join('')}</section>` : ''}
    ${p.luna ? `<section class="card luna moonrow">${moonSvg(moonAge(new Date()), 40)}<span class="small"><b>Tradizione lunare.</b> ${esc(p.luna)} <span class="muted">Oggi: luna ${waxing(moonAge(new Date())) ? 'crescente' : 'calante'}.</span></span></section>` : ''}
    ${state.contactOpen ? `<section class="card contact" id="contactbox"><div class="section-title"><h2>Chiedi al vivaio</h2></div>${contactLines(p.nome)}</section>` : ''}
  </div>
  <div class="sheet-actions">
    <button class="btn ${owned ? 'ghost' : ''}" data-act="add" ${owned ? 'disabled' : ''}>${owned ? 'Già tra le tue piante' : 'Aggiungi alle mie piante'}</button>
    <button class="btn quiet" data-act="contact">Chiedi al vivaio</button>
  </div>`;
}

/* ---------- IA ---------- */
function normScheda(r) {
  const arr = x => (Array.isArray(x) ? x : []);
  return {
    nome: String(r.nome || 'Pianta'), latino: String(r.latino || ''), famiglia: String(r.famiglia || ''), tipo: String(r.tipo || ''),
    esposizione: r.esposizione || '', acqua: r.acqua || '', terreno: r.terreno || '', concime: r.concime || '', potatura: r.potatura || '', semina: r.semina || '',
    fioritura: r.fioritura || '', rusticita: r.rusticita || '', luna: r.luna || '',
    migliora: arr(r.migliora).map(String).slice(0, 4),
    problemi: arr(r.problemi).filter(x => x && x.sintomo).slice(0, 3).map(x => ({ sintomo: String(x.sintomo), causa: String(x.causa || ''), rimedio: String(x.rimedio || '') })),
    promemoria: arr(r.promemoria).filter(x => x && x.testo).slice(0, 6).map(x => ({ tipo: ['potatura','concime','semina','irrigazione','protezione','raccolta','trattamento'].includes(x.tipo) ? x.tipo : 'trattamento', mesi: arr(x.mesi).map(Number).filter(n => n >= 1 && n <= 12), testo: String(x.testo) })),
  };
}
function matchCatalog(r) {
  const n = String(r.nome || '').toLowerCase().trim();
  const l = String(r.latino || '').toLowerCase().split(' ').slice(0, 2).join(' ');
  return state.piante.find(p => p.nome.toLowerCase() === n || (p.alias || []).includes(n)
      || (l && !p.latino.includes('spp') && p.latino.toLowerCase().split(' ').slice(0, 2).join(' ') === l))
    || state.piante.find(p => n && n.includes(p.nome.toLowerCase()));
}

async function analyze() {
  if (!state.photoFile || state.busy) return;
  const diag = state.scanMode === 'diag';
  state.busy = true; state.scanError = ''; state.diag = null; state.scanStatus = 'Preparo la foto…'; renderScreen();
  try {
    const img = await preparaImmagine(state.photoFile);
    state.scanStatus = diag ? 'Cerco il problema…' : 'Riconosco la pianta…'; renderScreen();
    const r = await chiamaIA({ tipo: diag ? 'diagnosi' : 'riconosci', immagine: img.base64, media_type: img.mediaType, descrizione: diag ? state.desc : '', vivaio_id: state.vivaio.id });
    const ris = r.risultato || {};
    state.busy = false;
    if (diag) { state.diag = ris; renderScreen(); return; }
    if (ris.riconosciuta === false) { state.scanError = (ris.motivo ? ris.motivo + ' ' : '') + 'Prova a inquadrare foglie e fiori da vicino.'; renderScreen(); return; }
    renderScreen();
    const alt = (Array.isArray(ris.alternative) ? ris.alternative : []).map(esc).join(', ');
    const hit = matchCatalog(ris);
    const note = `Riconosciuta come <b>${esc(ris.nome)}</b> · affidabilità ${esc(ris.confidenza || 'media')}.${alt ? ` Potrebbe essere anche: ${alt}.` : ''}${hit ? ' Il vivaio ha una scheda verificata per questa pianta.' : ''}`;
    if (hit) openScheda(hit, { verified: true, note }); else openScheda(normScheda(ris), { verified: false, note });
  } catch (e) {
    state.busy = false; state.scanError = e.message || 'Analisi non riuscita. Riprova.'; renderScreen();
  }
}

async function generate() {
  const q = state.query.trim().slice(0, 80);
  if (!q || state.genBusy) return;
  state.genBusy = true; state.genError = ''; renderResults();
  try {
    const r = await chiamaIA({ tipo: 'scheda', nome: q, vivaio_id: state.vivaio.id });
    const ris = r.risultato || {};
    state.genBusy = false;
    if (ris.riconosciuta === false) { state.genError = ris.motivo || 'Non trovo una pianta con questo nome.'; renderResults(); return; }
    renderResults();
    const hit = matchCatalog(ris);
    if (hit) openScheda(hit, { verified: true }); else openScheda(normScheda(ris), { verified: false, note: 'Scheda preparata con l\'IA a partire dal nome. Per piante particolari chiedi conferma al vivaio.' });
  } catch (e) { state.genBusy = false; state.genError = e.message; renderResults(); }
}

/* ---------- rendering ---------- */
const TABS = [['home', 'Home', ICON.home], ['scan', 'Inquadra', ICON.cam], ['cerca', 'Cerca', ICON.search], ['mie', 'Mie piante', ICON.leaf], ['cal', 'Calendario', ICON.cal]];
function renderTabbar() {
  $('#tabbar').innerHTML = TABS.map(([k, l, i]) => `<button data-act="tab" data-t="${k}" ${state.tab === k ? 'aria-current="page"' : ''}>${i}<span>${l}</span></button>`).join('');
}
function renderScreen() {
  if (!state.vivaio) return;
  const f = { home: scrHome, scan: scrScan, cerca: scrCerca, mie: scrMie, cal: scrCal }[state.tab];
  $('#screen').innerHTML = f();
  if (state.tab === 'cerca') renderResults();
  renderTabbar();
}
function goTab(t) { state.tab = t; state.confirmDel = null; renderScreen(); window.scrollTo({ top: 0 }); }

/* ---------- eventi interfaccia ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'done') return;
  if (a === 'contatto') { evento('contatto', sheetData?.p?.id || null); return; } // link reali: lasciali aprire
  e.preventDefault();
  switch (a) {
    case 'scegli': scriviLocale('radice_vivaio', b.dataset.slug); location.search = `?v=${encodeURIComponent(b.dataset.slug)}`; break;
    case 'cambiavivaio': scriviLocale('radice_vivaio', null); state.vivaio = null; history.replaceState(null, '', location.pathname); scegliVivaio(); break;
    case 'tab': goTab(b.dataset.t); break;
    case 'goscan': state.scanMode = b.dataset.mode; goTab('scan'); break;
    case 'mode': state.scanMode = b.dataset.mode; state.scanError = ''; renderScreen(); break;
    case 'clearphoto': if (state.photoURL) URL.revokeObjectURL(state.photoURL); state.photoFile = null; state.photoURL = ''; state.diag = null; state.scanError = ''; renderScreen(); break;
    case 'analyze': analyze(); break;
    case 'open': { const p = byId(b.dataset.id); evento('apertura_scheda', p?.id); openScheda(p, { verified: true }); break; }
    case 'openmine': { const m = state.mine.find(x => x.id === b.dataset.id); if (m) openScheda(plantOf(m), { verified: !!m.pianta_id }); break; }
    case 'close': closeSheet(); break;
    case 'add': {
      if (!sheetData) break;
      const { p, opts } = sheetData;
      b.disabled = true;
      const riga = opts.verified
        ? { user_id: state.uid, vivaio_id: state.vivaio.id, pianta_id: p.id, nome: p.nome }
        : { user_id: state.uid, vivaio_id: state.vivaio.id, scheda_ia: p, nome: p.nome };
      const { data, error } = await supabase.from('mie_piante').insert(riga).select().single();
      if (error) { toast('Non riesco a salvare: riprova'); b.disabled = false; break; }
      state.mine.push(data); evento('pianta_aggiunta', opts.verified ? p.id : null, { nome: p.nome });
      await caricaNotifiche();
      renderSheet(); toast(`${p.nome} aggiunta alle tue piante`); break;
    }
    case 'contact': state.contactOpen = true; renderSheet(); setTimeout(() => $('#contactbox')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40); break;
    case 'copy': copia(b.dataset.txt, b.closest('.copyline')?.querySelector('span')); evento('contatto', sheetData?.p?.id || null, { azione: 'copia_numero' }); break;
    case 'filter': state.filter = b.dataset.f; document.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', x.dataset.f === state.filter)); renderResults(); break;
    case 'gen': generate(); break;
    case 'del': {
      const id = b.dataset.id;
      if (state.confirmDel === id) {
        const { error } = await supabase.from('mie_piante').delete().eq('id', id);
        if (error) { toast('Non riesco a rimuoverla: riprova'); break; }
        state.mine = state.mine.filter(m => m.id !== id); state.confirmDel = null;
        [...state.done].filter(k => k.startsWith(id + '|')).forEach(k => state.done.delete(k));
        toast('Pianta rimossa');
      } else state.confirmDel = id;
      renderScreen(); break;
    }
    case 'cal': state.calOffset += Number(b.dataset.d); renderScreen(); break;
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.act === 'done') {
    const mia = t.dataset.mia, mese = Number(t.dataset.mese), i = Number(t.dataset.i), anno = annoNow();
    const k = chiaveFatto(mia, anno, mese, i);
    t.disabled = true;
    const { error } = t.checked
      ? await supabase.from('attivita_fatte').insert({ mia_pianta_id: mia, anno, mese, indice: i, user_id: state.uid })
      : await supabase.from('attivita_fatte').delete().match({ mia_pianta_id: mia, anno, mese, indice: i });
    t.disabled = false;
    if (error) { t.checked = !t.checked; toast('Non riesco a salvare: riprova'); return; }
    if (t.checked) { state.done.add(k); toast('Fatto. Il tuo pollice verde cresce'); } else state.done.delete(k);
    document.querySelectorAll(`input[data-act="done"][data-mia="${mia}"][data-mese="${mese}"][data-i="${i}"]`).forEach(x => { x.checked = t.checked; x.closest('.task')?.classList.toggle('done', t.checked); });
    return;
  }
  if (t.id === 'photo') { setPhoto(t.files && t.files[0]); return; }
  if (t.id === 'zona') { state.zona = t.value; scriviLocale('radice_zona', t.value); renderScreen(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { state.query = t.value; state.genError = ''; renderResults(); return; }
  if (t.id === 'desc') state.desc = t.value;
});
function setPhoto(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) { state.scanError = 'Scegli una foto (JPG, PNG o HEIC).'; renderScreen(); return; }
  if (state.photoURL) URL.revokeObjectURL(state.photoURL);
  state.photoFile = f; state.photoURL = URL.createObjectURL(f); state.diag = null; state.scanError = ''; renderScreen();
}
['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); if (ev === 'drop') setPhoto(e.dataTransfer.files[0]); } }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

avvio().catch(err => schermata(`<h1 style="font-size:22px">Qualcosa non ha funzionato</h1><p class="muted">${esc(err.message)}</p>`));
