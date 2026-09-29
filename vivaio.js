window.__radiceAvviata = true;
import QRCode from './libreria-qrcode.js';
import { supabase, configurato } from './db.js';
import { SWATCHES, MESI } from './costanti.js';
import { $, esc, ICON, toast, applyBrand, brandbar, slugify, copia } from './ui.js';

const state = { user: null, vivaio: null, piante: [], specie: [], animaliAttivi: false, notifiche: [], stats: null, notifPianta: '', notifTesto: '' };
// notifPianta = '' (tutti) | 'p:<pianta>' | 's:<specie>'
const bersaglio = t => ({ pianta: t.startsWith('p:') ? t.slice(2) : null, specie: t.startsWith('s:') ? t.slice(2) : null });
const appUrl = () => new URL('./', location.href).href;
const linkCliente = (slug, pianta, specie) => `${appUrl()}?v=${encodeURIComponent(slug)}${pianta ? `&p=${encodeURIComponent(pianta)}` : ''}${specie ? `&a=${encodeURIComponent(specie)}` : ''}`;
const main = () => $('#main');

/* ---------- accesso ---------- */
async function avvio() {
  if (!configurato) { main().innerHTML = '<div class="panel"><h2>Configurazione mancante</h2><p class="muted">Apri il file config.js nel repository e incolla l\'indirizzo e la chiave "anon" del progetto Supabase (Project Settings → API). Dopo un minuto ricarica la pagina.</p></div>'; return; }
  supabase.auth.onAuthStateChange((ev, session) => {
    if (ev === 'SIGNED_IN' && session && !session.user.is_anonymous && (!state.user || state.user.id !== session.user.id)) { state.user = session.user; carica(); }
    if (ev === 'SIGNED_OUT') { state.user = null; mostraLogin(); }
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.is_anonymous) return mostraLogin();
  state.user = session.user;
  carica();
}

function mostraLogin(msg) {
  $('#utente').textContent = '';
  main().innerHTML = `<section class="panel" style="max-width:460px;margin:24px auto">
    <div><p class="eyebrow">Area riservata ai vivai</p><h1 style="font-size:26px">Accedi al pannello</h1></div>
    <p class="muted">Inserisci la tua email: ti mandiamo un link per entrare, senza password.</p>
    <form id="login" style="display:grid;gap:12px">
      <label class="field" for="email">Email<input type="text" inputmode="email" autocomplete="email" id="email" required placeholder="nome@vivaio.it"></label>
      <button class="btn" type="submit" id="login-btn">Mandami il link</button>
    </form>
    <div id="login-msg">${msg ? `<div class="notice">${esc(msg)}</div>` : ''}</div>
  </section>`;
}

async function carica() {
  $('#utente').innerHTML = `${esc(state.user.email || '')} · <button class="linkbtn" data-act="esci">Esci</button>`;
  main().innerHTML = '<div class="status"><span class="spinner"></span>Carico il tuo vivaio…</div>';
  const { data: viv, error } = await supabase.from('vivai').select('*').eq('owner_id', state.user.id).maybeSingle();
  if (error) { main().innerHTML = `<div class="notice err">${esc(error.message)}</div>`; return; }
  if (!viv) return mostraCreazione();
  state.vivaio = viv;
  applyBrand(viv.colore);
  const [{ data: piante }, sp] = await Promise.all([
    supabase.from('piante').select('id,nome,latino,promemoria').or(`vivaio_id.is.null,vivaio_id.eq.${viv.id}`).order('nome'),
    supabase.from('specie').select('id,nome,latino,promemoria').order('nome'),
    caricaNotifiche(), caricaStats(),
  ]);
  state.piante = piante || [];
  state.animaliAttivi = !sp.error;
  state.specie = sp.data || [];
  render();
}
async function caricaNotifiche() {
  const { data } = await supabase.from('notifiche').select('*').eq('vivaio_id', state.vivaio.id).order('created_at', { ascending: false }).limit(10);
  state.notifiche = data || [];
}
async function caricaStats() {
  const { data, error } = await supabase.rpc('statistiche_vivaio', { p_vivaio: state.vivaio.id });
  state.stats = error ? null : data;
}

/* ---------- creazione del vivaio ---------- */
function mostraCreazione() {
  main().innerHTML = `<section class="panel" style="max-width:620px;margin:24px auto">
    <div><p class="eyebrow">Primo accesso</p><h1 style="font-size:26px">Registra il tuo vivaio</h1></div>
    <p class="muted">Questi dati compaiono nell'app dei tuoi clienti. Potrai cambiarli quando vuoi.</p>
    <form id="crea" class="form2">
      <label class="field wide" for="c-nome">Nome del vivaio<input type="text" id="c-nome" required minlength="2" maxlength="80"></label>
      <label class="field" for="c-luogo">Località<input type="text" id="c-luogo" maxlength="80"></label>
      <label class="field" for="c-orari">Orari<input type="text" id="c-orari" maxlength="80" placeholder="Lun-Sab 8.30-12.30 e 14.30-19"></label>
      <label class="field" for="c-tel">Telefono<input type="tel" id="c-tel" maxlength="30"></label>
      <label class="field" for="c-wa">WhatsApp (con prefisso)<input type="tel" id="c-wa" maxlength="30" placeholder="+39 …"></label>
      <div class="wide"><button class="btn" type="submit" id="crea-btn">Crea il vivaio</button></div>
    </form>
    <div id="crea-msg"></div>
  </section>`;
}

/* ---------- pannello ---------- */
function render() {
  const v = state.vivaio, s = state.stats || {};
  if (!state.notifTesto) state.notifTesto = testoDefault(state.notifPianta);
  main().innerHTML = `
  <div class="vhead"><div><p class="eyebrow">Pannello vivaio</p><h1 id="vh-nome">${esc(v.nome)}</h1></div>
    <button class="btn quiet" data-act="aggiorna">Aggiorna dati</button></div>
  <section class="panel"><h2>Link dell'app per i tuoi clienti</h2>
    <p class="small muted">Mettilo su sito, social, scontrini o in un QR alla cassa. Chi lo apre diventa tuo cliente nell'app.</p>
    <div class="linkapp"><span id="link-app">${esc(linkCliente(v.slug))}</span><span style="display:flex;gap:8px"><button class="btn quiet" data-act="copialink">Copia</button><a class="btn ghost" href="${esc(linkCliente(v.slug))}" target="_blank" rel="noopener">Apri l'app</a></span></div>
  </section>
  <div class="vgrid">
    <div class="vcol">
      <section class="panel"><h2>Il tuo marchio nell'app</h2>
        <form id="marchio" class="form2">
          <label class="field wide" for="f-nome">Nome del vivaio<input type="text" id="f-nome" data-f="nome" value="${esc(v.nome)}" required minlength="2" maxlength="80"></label>
          <label class="field" for="f-luogo">Località<input type="text" id="f-luogo" data-f="luogo" value="${esc(v.luogo)}" maxlength="80"></label>
          <label class="field" for="f-orari">Orari<input type="text" id="f-orari" data-f="orari" value="${esc(v.orari)}" maxlength="80"></label>
          <label class="field" for="f-tel">Telefono<input type="tel" id="f-tel" data-f="telefono" value="${esc(v.telefono)}" maxlength="30"></label>
          <label class="field" for="f-wa">WhatsApp (con prefisso)<input type="tel" id="f-wa" data-f="whatsapp" value="${esc(v.whatsapp)}" maxlength="30" placeholder="+39 …"></label>
          <label class="field wide" for="f-promo">Promozione in evidenza<textarea id="f-promo" data-f="promo" maxlength="300">${esc(v.promo)}</textarea></label>
          <div class="field wide">Colore<div class="swatches" role="group" aria-label="Colore del marchio">${SWATCHES.map(([c, l]) => `<button type="button" style="--c:${c}" data-act="color" data-c="${c}" aria-pressed="${v.colore === c}" aria-label="${l}" title="${l}"></button>`).join('')}</div></div>
          <div class="wide"><button class="btn" type="submit">Salva</button></div>
        </form>
      </section>
      <section class="panel"><h2>Invia un promemoria ai clienti</h2>
        <p class="small muted">Lo vedono nella Home dell'app. Puoi mandarlo a tutti o solo a chi ha una certa pianta tra le sue.</p>
        <form id="notifica" style="display:grid;gap:12px">
          <label class="field" for="n-pianta">Destinatari<select id="n-pianta"><option value="">Tutti i clienti</option><optgroup label="Chi ha la pianta">${state.piante.map(p => `<option value="p:${esc(p.id)}" ${state.notifPianta === 'p:' + p.id ? 'selected' : ''}>Chi ha: ${esc(p.nome)}</option>`).join('')}</optgroup>${state.animaliAttivi ? `<optgroup label="Chi ha l'animale">${state.specie.map(x => `<option value="s:${esc(x.id)}" ${state.notifPianta === 's:' + x.id ? 'selected' : ''}>Chi ha: ${esc(x.nome)}</option>`).join('')}</optgroup>` : ''}</select></label>
          <label class="field" for="n-titolo">Titolo<input type="text" id="n-titolo" maxlength="120" required value="${esc(titoloDefault(state.notifPianta))}"></label>
          <label class="field" for="n-testo">Messaggio<textarea id="n-testo" maxlength="500" required>${esc(state.notifTesto)}</textarea></label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><span class="small muted" id="n-count">Calcolo destinatari…</span><button class="btn" type="submit" id="n-btn">Invia promemoria</button></div>
        </form>
        ${state.notifiche.length ? `<div><p class="eyebrow" style="margin-bottom:4px">Ultimi inviati</p><div class="storico">${state.notifiche.map(n => `<div><b class="small">${esc(n.titolo)}</b><span class="small">${esc(n.testo)}</span><span class="small muted">${new Date(n.created_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${n.pianta_id ? ' · chi ha ' + esc(nomePianta(n.pianta_id)) : n.specie_id ? ' · chi ha ' + esc(nomeSpecie(n.specie_id)) : ' · tutti'}</span></div>`).join('')}</div></div>` : ''}
      </section>
    </div>
    <div class="vcol">
      <section class="panel"><h2>Anteprima</h2><div class="preview" id="vprev"></div></section>
      <section class="panel"><div class="section-title"><h2>Andamento</h2><span class="small muted">ultimi 7 giorni</span></div>
        ${state.stats ? `<div class="tiles">
          <div class="tile"><b>${s.clienti ?? 0}</b><span>clienti con l'app (+${s.clienti_7g ?? 0})</span></div>
          <div class="tile"><b>${s.scansioni_7g ?? 0}</b><span>scansioni di cartellini</span></div>
          <div class="tile"><b>${s.analisi_7g ?? 0}</b><span>foto analizzate</span></div>
          <div class="tile"><b>${s.contatti_7g ?? 0}</b><span>contatti al vivaio</span></div>
        </div>
        <div class="chartbox"><p class="small muted" style="margin-bottom:4px">Scansioni di cartellini per settimana</p>${grafico(s.settimane || [])}</div>
        ${(s.piante_top || []).length ? `<div><p class="eyebrow" style="margin-bottom:6px">Piante più seguite dai clienti</p><div class="topn">${s.piante_top.map(x => `<div><span>${esc(x.nome)}</span><b class="mono">${x.n}</b></div>`).join('')}</div></div>` : '<p class="small muted">Quando i clienti aggiungono piante, qui vedi le più seguite.</p>'}
        ${state.animaliAttivi ? ((s.animali_top || []).length ? `<div><p class="eyebrow" style="margin-bottom:6px">Animali dei clienti</p><div class="topn">${s.animali_top.map(x => `<div><span>${esc(x.nome)}</span><b class="mono">${x.n}</b></div>`).join('')}</div></div>` : '<p class="small muted">Quando i clienti aggiungono i loro animali, qui vedi quali sono.</p>') : ''}
        <p class="small muted">${s.piante_seguite ?? 0} piante${state.animaliAttivi ? ` e ${s.animali_seguiti ?? 0} animali` : ''} seguiti · ${s.notifiche ?? 0} promemoria inviati in tutto</p>`
        : '<p class="notice">Statistiche non disponibili.</p>'}
      </section>
    </div>
  </div>
  <section class="panel" id="stampa"><div class="section-title"><h2>Cartellini QR</h2><span class="noprint" style="display:flex;gap:8px;align-items:center"><span class="small muted">${state.piante.length} piante${state.animaliAttivi ? ` · ${state.specie.length} animali` : ''}</span><button class="btn quiet" data-act="stampa">Stampa</button></span></div>
    <p class="small muted noprint">Stampali su carta adesiva e attaccali ai vasi, ai cartellini o agli scaffali del reparto animali. Il cliente inquadra il codice con la fotocamera del telefono e apre la scheda con il tuo marchio.</p>
    <div class="qrgrid">${state.piante.map(p => `<div class="qrtag"><div class="qr" data-qr="${esc(linkCliente(v.slug, p.id))}"></div><b>${esc(p.nome)}</b><span class="latino">${esc(p.latino)}</span><small>${esc(v.nome)}</small><a class="noprint" href="${esc(linkCliente(v.slug, p.id))}" target="_blank" rel="noopener">Prova il link</a></div>`).join('')}${state.animaliAttivi ? state.specie.map(x => `<div class="qrtag qrtag-a"><div class="qr" data-qr="${esc(linkCliente(v.slug, null, x.id))}"></div><b>${esc(x.nome)}</b><span class="latino">${esc(x.latino)}</span><small>${esc(v.nome)}</small><a class="noprint" href="${esc(linkCliente(v.slug, null, x.id))}" target="_blank" rel="noopener">Prova il link</a></div>`).join('') : ''}</div>
  </section>`;
  renderPreview(); disegnaQR(); aggiornaDestinatari();
}

function nomePianta(id) { return state.piante.find(p => p.id === id)?.nome || id; }
function nomeSpecie(id) { return state.specie.find(p => p.id === id)?.nome || id; }
function titoloDefault(t) {
  const b = bersaglio(t || '');
  if (b.pianta) return `${nomePianta(b.pianta)}: promemoria del vivaio`;
  if (b.specie) return `${nomeSpecie(b.specie)}: promemoria del negozio`;
  return `Novità da ${state.vivaio.nome}`;
}
function testoDefault(t) {
  const b = bersaglio(t || ''), mo = new Date().getMonth() + 1;
  if (!b.pianta && !b.specie) return 'Passa a trovarci: questa settimana abbiamo novità per il tuo giardino e i tuoi animali.';
  const x = b.pianta ? state.piante.find(p => p.id === b.pianta) : state.specie.find(p => p.id === b.specie);
  const r = (x?.promemoria || []).find(y => (y.mesi || []).includes(mo));
  if (b.specie) return r ? `${x.nome}, cosa fare a ${MESI[mo - 1]}: ${r.testo.charAt(0).toLowerCase() + r.testo.slice(1)}. Passa in negozio: ti aiutiamo a scegliere il prodotto giusto.`
    : `${x?.nome}: hai tutto quello che serve? Passa in negozio, ti aspettiamo.`;
  return r ? `${x.nome}, cosa fare a ${MESI[mo - 1]}: ${r.testo.charAt(0).toLowerCase() + r.testo.slice(1)}. Passa in vivaio, ti consigliamo il prodotto giusto.`
    : `${x?.nome}: controlla la tua pianta e scrivici se hai dubbi. Ti aspettiamo in vivaio.`;
}
async function aggiornaDestinatari() {
  const el = $('#n-count'); if (!el) return;
  const b = bersaglio(state.notifPianta);
  const arg = { p_vivaio: state.vivaio.id, p_pianta: b.pianta };
  if (state.animaliAttivi) arg.p_specie = b.specie;
  const { data, error } = await supabase.rpc('conta_destinatari', arg);
  el.innerHTML = error ? 'Destinatari non calcolabili' : `Destinatari: <b class="mono">${data}</b> ${data === 1 ? 'cliente' : 'clienti'}`;
}

function grafico(settimane) {
  const W = 320, H = 150, l = 30, b = 24, t = 16;
  const vals = settimane.map(x => x.scansioni);
  const top = Math.max(4, ...vals);
  const passo = Math.ceil(top / 2);
  const max = passo * 2;
  const Y = v => t + (H - t - b) * (1 - v / max);
  const bw = (W - l - 8) / Math.max(1, settimane.length);
  let g = '';
  [0, passo, max].forEach(v => { g += `<line x1="${l}" x2="${W - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${v}</text>`; });
  settimane.forEach((s, i) => {
    const x = l + i * bw + bw * 0.18, w = bw * 0.64, last = i === settimane.length - 1;
    const d = new Date(s.settimana + 'T12:00:00');
    const h = Math.max(0, Y(0) - Y(s.scansioni));
    g += `<rect x="${x}" y="${Y(s.scansioni)}" width="${w}" height="${h}" rx="3" fill="${last ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 35%,var(--surface))'}"><title>Settimana dal ${d.toLocaleDateString('it-IT')}: ${s.scansioni}</title></rect>`;
    g += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${d.getDate()}/${d.getMonth() + 1}</text>`;
    if (last) g += `<text x="${x + w / 2}" y="${Y(s.scansioni) - 5}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono,monospace">${s.scansioni}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scansioni di cartellini nelle ultime 8 settimane">${g}</svg>`;
}

function renderPreview() {
  const el = $('#vprev'); if (!el) return;
  const v = state.vivaio;
  el.innerHTML = brandbar(v) + `<div class="pad" style="gap:10px"><div class="action primary" style="pointer-events:none">${ICON.cam}<b>Inquadra una pianta</b><span>Ti diciamo cos'è e come curarla</span></div>${v.promo ? `<div class="promo"><span class="eyebrow">Dal vivaio</span><span>${esc(v.promo)}</span></div>` : ''}</div>`;
}
async function disegnaQR() {
  for (const el of document.querySelectorAll('[data-qr]')) {
    try {
      const url = await QRCode.toDataURL(el.dataset.qr, { width: 240, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#18231D', light: '#FFFFFF' } });
      el.innerHTML = `<img src="${url}" alt="Codice QR">`;
    } catch (_) { el.textContent = 'QR'; }
  }
}

/* ---------- eventi ---------- */
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'login') {
    const email = $('#email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('#login-msg').innerHTML = '<div class="notice err">Scrivi un indirizzo email valido.</div>'; return; }
    $('#login-btn').disabled = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } });
    $('#login-btn').disabled = false;
    $('#login-msg').innerHTML = error ? `<div class="notice err">${esc(error.message)}</div>` : `<div class="notice">Ti abbiamo scritto a <b>${esc(email)}</b>. Apri il link dalla mail su questo dispositivo per entrare.</div>`;
  }
  if (f.id === 'crea') {
    const nome = $('#c-nome').value.trim();
    if (nome.length < 2) return;
    $('#crea-btn').disabled = true;
    let slug = slugify(nome) || 'vivaio';
    if (slug.length < 3) slug = `vivaio-${slug}`;
    const { data: esiste } = await supabase.from('vivai').select('id').eq('slug', slug).maybeSingle();
    if (esiste) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from('vivai').insert({ slug, nome, luogo: $('#c-luogo').value.trim(), orari: $('#c-orari').value.trim(), telefono: $('#c-tel').value.trim(), whatsapp: $('#c-wa').value.trim(), owner_id: state.user.id });
    $('#crea-btn').disabled = false;
    if (error) { $('#crea-msg').innerHTML = `<div class="notice err">${esc(error.message)}</div>`; return; }
    toast('Vivaio creato'); carica();
  }
  if (f.id === 'marchio') {
    const v = state.vivaio;
    const upd = { nome: v.nome, luogo: v.luogo, orari: v.orari, telefono: v.telefono, whatsapp: v.whatsapp, promo: v.promo, colore: v.colore };
    const { error } = await supabase.from('vivai').update(upd).eq('id', v.id);
    toast(error ? 'Salvataggio non riuscito: ' + error.message : 'Salvato: i clienti vedono subito le modifiche');
  }
  if (f.id === 'notifica') {
    const titolo = $('#n-titolo').value.trim(), testo = $('#n-testo').value.trim();
    if (titolo.length < 2 || testo.length < 2) { toast('Scrivi titolo e messaggio'); return; }
    $('#n-btn').disabled = true;
    const b = bersaglio(state.notifPianta);
    const riga = { vivaio_id: state.vivaio.id, pianta_id: b.pianta, titolo, testo };
    if (b.specie) riga.specie_id = b.specie;
    const { error } = await supabase.from('notifiche').insert(riga);
    $('#n-btn').disabled = false;
    if (error) { toast('Invio non riuscito: ' + error.message); return; }
    toast('Promemoria inviato');
    state.notifTesto = '';
    await Promise.all([caricaNotifiche(), caricaStats()]);
    render();
  }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'esci') { await supabase.auth.signOut(); state.vivaio = null; return; }
  if (a === 'color') { state.vivaio.colore = b.dataset.c; applyBrand(b.dataset.c); document.querySelectorAll('.swatches button').forEach(x => x.setAttribute('aria-pressed', x.dataset.c === b.dataset.c)); toast('Colore scelto: tocca Salva per applicarlo'); return; }
  if (a === 'copialink') { copia(linkCliente(state.vivaio.slug), $('#link-app')); return; }
  if (a === 'stampa') { window.print(); return; }
  if (a === 'aggiorna') { await Promise.all([caricaNotifiche(), caricaStats()]); render(); toast('Dati aggiornati'); }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f && t.closest('#marchio')) {
    state.vivaio[t.dataset.f] = t.value; renderPreview();
    if (t.dataset.f === 'nome') { $('#vh-nome').textContent = t.value; document.querySelectorAll('.qrtag small').forEach(s => { s.textContent = t.value; }); }
  }
  if (t.id === 'n-testo') state.notifTesto = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'n-pianta') {
    state.notifPianta = t.value; state.notifTesto = testoDefault(t.value);
    $('#n-testo').value = state.notifTesto; $('#n-titolo').value = titoloDefault(t.value);
    aggiornaDestinatari();
  }
});

avvio().catch(err => { main().innerHTML = `<div class="notice err">${esc(err.message)}</div>`; });
