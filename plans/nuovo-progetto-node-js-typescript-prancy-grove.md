# VTT per D&D / TTRPG — MVP (Node.js + TypeScript + React)

## Contesto

Progetto nuovo in `/Users/io/projects/vtt-elixir` (cartella vuota, non è un repo git). Obiettivo: un virtual tabletop usato **dal DM in locale** (un solo utente per ora), ma con un **backend Node già presente** (REST + persistenza), così il passaggio al multiplayer (WebSocket) richiederà solo un'aggiunta e non una riscrittura.

Tre viste:
1. **Campo di battaglia**: griglia 2D con 4 livelli, tutti funzionanti nell'MVP: sfondo (immagine della mappa + griglia), elementi (ostacoli, muri, porte, terreno difficile), personaggi (token trascinabili), effetti (aree degli incantesimi).
2. **Party**: schede dei PG con statistiche base (HP, CA, tiri salvezza, modificatore di iniziativa, note), con un modello dati facile da estendere.
3. **Tracker di iniziativa**: d20 + modificatore (tiro virtuale con "Tira tutti" **oppure** inserimento manuale del dado fisico), elenco ordinato, ogni combattente viene spuntato quando agisce, contatore dei round.

Scelte confermate dall'utente: server pronto ma uso locale; tutti e 4 i livelli nell'MVP; PNG creati **al volo** (dal tracker o dalla mappa, senza un'anagrafica); tiro del d20 sia virtuale sia manuale.

Interfaccia in italiano. Ambiente: Node 25.8, pnpm 10.12.

## Stack (consigliato)

| Area | Scelta | Perché |
|---|---|---|
| Monorepo | pnpm workspaces | client, server e logica condivisa tipizzata in un solo repo |
| Client | Vite + React 19 + TypeScript, react-router | standard, avvio rapido |
| Canvas mappa | **react-konva** | `Layer` di Konva corrisponde 1:1 ai 4 livelli; drag, trasformazioni, pan e zoom già pronti |
| Stato client | Zustand | semplice; uno store per dominio |
| Validazione | zod (nel pacchetto shared) | stessi schemi su client e server |
| Server | Fastify + `@fastify/multipart` + `@fastify/static`, eseguito con `tsx` | leggero; `buildApp()` testabile con `inject` |
| Persistenza | SQLite tramite il modulo integrato **`node:sqlite`** | nessuna dipendenza nativa da compilare su Node 25; documenti JSON validati con zod |
| Stili | CSS Modules + variabili CSS (tema scuro) | nessun framework da imparare |
| Test | Vitest (+ React Testing Library) | un solo runner per tutto il monorepo |

## Struttura

```
vtt-elixir/
  package.json            # script: dev, build, test, typecheck, lint
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.workspace.ts
  data/                   # db sqlite + uploads (gitignored)
  packages/shared/src/
    schemas/              # character.ts, scene.ts, combat.ts (zod + tipi inferiti)
    dice.ts               # rollD20(rng?) – RNG iniettabile per i test
    initiative.ts         # logica pura del combattimento
    grid.ts               # snapToGrid, feetToCells, cellToPx
    index.ts
  apps/server/src/
    app.ts                # buildApp({ dbPath, uploadsDir })
    index.ts              # avvio (porta 3001)
    db.ts                 # node:sqlite, migrazione: tabella documents(collection, id, data JSON, updated_at)
    repo.ts               # repository generico list/get/put/delete per collezione + schema zod
    routes/characters.ts  scenes.ts  combat.ts  uploads.ts
  apps/client/src/
    main.tsx  App.tsx     # layout + nav: Campo di battaglia | Party | Iniziativa
    api/http.ts           # wrapper fetch tipizzati
    store/partyStore.ts  combatStore.ts  sceneStore.ts
    pages/BattlefieldPage.tsx  PartyPage.tsx  InitiativePage.tsx
    features/party/       CharacterForm, CharacterCard
    features/initiative/  InitiativeList, CombatantRow, HpQuickEdit, AddNpcDialog (condiviso con la mappa)
    features/battlefield/ BattleStage, layers/{Background,Grid,Elements,Tokens,Effects}Layer,
                          Toolbar, LayerPanel, SceneSettings, usePanZoom
```

## Modello dati (`packages/shared/src/schemas`)

- **Character (PG)**: `id, name, color, hp {current, max, temp}, ac, initiativeMod, saves {str,dex,con,int,wis,cha}` (modificatori), `notes`, `size` (1–4 celle). Schema zod con `.passthrough()` o campi opzionali, per poter estendere il modello in seguito.
- **Npc** (vive dentro il documento Combat, creato al volo): `id, name, color, hp, ac, initiativeMod, size`. Con "quantità N" vengono creati "Goblin 1…N".
- **Combat** (documento singleton): `active, round, currentId | null, npcs: Npc[], combatants: Combatant[]`.
  - **Combatant**: `id, ref {kind: 'pc'|'npc', id}, roll: number|null, acted: boolean, order` (per lo spareggio manuale). Il totale è calcolato (`roll + initiativeMod`), non salvato. Gli HP si leggono dall'entità referenziata: **unica fonte di verità**, quindi la barra HP del token e il tracker restano allineati.
- **Scene**: `id, name, background {imageUrl, widthPx, heightPx} | null, grid {cellPx, offsetX, offsetY, cols, rows, color, opacity, visible, feetPerCell: 5}, layers {background|elements|tokens|effects: {visible, locked}}, elements[], tokens[], effects[]`.
  - **MapElement**: `id, type: 'wall'|'door'|'obstacle'|'difficult', x, y, w, h` (in celle), `rotation, color, label?`
  - **Token**: `id, ref {kind, id}, x, y` (in celle). Nome, colore, taglia e HP vengono dall'entità referenziata.
  - **Effect**: `id, shape: 'circle'|'square'|'cone'|'line', x, y` (origine in celle, frazionaria), `sizeFt, widthFt?` (linea), `rotation, color, opacity`.

## Logica di iniziativa (`initiative.ts`, funzioni pure, sviluppate con TDD)

- `sortCombatants(list, lookupMod)`: totale decrescente → a parità, `initiativeMod` più alto → poi `order` manuale. Chi non ha ancora tirato va in fondo e mostra "—".
- `rollAll(combat, rng)`: tira il d20 solo per chi ha `roll === null`, così non sovrascrive i valori inseriti a mano.
- `setRoll(id, value)` (1–20), `moveUp/moveDown(id)` per lo spareggio manuale.
- `startCombat`: `round = 1`, `acted = false` per tutti, `currentId` = primo in ordine.
- `nextTurn`: segna il combattente corrente come `acted` e passa al primo successivo con `acted = false`. Se hanno agito tutti: `round++`, azzera tutti gli `acted`, `currentId` = primo.
- `toggleActed(id)`: spunta manuale, anche fuori ordine (es. azioni preparate). `currentId` passa al primo non spuntato.
- `endCombat`: `active = false`, `round = 0`, tiri azzerati (i PNG restano finché non vengono rimossi).
- `addNpcs(template, qty)`, `removeCombatant(id)`, `addParty(characters)` (aggiunge i PG non ancora presenti).

## API REST (server)

- `GET/POST /api/characters`, `PUT/DELETE /api/characters/:id`
- `GET/POST /api/scenes`, `GET/PUT/DELETE /api/scenes/:id` (documento intero)
- `GET/PUT /api/combat`
- `POST /api/uploads` (multipart, solo immagini, limite ~20 MB) → `{ url: "/uploads/<uuid>.<ext>" }`; i file sono serviti in statico da `data/uploads`.
- Ogni body viene validato con lo schema zod condiviso → `400` con i dettagli dell'errore. Una risorsa mancante → `404`.
- In dev: Vite (5173) fa da proxy per `/api` e `/uploads` verso Fastify (3001). In produzione: Fastify serve anche `apps/client/dist`.
- Già pronto per dopo: i repository sono l'unico punto di scrittura, quindi aggiungere un broadcast WebSocket dopo il `put` sarà un intervento locale.

## Client: comportamento delle pagine

**Party**: griglia di schede; "Nuovo PG" apre un form (nome, colore, HP max/attuali/temporanei, CA, modificatore di iniziativa, 6 tiri salvezza, taglia, note). Le modifiche sono salvate con un PUT debounced (~400 ms) e aggiornamento ottimistico. Il form è guidato da una semplice lista di campi, così aggiungere statistiche costa poco.

**Iniziativa**:
- In alto: "Round N", con i pulsanti Inizia / Turno successivo / Termina combattimento.
- Azioni: "Aggiungi party", "Aggiungi PNG" (dialogo con nome, mod. iniziativa, HP, CA, quantità, colore, checkbox "piazza sulla mappa"), "Tira tutti".
- Ogni riga mostra: checkbox "ha agito", nome con colore, d20 modificabile (input) + pulsante 🎲, `+mod`, totale, CA, HP con modifica rapida (±danni o cura), ↑/↓ per gli spareggi, rimuovi. Il combattente di turno è evidenziato; quelli che hanno già agito appaiono attenuati.

**Campo di battaglia** (Konva `Stage` con 4 `Layer`; la griglia è disegnata nel layer di sfondo come linee calcolate dalla configurazione):
- Pan con il trascinamento del tasto centrale o con barra spaziatrice + trascinamento; zoom con la rotella, centrato sul cursore.
- `LayerPanel`: mostra/nascondi e blocca ogni livello, e scelta del livello attivo (solo quello attivo è modificabile).
- `Toolbar` contestuale al livello attivo:
  - *Sfondo*: carica immagine; impostazioni griglia (dimensione cella, offset, colonne/righe, colore, opacità).
  - *Elementi*: scegli il tipo → trascina sulla griglia per creare un rettangolo agganciato alle celle; spostamento e ridimensionamento con `Transformer`.
  - *Personaggi*: "Piazza PG" (elenco dei PG del party senza token) / "Aggiungi PNG" (stesso `AddNpcDialog`; il token nasce sulla cella cliccata e il PNG entra anche nel tracker). Il drag si aggancia alla griglia al rilascio. Il token mostra iniziale e nome, colore, barra HP, e un anello evidenziato se è il turno corrente. La taglia occupa 1–4 celle.
  - *Effetti*: forma + dimensione in piedi (cerchio = raggio, quadrato = lato, cono = lunghezza con apertura di ~53°, cioè `Wedge`, linea = lunghezza × larghezza). Click per piazzare, ruota con `Transformer`, semitrasparente.
- Selezione + tasto Canc per eliminare. Selettore di scena (crea, rinomina) in alto.
- Salvataggio della scena: PUT debounced del documento a ogni modifica.

## Ordine di implementazione

1. **Scaffold**: `git init`, workspace pnpm, `tsconfig.base`, Vitest workspace, ESLint/Prettier minimi, script `dev` (concurrently client + server), `.gitignore` (incluso `data/`).
2. **shared**: schemi zod, `dice`, `grid`, `initiative` → **prima i test** (Vitest), poi l'implementazione.
3. **server**: `db.ts` + `repo.ts` + route + upload; test con `app.inject` su db `:memory:` e cartella temporanea.
4. **Shell del client**: router, layout e navigazione, `api/http.ts`, store Zustand con load, mutazioni ottimistiche e salvataggio debounced.
5. **Pagina Party**.
6. **Pagina Iniziativa** (+ test RTL del flusso: aggiungi → tira → inizia → turno successivo → incremento del round).
7. **Campo di battaglia**: stage + pan/zoom + sfondo/griglia → token → elementi → effetti → pannello livelli.
8. **Integrazione**: evidenziazione del turno corrente sui token, barre HP sincronizzate, "Aggiungi PNG" dalla mappa che popola il tracker.
9. Verifica finale.

## Verifica

- `pnpm typecheck` e `pnpm test` verdi. Coperture chiave: `initiative.ts` (ordinamento/spareggi, `rollAll` che non sovrascrive i manuali, `nextTurn` con avanzamento del round, `toggleActed` fuori ordine), `grid.ts` (snap, feet→cells), route del server (CRUD, 400 su body non valido, 404, upload).
- `pnpm dev`, poi un controllo manuale nel browser con Chrome DevTools MCP (screenshot):
  1. Party: creo 3 PG; ricarico la pagina → i dati persistono (SQLite).
  2. Iniziativa: Aggiungi party + 2 goblin; "Tira tutti" e un valore manuale → ordine corretto; Inizia → Turno successivo ×5 → il round passa a 2 e le spunte si azzerano.
  3. Campo di battaglia: carico l'immagine, regolo la griglia; piazzo i PG e i goblin; il drag si aggancia alle celle; aggiungo un muro e un cono da 15 ft; nascondo e blocco i livelli; il token del turno corrente è evidenziato; i danni nel tracker aggiornano la barra HP sul token.
  4. Riavvio del server → scena, party e combattimento vengono ripristinati.
