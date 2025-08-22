# Paris League PRO — React + Vite + Tailwind + Netlify Functions + Neon (SQL)

Funzioni incluse:
- Classifica (Ranking Paris) con bonus differenza game, rounding 2 decimali, formula cliccabile e con risultato set.
- Giocatori (20 italiani seed), click nome → Scheda.
- Crea Partita (best of 3, no 1–1, cognomi composti, elenco ultime partite con soli cognomi, Δ cliccabile).
- Statistiche giocatore (compagni/avversari top >0, elenco gare e Δ cliccabile).
- Torneo (gironi) con classifica e inserimento partite.
- Extra: backup/import JSON, export CSV (classifica e partite).

## Deploy
1. Pubblica su GitHub.
2. Netlify: Import from Git.
   - Build: `npm run build`
   - Publish dir: `dist`
   - Functions dir: `netlify/functions`
3. Add-on **Neon** attivo (crea `NETLIFY_DATABASE_URL`).
4. Env consigliata: `NODE_VERSION=20`.
5. Deploy senza cache e apri il sito. Al primo avvio fa il seed (20 giocatori + 15 partite) e salva nel DB.

Endpoint API: `/.netlify/functions/state`
