import { createClient } from './libreria-supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurato = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('INCOLLA') && !SUPABASE_ANON_KEY.includes('INCOLLA'));
export const supabase = configurato ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Chiama la funzione IA "analizza" e restituisce un messaggio leggibile in caso di errore.
// "attesa" = tempo massimo in millisecondi: oltre, si interrompe invece di girare all'infinito.
export async function chiamaIA(body, attesa = 90000) {
  const { data, error } = await supabase.functions.invoke('analizza', { body, timeout: attesa });
  if (error) {
    let msg = 'Il servizio di analisi non risponde. Riprova tra poco.';
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j && j.errore) msg = j.errore; } catch (_) { /* risposta non JSON */ }
      if (ctx.status === 404) msg = 'Sul server non trovo la funzione "analizza": controlla il nome in Supabase → Edge Functions.';
    } else if (/abort|timeout/i.test(String((ctx && (ctx.name || ctx.message)) || error.message))) {
      msg = `Nessuna risposta dal servizio IA entro ${Math.round(attesa / 1000)} secondi. Riprova; se succede ancora, guarda i log della funzione "analizza" in Supabase.`;
    }
    throw new Error(msg);
  }
  if (data && data.errore) throw new Error(data.errore);
  return data;
}
