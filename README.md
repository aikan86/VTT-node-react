# VTT — Virtual Tabletop per D&D e altri TTRPG

Tavolo virtuale per il DM: campo di battaglia a livelli, party e tracker di iniziativa.
Uso locale (un solo utente), con backend Node già pronto per il multiplayer.

## Avvio

```bash
pnpm install
pnpm dev          # client http://localhost:5173 + API http://127.0.0.1:3001
```

Produzione (Fastify serve anche il client compilato):

```bash
pnpm build && pnpm start   # http://127.0.0.1:3001
```

I dati (SQLite + immagini caricate) vanno in `data/`; si può cambiare cartella con `VTT_DATA_DIR`.
Altre variabili: `PORT` (3001), `HOST` (127.0.0.1).

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm test` | Vitest su tutti i pacchetti |
| `pnpm typecheck` | `tsc` su tutti i pacchetti |

## Deploy locale (separato dallo sviluppo)

Un'istanza "stabile" su **http://127.0.0.1:8080**, indipendente da `pnpm dev` (3001/5173): codice e dati propri.

```bash
pnpm release        # pubblica l'ULTIMO COMMIT: test + build, sostituisce la release e riavvia
pnpm prod status    # stato, release installata, percorsi
pnpm prod start | stop | restart
pnpm prod logs      # segue il log
```

- Si pubblica solo ciò che è committato: le modifiche in corso in sviluppo non finiscono nel deploy.
- Tutto sta in `~/Library/Application Support/VTT/`: `app/` (release attuale), `app.prev/` (precedente, ripristinata in automatico se l'avvio fallisce), `data/` (database e immagini, mai toccati dalle release), `vtt.log`.
- Variabili opzionali: `VTT_PORT`, `VTT_HOST`, `VTT_HOME`.
- L'istanza non riparte da sola dopo un riavvio del Mac: `pnpm prod start`.

## Struttura

- `packages/shared` — schemi zod (PG, PNG, combattimento, scene), dadi, griglia, PF e logica pura dell'iniziativa
- `apps/server` — Fastify + `node:sqlite`: REST su `/api/characters`, `/api/scenes`, `/api/combat`, upload su `/api/uploads`
- `apps/client` — React + Vite + Zustand; mappa con react-konva

## Uso rapido

- **Party**: “Nuovo PG”, poi si modificano i campi direttamente nella scheda (salvataggio automatico).
- **Iniziativa**: “Aggiungi party” / “Aggiungi PNG”, d20 inserito a mano o 🎲 / “Tira tutti”, poi “Inizia combattimento”.
  “Turno successivo” spunta chi è di turno; quando hanno agito tutti si passa al round seguente.
  La spunta si può mettere anche a mano, fuori ordine. ↑/↓ servono solo per i pareggi esatti.
- **Campo di battaglia**: si sceglie il livello attivo (solo quello è modificabile); 👁 nasconde, 🔒 blocca.
  Rotella = zoom, Spazio o tasto centrale + trascina = sposta la vista, Canc = elimina la selezione, Esc = annulla.
