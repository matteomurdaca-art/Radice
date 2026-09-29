window.__radiceAvviata = true;
import { supabase, configurato, chiamaIA } from './db.js';
import { APP, MESI, INIZ, tipo, CATS, CAT_ANIMALI, GIARDINO, ANIMALI_MESE, ZONE, ZONA_NOTE, LIVELLI } from './costanti.js';
import { moonAge, phaseName, waxing, moonSvg, monthPhases, TRAD } from './luna.js';
import { $, esc, ICON, toast, leggiLocale, scriviLocale, applyBrand, brandbar, copia } from './ui.js';
import { preparaImmagine } from './immagine.js';

/* ---------- stato ---------- */
const state = {
  uid: null, vivaio: null, piante: [], mine: [], done: new Set(), notifs: [],
  specie: [], animali: [], doneA: new Set(), animaliAttivi: false,
  tab: 'home', mieiTab: 'piante', scanMode: 'recog', diagSoggetto: 'pianta', filter: 'tutte', query: '', calOffset: 0,
  zona: leggiLocale('radice_zona') || 'nord',
  photoFile: null, photoURL: '', desc: '', busy: false, scanStatus: '', scanError: '', diag: null,
  genBusy: false, genError: '', iaStato: null, confirmDel: null, contactOpen: false,
};
let sheetData = null;

const monthNow = () => new Date().getMonth() + 1;
const annoNow = () => new Date().getFullYear();
const byId = id => state.piante.find(p => p.id === id);
const specieById = id => state.specie.find(s => s.id === id);
const plantOf = m => (m.pianta_id ? byId(m.pianta_id) : m.scheda_ia) || null;
const specieOf = a => (a.specie_id ? specieById(a.specie_id) : a.scheda_ia) || null;
const chiaveFatto = (miaId, anno, mese, i) => `${miaId}|${anno}-${mese}|${i}`;
const oggiISO = () => new Date().toISOString().slice(0, 10);
const dataIt = d => new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

