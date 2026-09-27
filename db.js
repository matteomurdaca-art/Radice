import { createClient } from './libreria-supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurato = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('INCOLLA') && !SUPABASE_ANON_KEY.includes('INCOLLA'));
export const supabase = configurato ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Chiama la funzione IA "analizza" e restituisce un messaggio leggibile in caso di errore
export async function chiamaIA(body) {
  const { data, error } = await supabase.functions.invoke('analizza', { body });
  if (error) {
    let msg = 'Il servizio di analisi non risponde. Riprova tra poco.';
    try {
      const j = await error.context.json();
      if (j && j.errore) msg = j.errore;
    } catch (_) { /* risposta non JSON */ }
    throw new Error(msg);
  }
  if (data && data.errore) throw new Error(data.errore);
  return data;
}
