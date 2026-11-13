import { CharacterCard } from "../features/party/CharacterCard";
import styles from "../features/party/Party.module.css";
import { usePartyStore } from "../store/partyStore";
import { reportError } from "../store/statusStore";

export function PartyPage() {
  const characters = usePartyStore((s) => s.characters);
  const add = usePartyStore((s) => s.add);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Party</h1>
        <button className="primary" onClick={() => add().catch(reportError)}>
          + Nuovo PG
        </button>
      </div>
      {characters.length === 0 ? (
        <p className="empty">Nessun personaggio. Crea il primo membro del party con “Nuovo PG”.</p>
      ) : (
        <div className={styles.grid}>
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </div>
  );
}
