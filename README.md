# Green Rabbit

App di cura di piante e animali che vivai, garden center e negozi per animali offrono gratis ai propri clienti.

- `index.html`: app per i clienti (riconoscimento e diagnosi da foto, schede, le mie piante, calendario, messaggi del vivaio)
- `vivaio.html`: pannello del vivaio (marchio, promemoria mirati, statistiche, cartellini QR)

Tutti i file stanno in un'unica cartella e non serve nessuna compilazione: GitHub Pages li pubblica così come sono.

## File

| File | Dove va | A cosa serve |
| --- | --- | --- |
| `index.html`, `vivaio.html` | GitHub | le due pagine |
| `app.js`, `vivaio.js` | GitHub | logica dell'app e del pannello |
| `db.js`, `costanti.js`, `luna.js`, `ui.js`, `immagine.js` | GitHub | parti condivise |
| `styles.css`, `favicon.svg`, `logo.svg` | GitHub | grafica e marchio |
| `manifest.webmanifest`, `manifest-vivaio.webmanifest`, `sw.js`, `icona-*.png`, `apple-touch-icon.png` | GitHub | installazione sul telefono come app |
| `libreria-supabase.js`, `libreria-qrcode.js` | GitHub | librerie già pronte, non modificarle |
| `config.js` | GitHub | **indirizzo e chiave del tuo Supabase: l'unico file da modificare** |
| `supabase-schema.sql` | Supabase, SQL Editor | crea tabelle e regole di sicurezza |
| `supabase-catalogo.sql` | Supabase, SQL Editor | carica le 12 schede verificate |
| `supabase-animali.sql` | Supabase, SQL Editor | aggiunge gli animali: specie, animali dei clienti, promemoria (una volta, dopo i due file sopra) |
| `supabase-funzione-analizza.ts` | Supabase, Edge Functions | analisi delle foto con l'IA (piante e animali) |

## Messa in funzione

### Supabase
1. **SQL Editor:** esegui `supabase-schema.sql`, poi `supabase-catalogo.sql`, poi `supabase-animali.sql`.
2. **Authentication → Sign In / Providers:** attiva *Allow anonymous sign-ins*.
3. **Authentication → URL Configuration:**
   - *Site URL*: `https://TUO-UTENTE.github.io/NOME-REPO/`
   - *Redirect URLs*: aggiungi `https://TUO-UTENTE.github.io/NOME-REPO/vivaio.html`
4. **Edge Functions:** crea una funzione chiamata esattamente `analizza` e incolla il contenuto di `supabase-funzione-analizza.ts`.
5. **Edge Functions → Secrets:** aggiungi `GEMINI_API_KEY` (gratuita, da aistudio.google.com) oppure `ANTHROPIC_API_KEY` (a pagamento, da console.anthropic.com). Ne basta una.
6. **Project Settings → API:** copia *Project URL* e la chiave *anon* (o *publishable*) dentro `config.js`. Non usare mai la chiave *service_role* o *secret*.

### GitHub
1. Carica tutti i file della tabella segnati "GitHub" nella cartella principale del repository.
2. **Settings → Pages → Source:** *Deploy from a branch*, ramo `main`, cartella `/ (root)`.
3. Dopo un minuto l'app è su `https://TUO-UTENTE.github.io/NOME-REPO/` e il pannello su `…/vivaio.html`.

## Prima prova
1. Apri `vivaio.html`, entra con la tua email e registra il vivaio.
2. Copia il link dell'app dal pannello e aprilo sul telefono.
3. Stampa un cartellino QR e inquadralo: si apre la scheda e il pannello conta la scansione.
4. Dal pannello invia un promemoria a "Chi ha: …" e controlla che arrivi solo a chi ha quella pianta.