/* ---------- avvio ---------- */
async function avvio() {
  document.title = APP.nome;
  if (!configurato) {
    return schermata(`<h1 style="font-size:22px">Configurazione mancante</h1><p class="muted">Apri il file <code>config.js</code> nel repository e incolla l'indirizzo e la chiave "anon" del progetto Supabase (Project Settings → API). Dopo un minuto ricarica la pagina.</p>`);
  }
  const params = new URLSearchParams(location.search);
  const slugUrl = params.get('v');
  const piantaUrl = params.get('p');
  const specieUrl = params.get('a');
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
  document.title = `${viv.nome} · ${APP.nome}`;

  await supabase.from('clienti_vivaio').upsert({ user_id: state.uid, vivaio_id: viv.id }, { onConflict: 'user_id,vivaio_id', ignoreDuplicates: true });
  await Promise.all([caricaPiante(), caricaMie(), caricaFatte(), caricaNotifiche(), caricaAnimali()]);

  $('#tabbar').hidden = false;
  renderScreen();

  if (piantaUrl || specieUrl) {
    const p = piantaUrl && byId(piantaUrl);
    const s = specieUrl && specieById(specieUrl);
    if (p) { evento('scan_qr', p.id); openScheda(p, { verified: true, note: 'Hai inquadrato il cartellino: questa è la scheda della pianta che hai comprato.' }); }
    else if (s) { evento('scan_qr', null, { specie: s.id }); openSpecie(s, { verified: true, note: 'Hai inquadrato il cartellino: questa è la scheda del tuo animale.' }); }
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
  schermata(`<div><img src="./favicon.svg" alt="" width="56" height="56" style="border-radius:13px;margin-bottom:10px"><p class="eyebrow">${esc(APP.nome)}</p><h1 style="font-size:24px">Qual è il tuo negozio?</h1></div>
    ${avviso ? `<div class="notice">${esc(avviso)}</div>` : ''}
    <p class="small muted">Di solito l'app si apre dal cartellino QR o dal link del negozio. Se non l'hai, sceglilo qui.</p>
    ${data.length ? `<div class="vivaio-scelta">${data.map(v => `<button data-act="scegli" data-slug="${esc(v.slug)}"><span class="brandlogo" style="background:${esc(v.colore)};color:#fff;border:0">${esc(v.nome[0])}</span><span><b>${esc(v.nome)}</b><br><span class="small muted">${esc(v.luogo)}</span></span>${ICON.chev.replace('<svg', '<svg width="16" height="16"')}</button>`).join('')}</div>`
      : '<p class="notice">Nessun negozio ancora registrato. Crealo dal pannello del negozio.</p>'}`);
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
// Gli animali funzionano solo se su Supabase è stato eseguito supabase-animali.sql
async function caricaAnimali() {
  const { data: sp, error } = await supabase.from('specie').select('*').order('nome');
  if (error) { state.animaliAttivi = false; return; }
  state.animaliAttivi = true;
  state.specie = sp || [];
  const [{ data: an }, { data: fa }] = await Promise.all([
    supabase.from('miei_animali').select('*').eq('user_id', state.uid).order('created_at'),
    supabase.from('attivita_animali').select('mio_animale_id,anno,mese,indice').eq('user_id', state.uid),
  ]);
  state.animali = an || [];
  state.doneA = new Set((fa || []).map(r => chiaveFatto(r.mio_animale_id, r.anno, r.mese, r.indice)));
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
      if ((t.mesi || []).includes(month)) out.push({ kind: 'pianta', m, nome: p.nome, t, i, k: chiaveFatto(m.id, annoNow(), month, i), mese: month });
    });
  }
  return out;
}
function tasksAnimali(month) {
  const out = [];
  for (const a of state.animali) {
    const s = specieOf(a); if (!s) continue;
    (s.promemoria || []).forEach((t, i) => {
      if ((t.mesi || []).includes(month)) out.push({ kind: 'animale', m: a, nome: a.nome, t, i, k: chiaveFatto(a.id, annoNow(), month, i), mese: month });
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
  const n = state.done.size + state.doneA.size;
  let cur = LIVELLI[0], nxt = null;
  LIVELLI.forEach((l, i) => { if (n >= l[0]) { cur = l; nxt = LIVELLI[i + 1] || null; } });
  return { n, cur, nxt };
}
function taskHtml(x) {
  const fatto = (x.kind === 'animale' ? state.doneA : state.done).has(x.k), tp = tipo(x.t.tipo);
  return `<label class="task ${fatto ? 'done' : ''}"><input type="checkbox" data-act="done" data-kind="${x.kind}" data-mia="${esc(x.m.id)}" data-mese="${x.mese}" data-i="${x.i}" ${fatto ? 'checked' : ''}>
    <span><b>${esc(x.t.testo)}</b><span class="meta"><span class="chip dot" style="--c:${tp.c}">${tp.l}</span><span class="small muted">${x.kind === 'animale' ? ICON.paw.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"') + ' ' : ''}${esc(x.nome)}</span></span></span></label>`;
}

/* ---------- scorta di cibo ---------- */
function scorta(a) {
  if (!a.cibo_sacco_kg || !a.cibo_g_giorno || !a.cibo_aperto) return null;
  const giorni = Math.floor((Number(a.cibo_sacco_kg) * 1000) / Number(a.cibo_g_giorno));
  const inizio = new Date(a.cibo_aperto + 'T12:00:00');
  const fine = new Date(inizio.getTime() + giorni * 864e5);
  const restano = Math.ceil((fine - new Date()) / 864e5);
  return { giorni, fine: fine.toISOString().slice(0, 10), restano, pct: Math.max(0, Math.min(100, Math.round(restano / giorni * 100))) };
}
function scortaHtml(a, compatta) {
  const s = scorta(a);
  if (!s) return compatta ? '' : '<p class="small muted">Inserisci il sacco di cibo e la dose giornaliera per sapere quando finisce.</p>';
  const stato = s.restano <= 0 ? 'Finito' : s.restano <= 10 ? `Finisce tra ${s.restano} ${s.restano === 1 ? 'giorno' : 'giorni'}` : `Dura fino al ${dataIt(s.fine)}`;
  return `<div class="scorta ${s.restano <= 10 ? 'bassa' : ''}"><div class="scorta-top"><span class="small">${ICON.bag.replace('<svg', '<svg width="15" height="15" style="vertical-align:-2px"')} Cibo: <b>${stato}</b></span><span class="mono small muted">${Number(a.cibo_sacco_kg)} kg · ${a.cibo_g_giorno} g/giorno</span></div><div class="bar"><i style="width:${s.pct}%"></i></div></div>`;
}

/* ---------- schermate ---------- */
function scrHome() {
  const mo = monthNow(), a = moonAge(new Date()), v = state.vivaio;
  const tasks = [...tasksFor(mo), ...tasksAnimali(mo)];
  const notifs = state.notifs.slice(0, 3);
  const inEsaurimento = state.animali.filter(x => { const s = scorta(x); return s && s.restano <= 10; });
  const niente = !state.mine.length && !state.animali.length;
  return brandbar(v) + `<div class="pad">
    <div class="actions">
      <button class="action primary" data-act="goscan" data-mode="recog">${ICON.cam}<b>Inquadra una pianta${state.animaliAttivi ? ' o un animale' : ''}</b><span>Ti diciamo cos'è e come curarlo</span></button>
      <button class="action" data-act="goscan" data-mode="diag">${ICON.bug}<b>C'è un problema?</b><span>${state.animaliAttivi ? 'Foglie rovinate o un animale che non sta bene' : 'Foglie gialle, macchie, insetti'}</span></button>
      ${state.animaliAttivi
        ? `<button class="action" data-act="miei" data-sub="animali">${ICON.paw}<b>I miei animali</b><span>Promemoria, cibo e schede</span></button>`
        : `<button class="action" data-act="tab" data-t="cerca">${ICON.search}<b>Cerca una pianta</b><span>Le schede del vivaio per nome</span></button>`}
    </div>
    ${v.promo ? `<div class="promo"><span class="eyebrow">Dal negozio</span><span>${esc(v.promo)}</span></div>` : ''}
    ${inEsaurimento.length ? `<section class="card riordina"><div class="section-title"><h2>Cibo in esaurimento</h2></div>
      ${inEsaurimento.map(x => `<div class="riordina-riga">${scortaHtml(x, true)}<div class="small muted">${esc(x.nome)}</div>
        <div class="riordina-azioni">${riordinaLink(x)}<button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="saccoNuovo" data-id="${esc(x.id)}">Ho aperto un sacco nuovo</button></div></div>`).join('')}</section>` : ''}
    <section class="card"><div class="section-title"><h2>Da fare a ${MESI[mo - 1]}</h2><button class="linkbtn" data-act="tab" data-t="mie">I miei</button></div>
      ${tasks.length ? `<div class="list">${tasks.map(taskHtml).join('')}</div>`
        : `<p class="muted small" style="margin-top:8px">${niente ? `Aggiungi le tue piante${state.animaliAttivi ? ' e i tuoi animali' : ''} per ricevere i promemoria del mese.` : 'Niente da fare questo mese.'}</p>`}
    </section>
    ${notifs.length ? `<section class="card"><div class="section-title"><h2>Messaggi del negozio</h2></div><div class="list">${notifs.map(n => `<div class="msg"><b>${esc(n.titolo)}</b><span class="small">${esc(n.testo)}</span><span class="small muted">${new Date(n.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</span></div>`).join('')}</div></section>` : ''}
    <button class="card moonrow" style="text-align:left;width:100%" data-act="tab" data-t="cal">${moonSvg(a, 44)}<span><b>${phaseName(a)}</b><br><span class="small muted">Luna ${waxing(a) ? 'crescente' : 'calante'} · apri il calendario</span></span></button>
    <section class="card contact"><div class="section-title"><h2>Chiedi al negozio</h2></div><p class="small muted">Un dubbio? Scrivi o chiama: ti risponde chi ti conosce.</p>${contactLines('')}</section>
    <p class="small muted" style="text-align:center"><button class="linkbtn" data-act="cambiavivaio">Cambia negozio</button></p>
  </div>`;
}

function riordinaLink(a) {
  const v = state.vivaio, digits = (v.whatsapp || '').replace(/\D/g, '');
  const s = specieOf(a);
  const testo = `Buongiorno, vorrei riordinare il cibo per ${a.nome}${s ? ` (${s.nome.toLowerCase()})` : ''}: sacco da ${Number(a.cibo_sacco_kg)} kg. Grazie!`;
  if (digits) return `<a class="btn" style="padding:6px 12px;font-size:13px" href="https://wa.me/${digits}?text=${encodeURIComponent(testo)}" target="_blank" rel="noopener" data-act="contatto" data-meta="riordino">${ICON.chat} Riordina</a>`;
  const tel = (v.telefono || '').replace(/[^\d+]/g, '');
  return tel ? `<a class="btn" style="padding:6px 12px;font-size:13px" href="tel:${esc(tel)}" data-act="contatto" data-meta="riordino">Chiama per riordinare</a>` : '';
}

function contactLines(soggetto) {
  const v = state.vivaio, digits = (v.whatsapp || '').replace(/\D/g, '');
  const testo = soggetto ? `Buongiorno, ho una domanda su: ${soggetto}.` : 'Buongiorno, avrei una domanda.';
  const tel = (v.telefono || '').replace(/[^\d+]/g, '');
  return `${v.telefono ? `<div class="copyline"><span>${esc(v.telefono)}</span><span style="display:flex;gap:6px">${tel ? `<a class="btn quiet" style="padding:6px 10px;font-size:13px" href="tel:${esc(tel)}" data-act="contatto">Chiama</a>` : ''}<button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="copy" data-txt="${esc(v.telefono)}">Copia</button></span></div>` : ''}
    ${digits ? `<a class="btn full" href="https://wa.me/${digits}?text=${encodeURIComponent(testo)}" target="_blank" rel="noopener" data-act="contatto">${ICON.chat} Scrivi su WhatsApp</a>` : ''}
    ${!v.telefono && !digits ? '<p class="small muted">Il negozio non ha ancora inserito i contatti.</p>' : ''}`;
}

function scrScan() {
  const m = state.scanMode, animale = m === 'animale' || (m === 'diag' && state.diagSoggetto === 'animale');
  const titolo = m === 'diag' ? (animale ? 'Cosa ha il mio animale?' : 'Cosa ha la mia pianta?') : m === 'animale' ? 'Che animale è?' : 'Che pianta è?';
  const aiuto = m === 'diag'
    ? (animale ? 'Fotografa la parte che ti preoccupa e descrivi cosa noti' : 'Inquadra da vicino la parte malata: foglie, macchie, insetti')
    : m === 'animale' ? 'Inquadra l\'animale intero, con buona luce' : 'Inquadra foglie e fiori, con luce naturale';
  const serveDesc = m === 'diag' && animale;
  const pronto = state.photoFile || (serveDesc && state.desc.trim().length >= 10);
  return `<div class="pad"><div><p class="eyebrow">Inquadra</p><h1 style="font-size:24px">${titolo}</h1></div>
    <div class="modes ${state.animaliAttivi ? 'tre' : ''}" role="group" aria-label="Cosa vuoi fare">
      <button data-act="mode" data-mode="recog" aria-pressed="${m === 'recog'}">Pianta</button>
      ${state.animaliAttivi ? `<button data-act="mode" data-mode="animale" aria-pressed="${m === 'animale'}">Animale</button>` : ''}
      <button data-act="mode" data-mode="diag" aria-pressed="${m === 'diag'}">C'è un problema?</button></div>
    ${m === 'diag' && state.animaliAttivi ? `<div class="soggetto" role="group" aria-label="Il problema riguarda"><span class="small muted">Riguarda:</span>
      <button data-act="soggetto" data-s="pianta" aria-pressed="${!animale}">${ICON.leaf} una pianta</button>
      <button data-act="soggetto" data-s="animale" aria-pressed="${animale}">${ICON.paw} un animale</button></div>` : ''}
    ${state.photoURL
      ? `<div class="drop has" id="drop"><img src="${state.photoURL}" alt="Foto scelta"></div>`
      : `<div class="drop" id="drop"><span style="display:grid;gap:12px;justify-items:center;width:100%">${animale ? ICON.paw : ICON.cam}<span class="small muted">${aiuto}</span>
        <span class="scelte-foto">
          <label class="btn" for="photo">${ICON.cam} Scatta una foto<input type="file" id="photo" accept="image/*" capture="environment"></label>
          <label class="btn quiet" for="galleria"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8.5"/></svg> Scegli dalla galleria<input type="file" id="galleria" accept="image/*"></label>
        </span></span></div>`}
    ${state.photoURL ? '<button class="linkbtn" data-act="clearphoto" style="justify-self:start">Cambia foto</button>' : ''}
    ${m === 'diag' ? `<label class="field" for="desc">${serveDesc ? 'Cosa hai notato? (se non hai una foto, descrivilo bene)' : 'Cosa hai notato? (facoltativo)'}<textarea id="desc" maxlength="600" placeholder="${serveDesc ? 'Es. cane di 8 anni, da ieri si gratta l\'orecchio destro e scuote la testa' : 'Es. da una settimana le foglie in basso ingialliscono'}">${esc(state.desc)}</textarea></label>` : ''}
    ${state.busy ? `<div class="status"><span class="spinner"></span><span>${esc(state.scanStatus)}</span></div>`
      : `<button class="btn full" data-act="analyze" ${pronto ? '' : 'disabled'}>${m === 'diag' ? (animale ? 'Cosa devo fare?' : 'Trova il problema') : m === 'animale' ? 'Riconosci l\'animale' : 'Riconosci la pianta'}</button>`}
    ${state.scanError ? `<div class="notice err">${esc(state.scanError)}</div>` : ''}
    ${m === 'diag' && state.diag ? (state.diag._animale ? triageHtml(state.diag) : diagHtml(state.diag)) : ''}
    ${m === 'diag' && animale && !state.diag ? '<p class="small muted">Per gli animali l\'app ti aiuta a capire quanto è urgente e cosa fare nel frattempo. Non sostituisce il veterinario.</p>' : ''}
    <p class="small muted">Hai il cartellino del negozio? Inquadra il QR con la fotocamera del telefono: la scheda si apre da sola.</p>
    <div style="display:grid;gap:8px"><button class="linkbtn" style="justify-self:start" data-act="statoia">Controlla il servizio IA</button>${state.iaStato ? `<div class="notice ${state.iaStato.ok ? '' : 'err'}">${state.iaStato.html}</div>` : ''}</div>
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
    ${(d.prodotti || []).length ? `<div class="block"><b>Cosa ti serve (lo trovi in negozio)</b><ul>${li(d.prodotti)}</ul></div>` : ''}
    ${(d.altre_ipotesi || []).length ? `<div class="block"><b>Altre possibilità</b><ul>${li(d.altre_ipotesi)}</ul></div>` : ''}
    <div class="block contact"><b>Chiedi conferma al negozio</b><p class="small muted">${esc(d.chiedi_al_vivaio || 'Se il problema peggiora in una settimana, porta una foto o un rametto in negozio.')}</p>${contactLines(d.pianta || '')}</div>
  </section>`;
}

const URGENZA = {
  subito: { t: 'Vai dal veterinario subito', c: 'crit', s: 'Non aspettare: chiama il veterinario o il pronto soccorso veterinario adesso.' },
  presto: { t: 'Chiama il veterinario entro 1-2 giorni', c: 'warn', s: 'Non è un\'emergenza, ma va fatto vedere presto.' },
  osserva: { t: 'Puoi osservare a casa', c: 'ok', s: 'Tienilo d\'occhio: se peggiora o compaiono altri segni, chiama il veterinario.' },
};
function triageHtml(d) {
  if (d.errore) return `<div class="notice">${esc(d.errore)}</div>`;
  const u = URGENZA[d.urgenza] || URGENZA.presto;
  const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
  return `<section class="card diag triage" style="display:grid;gap:12px">
    <div class="urgenza u-${u.c}"><b>${u.t}</b><span class="small">${esc(d.perche || u.s)}</span></div>
    <div><p class="eyebrow">${esc(d.animale || 'Animale')}</p>${d.cosa_vedo ? `<p class="small">${esc(d.cosa_vedo)}</p>` : ''}</div>
    ${(d.cosa_fare_ora || []).length ? `<div class="block"><b>Cosa puoi fare adesso</b><ol>${li(d.cosa_fare_ora)}</ol></div>` : ''}
    ${(d.cosa_non_fare || []).length ? `<div class="block"><b>Cosa non fare</b><ul>${li(d.cosa_non_fare)}</ul></div>` : ''}
    ${(d.possibili_cause || []).length ? `<div class="block"><b>Possibili cause (da confermare dal veterinario)</b><ul>${li(d.possibili_cause)}</ul></div>` : ''}
    ${d.quando_veterinario ? `<div class="block"><b>Quando andare dal veterinario</b><p class="small">${esc(d.quando_veterinario)}</p></div>` : ''}
    <p class="small muted">Indicazioni generate con IA a partire da foto e descrizione: non sono una diagnosi e non sostituiscono il veterinario. Non dare mai farmaci per persone agli animali.</p>
  </section>`;
}

function scrCerca() {
  const cats = state.animaliAttivi ? CATS : CATS.filter(([k]) => k !== 'animali');
  return `<div class="pad"><div><p class="eyebrow">Cerca</p><h1 style="font-size:24px">Cerca per nome</h1></div>
    <label class="sr" for="q">Nome della pianta o dell'animale</label>
    <input type="search" id="q" placeholder="${state.animaliAttivi ? 'Es. ortensia, pomodoro, gatto, tartaruga…' : 'Es. ortensia, pomodoro, Citrus…'}" value="${esc(state.query)}" autocomplete="off">
    <div class="filters" role="group" aria-label="Categorie">${cats.map(([k, l]) => `<button data-act="filter" data-f="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</div>
    <div id="results"></div>
  </div>`;
}
function renderResults() {
  const el = $('#results'); if (!el) return;
  const q = state.query.trim().toLowerCase();
  const trova = x => !q || [x.nome, x.latino, ...(x.alias || [])].some(s => String(s).toLowerCase().includes(q));
  const piante = state.filter === 'animali' ? [] : state.piante.filter(p => (state.filter === 'tutte' || p.categoria === state.filter) && trova(p));
  const animali = (state.filter === 'tutte' || state.filter === 'animali') ? state.specie.filter(trova) : [];
  const riga = (x, act, ic) => `<button class="prow" data-act="${act}" data-id="${esc(x.id)}"><span class="ini ${act === 'openSpecie' ? 'ini-a' : ''}">${ic || esc(x.nome[0])}</span><span><b>${esc(x.nome)}</b><span class="latino small">${esc(x.latino)}</span></span>${ICON.chev}</button>`;
  let h = '';
  if (animali.length) h += `<div class="card"><p class="small muted" style="margin-bottom:4px">${animali.length} ${animali.length === 1 ? 'animale' : 'animali'} con scheda verificata</p><div class="list">${animali.map(x => riga(x, 'openSpecie', ICON.paw.replace('<svg', '<svg width="20" height="20"'))).join('')}</div></div>`;
  if (piante.length) h += `<div class="card"><p class="small muted" style="margin-bottom:4px">${piante.length} ${piante.length === 1 ? 'pianta' : 'piante'} con scheda verificata</p><div class="list">${piante.map(p => riga(p, 'open')).join('')}</div></div>`;
  if (q.length > 2 && !piante.length && !animali.length) {
    h += `<div class="card" style="display:grid;gap:10px"><b>“${esc(state.query)}” non è nel catalogo del negozio</b>
      <p class="small muted">Possiamo preparare una scheda con l'IA. È indicativa: per casi particolari chiedi conferma al negozio.</p>
      ${state.genBusy ? '<div class="status"><span class="spinner"></span>Preparo la scheda…</div>' : `<button class="btn" data-act="gen">Crea la scheda di “${esc(state.query)}”</button>`}
      ${state.genError ? `<div class="notice err">${esc(state.genError)}</div>` : ''}</div>`;
  }
  el.innerHTML = h;
}

function scrMie() {
  const L = level();
  const pct = L.nxt ? Math.round((L.n - L.cur[0]) / (L.nxt[0] - L.cur[0]) * 100) : 100;
  const sub = state.animaliAttivi ? state.mieiTab : 'piante';
  const livello = `<section class="card level"><div class="section-title"><span><span class="eyebrow">Il tuo livello</span><h2>${L.cur[1]}</h2></span><span class="mono small muted">${L.n} attività fatte</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <p class="small muted">${L.nxt ? `Ancora ${L.nxt[0] - L.n} attività per diventare <b>${L.nxt[1]}</b>. Spunta i promemoria quando li fai.` : 'Hai raggiunto il livello più alto. Complimenti.'}</p></section>`;
  const schede = state.animaliAttivi ? `<div class="modes" role="group" aria-label="Cosa vuoi vedere">
      <button data-act="miei" data-sub="piante" aria-pressed="${sub === 'piante'}">Piante (${state.mine.length})</button>
      <button data-act="miei" data-sub="animali" aria-pressed="${sub === 'animali'}">Animali (${state.animali.length})</button></div>` : '';
  return `<div class="pad"><div><p class="eyebrow">I miei</p><h1 style="font-size:24px">${sub === 'animali' ? `${state.animali.length} ${state.animali.length === 1 ? 'animale' : 'animali'} in cura` : `${state.mine.length} ${state.mine.length === 1 ? 'pianta' : 'piante'} in cura`}</h1></div>
    ${schede}${livello}${sub === 'animali' ? listaAnimali() : listaPiante()}</div>`;
}
function listaPiante() {
  if (!state.mine.length) return `<div class="card empty">${ICON.leaf.replace('<svg', '<svg width="36" height="36"')}<b>Nessuna pianta ancora</b><span class="small">Inquadra una pianta o apri una scheda, poi tocca “Aggiungi alle mie piante”.</span><button class="btn" data-act="goscan" data-mode="recog">Inquadra una pianta</button></div>`;
  return `<section class="card"><div class="list">${state.mine.map(m => {
    const p = plantOf(m); if (!p) return '';
    const n = nextTask(p);
    return `<div class="plantcard"><button style="border:0;background:none;padding:0;text-align:left" data-act="openmine" data-id="${esc(m.id)}"><b style="font-size:16px">${esc(p.nome)}</b> <span class="latino small">${esc(p.latino || '')}</span>
      <span class="badges">${m.pianta_id ? '<span class="chip ok">Scheda verificata</span>' : '<span class="chip ai">Scheda IA</span>'}</span>
      ${n ? `<span class="next" style="display:block"><span class="muted">${n.k === 0 ? 'Questo mese' : 'A ' + MESI[n.mm - 1]}:</span> ${esc(n.t.testo)}</span>` : ''}</button>
      <div class="ops"><button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="del" data-id="${esc(m.id)}">${state.confirmDel === m.id ? 'Conferma' : 'Rimuovi'}</button></div></div>`;
  }).join('')}</div></section>`;
}
function eta(nascita) {
  if (!nascita) return '';
  const mesi = Math.floor((Date.now() - new Date(nascita + 'T12:00:00')) / (30.44 * 864e5));
  if (mesi < 1) return 'meno di un mese';
  if (mesi < 24) return `${mesi} ${mesi === 1 ? 'mese' : 'mesi'}`;
  return `${Math.floor(mesi / 12)} anni`;
}
function listaAnimali() {
  const aggiungi = `<button class="btn full" data-act="nuovoAnimale">${ICON.paw.replace('<svg', '<svg width="18" height="18"')} Aggiungi un animale</button>`;
  if (!state.animali.length) return `<div class="card empty">${ICON.paw.replace('<svg', '<svg width="36" height="36"')}<b>Nessun animale ancora</b><span class="small">Aggiungi il tuo animale: ricevi promemoria su prevenzione, cura e sai quando sta per finire il cibo.</span>${aggiungi}</div>`;
  return `${aggiungi}<section class="card"><div class="list">${state.animali.map(a => {
    const s = specieOf(a), n = s && nextTask(s);
    const dettagli = [s && s.nome, a.razza, eta(a.nascita), a.peso_kg ? `${Number(a.peso_kg)} kg` : ''].filter(Boolean).join(' · ');
    return `<div class="animalcard"><div class="animal-top"><span class="avatar">${esc(a.nome[0].toUpperCase())}</span>
        <button style="border:0;background:none;padding:0;text-align:left;flex:1" data-act="openAnimale" data-id="${esc(a.id)}"><b style="font-size:16px">${esc(a.nome)}</b><span class="small muted" style="display:block">${esc(dettagli)}</span></button></div>
      ${scortaHtml(a, false)}
      ${n ? `<span class="next small"><span class="muted">${n.k === 0 ? 'Questo mese' : 'A ' + MESI[n.mm - 1]}:</span> ${esc(n.t.testo)}</span>` : ''}
      <div class="ops"><button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="modAnimale" data-id="${esc(a.id)}">Modifica</button>
        ${a.cibo_sacco_kg ? `<button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="saccoNuovo" data-id="${esc(a.id)}">Sacco nuovo</button>` : ''}
        <button class="btn quiet" style="padding:6px 10px;font-size:13px" data-act="delAnimale" data-id="${esc(a.id)}">${state.confirmDel === a.id ? 'Conferma' : 'Rimuovi'}</button></div></div>`;
  }).join('')}</div></section>`;
}

function scrCal() {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + state.calOffset, 1);
  const y = base.getFullYear(), m = base.getMonth() + 1, isNow = state.calOffset === 0;
  const refDay = isNow ? now : new Date(y, m - 1, 15, 12);
  const a = moonAge(refDay), ph = monthPhases(y, m), tasks = tasksFor(m), tasksA = tasksAnimali(m);
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
    ${state.animaliAttivi ? `<section class="card"><div class="section-title"><h2>Per gli animali a ${MESI[m - 1]}</h2></div>
      <ul class="tips" style="margin-top:8px">${ANIMALI_MESE[m].map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    <section class="card"><div class="section-title"><h2>Le tue piante</h2></div>
      ${tasks.length ? `<div class="list">${tasks.map(taskHtml).join('')}</div>` : '<p class="small muted" style="margin-top:6px">Nessun promemoria per le tue piante in questo mese.</p>'}</section>
    ${state.animaliAttivi ? `<section class="card"><div class="section-title"><h2>I tuoi animali</h2></div>
      ${tasksA.length ? `<div class="list">${tasksA.map(taskHtml).join('')}</div>` : '<p class="small muted" style="margin-top:6px">Nessun promemoria per i tuoi animali in questo mese.</p>'}</section>` : ''}
  </div>`;
}

/* ---------- schede (piante e animali) ---------- */
function apriSheet(html) {
  $('#sheet').innerHTML = html;
  const s = $('#sheet'); s.hidden = false; s.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  setTimeout(() => s.querySelector('[data-act="close"]')?.focus(), 30);
}
function openScheda(p, opts = {}) {
  if (!p) return;
  sheetData = { kind: 'pianta', p, opts }; state.contactOpen = false;
  renderSheet(); apriSheet($('#sheet').innerHTML);
}
function openSpecie(s, opts = {}) {
  if (!s) return;
  sheetData = { kind: 'specie', p: s, opts }; state.contactOpen = false;
  renderSheet(); apriSheet($('#sheet').innerHTML);
}
function closeSheet() {
  $('#sheet').hidden = true; sheetData = null; document.body.style.overflow = '';
  renderScreen();
}
function calendarioHtml(p) {
  const mo = monthNow();
  const tipiUsati = [...new Set((p.promemoria || []).map(t => t.tipo))];
  const cells = INIZ.map((l, i) => {
    const dots = (p.promemoria || []).filter(t => (t.mesi || []).includes(i + 1)).map(t => `<i style="--c:${tipo(t.tipo).c}" title="${esc(tipo(t.tipo).l)}"></i>`).join('');
    return `<div class="${i + 1 === mo ? 'now' : ''}"><span>${l}</span>${dots}</div>`;
  }).join('');
  if (!(p.promemoria || []).length) return '';
  return `<section class="card" style="display:grid;gap:10px"><div class="section-title"><h2>Calendario di cura</h2><span class="small muted">${ZONE[state.zona]}</span></div><div class="calstrip">${cells}</div>
      <div class="legend">${tipiUsati.map(t => `<span><i style="--c:${tipo(t).c}"></i>${tipo(t).l}</span>`).join('')}</div>
      <ul class="tips small">${p.promemoria.map(t => `<li><b>${(t.mesi || []).length === 12 ? 'tutto l\'anno' : (t.mesi || []).map(n => (MESI[n - 1] || '').slice(0, 3)).join(', ')}</b>: ${esc(t.testo)}</li>`).join('')}</ul></section>`;
}
function renderSheet() {
  if (!sheetData) return;
  if (sheetData.kind === 'specie') return renderSheetSpecie();
  if (sheetData.kind === 'formAnimale') return renderFormAnimale();
  const { p, opts } = sheetData, verified = !!opts.verified;
  const owned = state.mine.some(m => (verified ? m.pianta_id === p.id : (!m.pianta_id && m.nome === p.nome)));
  const fact = (k, v) => (v ? `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
  $('#sheet').innerHTML = `<div class="sheet-top"><button class="iconbtn" data-act="close" aria-label="Chiudi scheda">${ICON.back}</button><span class="small muted">${esc(state.vivaio.nome)}</span><span style="width:38px"></span></div>
  <div class="pad">
    ${opts.note ? `<div class="notice">${opts.note}</div>` : ''}
    <div class="tag"><span class="eyebrow">${esc(p.tipo || p.famiglia || '')}</span><h2>${esc(p.nome)}</h2><span class="latino">${esc(p.latino || '')}${p.famiglia ? ' · ' + esc(p.famiglia) : ''}</span>
      <div class="badges">${verified ? '<span class="chip ok">Scheda verificata dal negozio</span>' : '<span class="chip ai">Generata con IA, da verificare</span>'}${p.rusticita ? `<span class="chip mono">${esc(p.rusticita)}</span>` : ''}${p.fioritura ? `<span class="chip">${esc(p.fioritura)}</span>` : ''}</div></div>
    ${calendarioHtml(p)}
    <section class="card"><dl class="facts" style="margin:0">${fact('Luce', p.esposizione)}${fact('Acqua', p.acqua)}${fact('Terreno', p.terreno)}${fact('Concime', p.concime)}${fact('Potatura', p.potatura)}${fact('Semina e impianto', p.semina)}</dl></section>
    ${(p.migliora || []).length ? `<section class="card"><div class="section-title"><h2>Per fiorire e produrre di più</h2></div><ul class="tips" style="margin-top:8px">${p.migliora.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${(p.problemi || []).length ? `<section class="card"><div class="section-title"><h2>Problemi comuni</h2></div>${p.problemi.map(x => `<details class="prob"><summary>${esc(x.sintomo)}</summary><p><b>Causa:</b> ${esc(x.causa)}</p><p><b>Cosa fare:</b> ${esc(x.rimedio)}</p></details>`).join('')}</section>` : ''}
    ${p.luna ? `<section class="card luna moonrow">${moonSvg(moonAge(new Date()), 40)}<span class="small"><b>Tradizione lunare.</b> ${esc(p.luna)} <span class="muted">Oggi: luna ${waxing(moonAge(new Date())) ? 'crescente' : 'calante'}.</span></span></section>` : ''}
    ${state.contactOpen ? `<section class="card contact" id="contactbox"><div class="section-title"><h2>Chiedi al negozio</h2></div>${contactLines(p.nome)}</section>` : ''}
  </div>
  <div class="sheet-actions">
    <button class="btn ${owned ? 'ghost' : ''}" data-act="add" ${owned ? 'disabled' : ''}>${owned ? 'Già tra le tue piante' : 'Aggiungi alle mie piante'}</button>
    <button class="btn quiet" data-act="contact">Chiedi al negozio</button>
  </div>`;
}
function renderSheetSpecie() {
  const { p, opts } = sheetData, verified = !!opts.verified;
  const fact = (k, v) => (v ? `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
  const mio = opts.animale;
  $('#sheet').innerHTML = `<div class="sheet-top"><button class="iconbtn" data-act="close" aria-label="Chiudi scheda">${ICON.back}</button><span class="small muted">${esc(state.vivaio.nome)}</span><span style="width:38px"></span></div>
  <div class="pad">
    ${opts.note ? `<div class="notice">${opts.note}</div>` : ''}
    <div class="tag tag-a"><span class="eyebrow">${esc(p.tipo || CAT_ANIMALI[p.categoria] || '')}</span><h2>${mio ? esc(mio.nome) : esc(p.nome)}</h2><span class="latino">${mio ? esc([p.nome, mio.razza].filter(Boolean).join(' · ')) : esc(p.latino || '')}</span>
      <div class="badges">${verified ? '<span class="chip ok">Scheda verificata dal negozio</span>' : '<span class="chip ai">Generata con IA, da verificare</span>'}${p.vita ? `<span class="chip">Vive ${esc(p.vita)}</span>` : ''}</div></div>
    ${mio ? `<section class="card" style="display:grid;gap:10px">${scortaHtml(mio, false)}</section>` : ''}
    ${calendarioHtml(p)}
    <section class="card"><dl class="facts" style="margin:0">${fact('Cibo', p.alimentazione)}${fact('Cura', p.cura)}${fact('Ambiente', p.ambiente)}${fact('Salute', p.salute)}</dl></section>
    ${(p.attenzione || []).length ? `<section class="card attenzione"><div class="section-title"><h2>Attenzione</h2></div><ul class="tips" style="margin-top:8px">${p.attenzione.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    <p class="small muted">Per vaccini, antiparassitari e farmaci decide sempre il veterinario.</p>
    ${state.contactOpen ? `<section class="card contact" id="contactbox"><div class="section-title"><h2>Chiedi al negozio</h2></div>${contactLines(mio ? mio.nome : p.nome)}</section>` : ''}
  </div>
  <div class="sheet-actions">
    ${mio ? `<button class="btn" data-act="modAnimale" data-id="${esc(mio.id)}">Modifica ${esc(mio.nome)}</button>`
      : `<button class="btn" data-act="nuovoAnimale" data-specie="${verified ? esc(p.id) : ''}" data-razza="${esc(opts.razza || '')}">Aggiungi ai miei animali</button>`}
    <button class="btn quiet" data-act="contact">Chiedi al negozio</button>
  </div>`;
}

/* ---------- modulo animale ---------- */
function openFormAnimale(animale, preset = {}) {
  sheetData = { kind: 'formAnimale', animale, preset };
  renderFormAnimale(); apriSheet($('#sheet').innerHTML);
}
function renderFormAnimale() {
  const { animale: a, preset } = sheetData;
  const v = a || {};
  const specieSel = v.specie_id || preset.specie || (v.scheda_ia ? 'altro' : '');
  const altroNome = v.scheda_ia ? v.scheda_ia.nome : (preset.altro || '');
  $('#sheet').innerHTML = `<div class="sheet-top"><button class="iconbtn" data-act="close" aria-label="Chiudi">${ICON.back}</button><span class="small muted">${a ? 'Modifica animale' : 'Nuovo animale'}</span><span style="width:38px"></span></div>
  <form class="pad" id="formAnimale" autocomplete="off">
    <div><p class="eyebrow">I miei animali</p><h1 style="font-size:24px">${a ? esc(a.nome) : 'Aggiungi un animale'}</h1></div>
    <label class="field" for="fa-nome">Nome<input type="text" id="fa-nome" required maxlength="60" value="${esc(v.nome || '')}" placeholder="Es. Birba"></label>
    <label class="field" for="fa-specie">Che animale è?<select id="fa-specie" required>
      <option value="" ${!specieSel ? 'selected' : ''} disabled>Scegli…</option>
      ${state.specie.map(s => `<option value="${esc(s.id)}" ${specieSel === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      <option value="altro" ${specieSel === 'altro' ? 'selected' : ''}>Altro…</option></select></label>
    <label class="field" for="fa-altro" id="fa-altro-wrap" ${specieSel === 'altro' ? '' : 'hidden'}>Quale?<input type="text" id="fa-altro" maxlength="60" value="${esc(altroNome)}" placeholder="Es. criceto, pappagallo, cavallo"></label>
    <div class="form2">
      <label class="field" for="fa-razza">Razza (facoltativo)<input type="text" id="fa-razza" maxlength="60" value="${esc(v.razza || preset.razza || '')}"></label>
      <label class="field" for="fa-nascita">Nato il (circa)<input type="date" id="fa-nascita" value="${esc(v.nascita || '')}" max="${oggiISO()}"></label>
      <label class="field" for="fa-peso">Peso in kg<input type="number" id="fa-peso" min="0" step="0.1" inputmode="decimal" value="${v.peso_kg ?? ''}"></label>
    </div>
    <fieldset class="card" style="display:grid;gap:10px;border:1px solid var(--line)"><legend class="small" style="font-weight:600;padding:0 4px">Scorta di cibo (facoltativo)</legend>
      <p class="small muted">Ti avvisiamo quando sta per finire, così lo riordini in negozio in tempo.</p>
      <div class="form2">
        <label class="field" for="fa-sacco">Sacco da (kg)<input type="number" id="fa-sacco" min="0" step="0.1" inputmode="decimal" value="${v.cibo_sacco_kg ?? ''}" placeholder="Es. 12"></label>
        <label class="field" for="fa-dose">Grammi al giorno<input type="number" id="fa-dose" min="0" step="1" inputmode="numeric" value="${v.cibo_g_giorno ?? ''}" placeholder="Es. 250"></label>
        <label class="field" for="fa-aperto">Sacco aperto il<input type="date" id="fa-aperto" value="${esc(v.cibo_aperto || oggiISO())}" max="${oggiISO()}"></label>
      </div>
      <p class="small muted">La dose giusta è scritta sul sacco, in base al peso: in dubbio chiedi al negozio o al veterinario.</p>
    </fieldset>
    <div id="fa-msg"></div>
    <button class="btn full" type="submit" id="fa-salva">${a ? 'Salva le modifiche' : 'Aggiungi'}</button>
  </form>`;
}
async function salvaAnimale() {
  const nome = $('#fa-nome').value.trim(), sp = $('#fa-specie').value, altro = $('#fa-altro').value.trim();
  const msg = t => { $('#fa-msg').innerHTML = `<div class="notice err">${esc(t)}</div>`; };
  if (!nome) return msg('Scrivi il nome del tuo animale.');
  if (!sp) return msg('Scegli che animale è.');
  if (sp === 'altro' && !altro) return msg('Scrivi che animale è.');
  const num = id => { const x = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(x) && x > 0 ? x : null; };
  const sacco = num('#fa-sacco'), dose = num('#fa-dose');
  const riga = {
    user_id: state.uid, vivaio_id: state.vivaio.id, nome,
    specie_id: sp === 'altro' ? null : sp,
    scheda_ia: sp === 'altro' ? { nome: altro, tipo: 'Animale da compagnia', promemoria: [] } : null,
    razza: $('#fa-razza').value.trim(), nascita: $('#fa-nascita').value || null, peso_kg: num('#fa-peso'),
    cibo_sacco_kg: sacco, cibo_g_giorno: dose ? Math.round(dose) : null, cibo_aperto: sacco && dose ? ($('#fa-aperto').value || oggiISO()) : null,
  };
  $('#fa-salva').disabled = true;
  const esistente = sheetData.animale;
  const { data, error } = esistente
    ? await supabase.from('miei_animali').update(riga).eq('id', esistente.id).select().single()
    : await supabase.from('miei_animali').insert(riga).select().single();
  if (error) { $('#fa-salva').disabled = false; return msg('Non riesco a salvare: riprova.'); }
  if (esistente) state.animali = state.animali.map(x => (x.id === data.id ? data : x));
  else { state.animali.push(data); evento('animale_aggiunto', null, { specie: data.specie_id || altro }); }
  await caricaNotifiche();
  state.tab = 'mie'; state.mieiTab = 'animali';
  closeSheet(); toast(esistente ? 'Modifiche salvate' : `${nome} è tra i tuoi animali`);
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
function normSpecie(r) {
  const arr = x => (Array.isArray(x) ? x : []);
  return {
    nome: String(r.specie || r.nome || 'Animale'), latino: String(r.latino || ''), tipo: String(r.tipo || ''), categoria: '',
    alimentazione: String(r.alimentazione || ''), cura: String(r.cura || ''), ambiente: String(r.ambiente || ''), salute: String(r.salute || ''),
    attenzione: arr(r.attenzione).map(String).slice(0, 4), vita: String(r.vita || ''),
    promemoria: arr(r.promemoria).filter(x => x && x.testo).slice(0, 5).map(x => ({ tipo: ['cibo','cura','prevenzione','visita','attenzione'].includes(x.tipo) ? x.tipo : 'cura', mesi: arr(x.mesi).map(Number).filter(n => n >= 1 && n <= 12), testo: String(x.testo) })),
  };
}
function matchCatalog(r) {
  const n = String(r.nome || '').toLowerCase().trim();
  const l = String(r.latino || '').toLowerCase().split(' ').slice(0, 2).join(' ');
  return state.piante.find(p => p.nome.toLowerCase() === n || (p.alias || []).includes(n)
      || (l && !p.latino.includes('spp') && p.latino.toLowerCase().split(' ').slice(0, 2).join(' ') === l))
    || state.piante.find(p => n && n.includes(p.nome.toLowerCase()));
}
function matchSpecie(r) {
  const n = String(r.specie || r.nome || '').toLowerCase().trim();
  const l = String(r.latino || '').toLowerCase().split(' ').slice(0, 2).join(' ');
  return state.specie.find(s => s.nome.toLowerCase() === n || (s.alias || []).includes(n)
      || (l && s.latino.toLowerCase().split(' ').slice(0, 2).join(' ') === l))
    || state.specie.find(s => n && (n.includes(s.nome.toLowerCase()) || (s.alias || []).some(x => n.includes(x))));
}

async function analyze() {
  if (state.busy) return;
  const m = state.scanMode, diag = m === 'diag', animale = m === 'animale' || (diag && state.diagSoggetto === 'animale');
  if (!state.photoFile && !(diag && animale && state.desc.trim().length >= 10)) return;
  state.busy = true; state.scanError = ''; state.diag = null; state.scanStatus = state.photoFile ? 'Preparo la foto…' : 'Leggo la descrizione…'; renderScreen();
  try {
    const img = state.photoFile ? await preparaImmagine(state.photoFile) : null;
    state.scanStatus = diag ? (animale ? 'Valuto la situazione…' : 'Cerco il problema…') : animale ? 'Riconosco l\'animale…' : 'Riconosco la pianta…'; renderScreen();
    const tipoIA = diag ? (animale ? 'diagnosi_animale' : 'diagnosi') : animale ? 'riconosci_animale' : 'riconosci';
    const r = await chiamaIA({ tipo: tipoIA, immagine: img ? img.base64 : '', media_type: img ? img.mediaType : '', descrizione: diag ? state.desc : '', vivaio_id: state.vivaio.id });
    const ris = r.risultato || {};
    state.busy = false;
    if (diag) { state.diag = { ...ris, _animale: animale }; renderScreen(); return; }
    if (ris.riconosciuta === false || ris.riconosciuto === false) { state.scanError = (ris.motivo ? ris.motivo + ' ' : '') + (animale ? 'Prova con una foto dell\'animale intero e con più luce.' : 'Prova a inquadrare foglie e fiori da vicino.'); renderScreen(); return; }
    renderScreen();
    const alt = (Array.isArray(ris.alternative) ? ris.alternative : []).map(esc).join(', ');
    if (animale) {
      const hit = matchSpecie(ris);
      const chi = [ris.specie || ris.nome, ris.razza].filter(Boolean).map(esc).join(', razza ');
      const note = `Riconosciuto: <b>${chi}</b> · affidabilità ${esc(ris.confidenza || 'media')}.${alt ? ` Potrebbe essere anche: ${alt}.` : ''}${hit ? ' Il negozio ha una scheda verificata per questo animale.' : ''}`;
      if (hit) openSpecie(hit, { verified: true, note, razza: ris.razza || '' }); else openSpecie(normSpecie(ris), { verified: false, note, razza: ris.razza || '' });
      return;
    }
    const hit = matchCatalog(ris);
    const note = `Riconosciuta come <b>${esc(ris.nome)}</b> · affidabilità ${esc(ris.confidenza || 'media')}.${alt ? ` Potrebbe essere anche: ${alt}.` : ''}${hit ? ' Il negozio ha una scheda verificata per questa pianta.' : ''}`;
    if (hit) openScheda(hit, { verified: true, note }); else openScheda(normScheda(ris), { verified: false, note });
  } catch (e) {
    state.busy = false; state.scanError = e.message || 'Analisi non riuscita. Riprova.'; renderScreen();
  }
}

async function controllaIA() {
  state.iaStato = { ok: true, html: 'Controllo in corso…' }; renderScreen();
  try {
    const r = await chiamaIA({ tipo: 'stato' }, 20000);
    const st = r && r.stato;
    if (!st) {
      state.iaStato = { ok: false, html: 'Sul server c\'è ancora la versione vecchia della funzione "analizza": incolla il file nuovo nell\'editor della funzione e tocca Deploy.' };
    } else {
      const chiavi = [st.gemini ? 'GEMINI_API_KEY presente' : 'GEMINI_API_KEY assente', st.anthropic ? 'ANTHROPIC_API_KEY presente' : 'ANTHROPIC_API_KEY assente'].join(' · ');
      state.iaStato = { ok: st.fornitore !== 'nessuno', html: `<b>Funzione ${esc(st.versione)}</b><br>IA in uso: <b>${esc(st.fornitore)}</b><br>${esc(chiavi)}${st.animali ? '' : '<br>Questa versione non riconosce ancora gli animali: aggiorna la funzione.'}` };
    }
  } catch (e) {
    const vecchia = /manca la chiave API sul server\.$/.test(e.message);
    state.iaStato = { ok: false, html: vecchia ? 'Sul server c\'è ancora la versione vecchia della funzione "analizza": incolla il file nuovo nell\'editor della funzione e tocca Deploy.' : esc(e.message) };
  }
  renderScreen();
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
    if (hit) openScheda(hit, { verified: true }); else openScheda(normScheda(ris), { verified: false, note: 'Scheda preparata con l\'IA a partire dal nome. Per piante particolari chiedi conferma al negozio.' });
  } catch (e) { state.genBusy = false; state.genError = e.message; renderResults(); }
}

/* ---------- rendering ---------- */
const ICON_MIEI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13c0-5 3-8.5 9-8.5 0 6-3.5 9-8.5 9"/><path d="M3.5 13c2-2.4 4-4.2 6.5-5.4"/><ellipse cx="15.5" cy="15.5" rx="1.2" ry="1.6"/><ellipse cx="18" cy="13.2" rx="1.2" ry="1.6"/><ellipse cx="20.6" cy="15.5" rx="1.2" ry="1.6"/><path d="M18 21c-1.8 0-3-.9-3-2.1 0-1.4 1.4-2.8 3-2.8s3 1.4 3 2.8c0 1.2-1.2 2.1-3 2.1z"/></svg>';
function renderTabbar() {
  const tabs = [['home', 'Home', ICON.home], ['scan', 'Inquadra', ICON.cam], ['cerca', 'Cerca', ICON.search], ['mie', state.animaliAttivi ? 'I miei' : 'Mie piante', state.animaliAttivi ? ICON_MIEI : ICON.leaf], ['cal', 'Calendario', ICON.cal]];
  $('#tabbar').innerHTML = tabs.map(([k, l, i]) => `<button data-act="tab" data-t="${k}" ${state.tab === k ? 'aria-current="page"' : ''}>${i}<span>${l}</span></button>`).join('');
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
  if (a === 'contatto') { evento('contatto', sheetData?.kind === 'pianta' ? sheetData.p.id || null : null, b.dataset.meta ? { azione: b.dataset.meta } : {}); return; } // link reali: lasciali aprire
  e.preventDefault();
  switch (a) {
    case 'scegli': scriviLocale('radice_vivaio', b.dataset.slug); location.search = `?v=${encodeURIComponent(b.dataset.slug)}`; break;
    case 'cambiavivaio': scriviLocale('radice_vivaio', null); state.vivaio = null; history.replaceState(null, '', location.pathname); scegliVivaio(); break;
    case 'tab': goTab(b.dataset.t); break;
    case 'miei': state.mieiTab = b.dataset.sub; state.confirmDel = null; if (state.tab !== 'mie') goTab('mie'); else renderScreen(); break;
    case 'goscan': state.scanMode = b.dataset.mode; goTab('scan'); break;
    case 'mode': state.scanMode = b.dataset.mode; state.scanError = ''; state.diag = null; renderScreen(); break;
    case 'soggetto': state.diagSoggetto = b.dataset.s; state.scanError = ''; state.diag = null; renderScreen(); break;
    case 'clearphoto': if (state.photoURL) URL.revokeObjectURL(state.photoURL); state.photoFile = null; state.photoURL = ''; state.diag = null; state.scanError = ''; renderScreen(); break;
    case 'analyze': analyze(); break;
    case 'statoia': controllaIA(); break;
    case 'open': { const p = byId(b.dataset.id); evento('apertura_scheda', p?.id); openScheda(p, { verified: true }); break; }
    case 'openSpecie': { const s = specieById(b.dataset.id); evento('apertura_specie', null, { specie: s?.id }); openSpecie(s, { verified: true }); break; }
    case 'openmine': { const m = state.mine.find(x => x.id === b.dataset.id); if (m) openScheda(plantOf(m), { verified: !!m.pianta_id }); break; }
    case 'openAnimale': { const x = state.animali.find(y => y.id === b.dataset.id); if (x) openSpecie(specieOf(x), { verified: !!x.specie_id, animale: x }); break; }
    case 'nuovoAnimale': openFormAnimale(null, { specie: b.dataset.specie || '', razza: b.dataset.razza || '', altro: !b.dataset.specie && sheetData?.kind === 'specie' ? sheetData.p.nome : '' }); break;
    case 'modAnimale': { const x = state.animali.find(y => y.id === b.dataset.id); if (x) openFormAnimale(x); break; }
    case 'saccoNuovo': {
      const x = state.animali.find(y => y.id === b.dataset.id); if (!x) break;
      const { data, error } = await supabase.from('miei_animali').update({ cibo_aperto: oggiISO() }).eq('id', x.id).select().single();
      if (error) { toast('Non riesco a salvare: riprova'); break; }
      state.animali = state.animali.map(y => (y.id === data.id ? data : y)); toast('Scorta aggiornata'); renderScreen(); break;
    }
    case 'delAnimale': {
      const id = b.dataset.id;
      if (state.confirmDel === id) {
        const { error } = await supabase.from('miei_animali').delete().eq('id', id);
        if (error) { toast('Non riesco a rimuoverlo: riprova'); break; }
        state.animali = state.animali.filter(x => x.id !== id); state.confirmDel = null;
        [...state.doneA].filter(k => k.startsWith(id + '|')).forEach(k => state.doneA.delete(k));
        toast('Animale rimosso');
      } else state.confirmDel = id;
      renderScreen(); break;
    }
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
    case 'copy': copia(b.dataset.txt, b.closest('.copyline')?.querySelector('span')); evento('contatto', null, { azione: 'copia_numero' }); break;
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

document.addEventListener('submit', e => {
  if (e.target.id === 'formAnimale') { e.preventDefault(); salvaAnimale(); }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.act === 'done') {
    const animale = t.dataset.kind === 'animale';
    const mia = t.dataset.mia, mese = Number(t.dataset.mese), i = Number(t.dataset.i), anno = annoNow();
    const k = chiaveFatto(mia, anno, mese, i), insieme = animale ? state.doneA : state.done;
    const tabella = animale ? 'attivita_animali' : 'attivita_fatte', col = animale ? 'mio_animale_id' : 'mia_pianta_id';
    t.disabled = true;
    const { error } = t.checked
      ? await supabase.from(tabella).insert({ [col]: mia, anno, mese, indice: i, user_id: state.uid })
      : await supabase.from(tabella).delete().match({ [col]: mia, anno, mese, indice: i });
    t.disabled = false;
    if (error) { t.checked = !t.checked; toast('Non riesco a salvare: riprova'); return; }
    if (t.checked) { insieme.add(k); toast(animale ? 'Fatto. Bravo, se ne accorgerà' : 'Fatto. Il tuo pollice verde cresce'); } else insieme.delete(k);
    document.querySelectorAll(`input[data-act="done"][data-mia="${mia}"][data-mese="${mese}"][data-i="${i}"]`).forEach(x => { x.checked = t.checked; x.closest('.task')?.classList.toggle('done', t.checked); });
    return;
  }
  if (t.id === 'photo' || t.id === 'galleria') { setPhoto(t.files && t.files[0]); return; }
  if (t.id === 'zona') { state.zona = t.value; scriviLocale('radice_zona', t.value); renderScreen(); return; }
  if (t.id === 'fa-specie') { $('#fa-altro-wrap').hidden = t.value !== 'altro'; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { state.query = t.value; state.genError = ''; renderResults(); return; }
  if (t.id === 'desc') {
    state.desc = t.value;
    const b = document.querySelector('[data-act="analyze"]');
    if (b && state.scanMode === 'diag' && state.diagSoggetto === 'animale' && !state.photoFile) b.disabled = t.value.trim().length < 10;
  }
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
