#!/usr/bin/env node
// Cronologia delle versioni: elenca, mostra e ripristina documenti (anche eliminati).
// Usa l'API del server in esecuzione, così il ripristino arriva in tempo reale ai tab aperti.
//
//   pnpm history list                               documenti con versioni salvate
//   pnpm history show <collezione> <id>             versioni di un documento
//   pnpm history restore <collezione> <id> <rev>    ripristina una versione
//
// Opzioni: --prod (istanza di deploy, porta 8080) oppure --url http://host:porta (default: sviluppo, 3001)

const args = process.argv.slice(2);
let base = process.env.VTT_URL ?? "http://127.0.0.1:3001";
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--prod") base = "http://127.0.0.1:8080";
  else if (args[i] === "--url") base = args[++i];
  else positional.push(args[i]);
}
const [command, collection, id, rev] = positional;

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail(`Server non raggiungibile su ${base}. È avviato? (--prod per l'istanza di deploy)`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) fail(data?.error ?? `Errore ${res.status}`);
  return data;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const time = (iso) => (iso ? new Date(iso).toLocaleString("it-IT") : "—");

/** Riassunto leggibile di una versione, per riconoscerla. */
function summary(coll, d) {
  if (!d) return "";
  if (coll === "combat") {
    const names = (d.npcs ?? []).map((n) => `${n.name} ${n.hp.current}/${n.hp.max}`).join(", ");
    const list = d.combatants ?? [];
    const state = d.active ? `round ${d.round} · ${list.filter((c) => c.acted).length}/${list.length} hanno agito` : `fuori combattimento · ${list.length} in lista`;
    const notes = list.filter((c) => c.notes).length;
    return `${state}${notes ? ` · ${notes} note` : ""}${names ? ` · PNG: ${names}` : ""}`;
  }
  if (coll === "characters") return `${d.name} · PF ${d.hp?.current}/${d.hp?.max} · CA ${d.ac}`;
  if (coll === "scenes") return `${d.name} · ${d.tokens?.length ?? 0} token · ${d.elements?.length ?? 0} elementi · ${d.effects?.length ?? 0} effetti`;
  if (coll === "dm-rolls") return `d20: ${d.value}`;
  return "";
}

switch (command) {
  case "list": {
    const docs = await call("GET", "/api/history");
    if (!docs.length) console.log("Nessun documento.");
    for (const d of docs) {
      const status = d.deleted ? "ELIMINATO" : "";
      console.log(`${d.collection.padEnd(11)} ${d.id.padEnd(36)} ${String(d.versions).padStart(3)} versioni  ${time(d.lastChange).padEnd(20)} ${d.label} ${status}`);
    }
    break;
  }
  case "show": {
    if (!collection || !id) fail("Uso: pnpm history show <collezione> <id>");
    const versions = await call("GET", `/api/history/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
    for (const v of versions) {
      console.log(`rev ${String(v.rev).padStart(4)}  ${time(v.at).padEnd(20)} ${v.current ? "[attuale] " : ""}${summary(collection, v.data)}`);
    }
    console.log(`\nPer ripristinare: pnpm history restore ${collection} ${id} <rev>`);
    break;
  }
  case "restore": {
    if (!collection || !id || !rev) fail("Uso: pnpm history restore <collezione> <id> <rev>");
    const restored = await call("POST", `/api/history/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/restore`, { rev: Number(rev) });
    console.log(`Ripristinata la versione ${rev} come nuova versione ${restored.rev}: ${summary(collection, restored.data)}`);
    break;
  }
  default:
    console.log(`Uso:
  pnpm history list
  pnpm history show <collezione> <id>          (collezioni: characters, scenes, combat, dm-rolls; il combattimento ha id "current")
  pnpm history restore <collezione> <id> <rev>
Opzioni: --prod (deploy, porta 8080) · --url http://host:porta`);
}
