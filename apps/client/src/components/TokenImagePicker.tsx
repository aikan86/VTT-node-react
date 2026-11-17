import { useEffect, useRef, useState } from "react";
import { SRD_IMAGE_CREDIT } from "@vtt/shared";
import { api } from "../api/http";
import styles from "./TokenImagePicker.module.css";

interface Props {
  /** Di chi è l'immagine (per l'accessibilità). */
  name: string;
  imageUrl: string | undefined;
  onChange: (imageUrl: string | undefined) => void;
  /** Nome del mostro nell'SRD online; null = niente ricerca (es. i PG). */
  srdIndex: string | null;
  /** Cerca da sola quando cambia questa chiave e non c'è ancora un'immagine (es. il mostro scelto nel bestiario). */
  autoSearchKey?: string | null;
  disabled?: boolean;
}

const isSrdImage = (url: string | undefined) => !!url && url.startsWith("/uploads/srd-");

/** Immagine nel cerchio del token: anteprima, ricerca dell'illustrazione nell'SRD online, caricamento di una propria, rimozione. */
export function TokenImagePicker({ name, imageUrl, onChange, srdIndex, autoSearchKey, disabled = false }: Props) {
  const [status, setStatus] = useState<{ busy: boolean; text: string | null }>({ busy: false, text: null });
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const latest = useRef({ imageUrl, onChange });
  latest.current = { imageUrl, onChange };

  const search = async (index: string, automatic: boolean) => {
    const id = ++request.current;
    setStatus({ busy: true, text: "Cerco l'illustrazione online…" });
    try {
      const { url } = await api.srdImage(index);
      if (id !== request.current) return; // nel frattempo si è scelto altro
      latest.current.onChange(url);
      setStatus({ busy: false, text: null });
    } catch (err) {
      if (id !== request.current) return;
      const message = err instanceof Error ? err.message : "Ricerca non riuscita";
      setStatus({ busy: false, text: automatic ? `Nessuna illustrazione online (${message.toLowerCase()}).` : message });
    }
  };

  useEffect(() => {
    if (autoSearchKey && srdIndex && !latest.current.imageUrl) void search(srdIndex, true);
    else {
      request.current++;
      setStatus({ busy: false, text: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearchKey]);

  const upload = async (file: File) => {
    const id = ++request.current;
    setStatus({ busy: true, text: "Caricamento…" });
    try {
      const { url } = await api.upload(file);
      if (id === request.current) onChange(url);
      setStatus({ busy: false, text: null });
    } catch (err) {
      setStatus({ busy: false, text: err instanceof Error ? err.message : "Caricamento non riuscito" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={styles.picker} role="group" aria-label={`Immagine del token di ${name}`}>
      <span className={styles.thumb} aria-hidden={!imageUrl}>
        {imageUrl ? <img src={imageUrl} alt={`Immagine del token di ${name}`} /> : <span className={styles.empty}>—</span>}
      </span>
      <div className={styles.body}>
        <div className={styles.actions}>
          {srdIndex && (
            <button type="button" disabled={disabled || status.busy} onClick={() => void search(srdIndex, false)} title={`Cerca "${srdIndex}" su ${SRD_IMAGE_CREDIT}`}>
              🔎 Cerca online
            </button>
          )}
          <button type="button" disabled={disabled || status.busy} onClick={() => fileRef.current?.click()}>
            Carica…
          </button>
          {imageUrl && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                request.current++;
                onChange(undefined);
                setStatus({ busy: false, text: null });
              }}
            >
              Rimuovi
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            aria-label={`File immagine per ${name}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
        {status.text ? (
          <span className={styles.status} role="status">
            {status.text}
          </span>
        ) : (
          isSrdImage(imageUrl) && <span className={styles.status}>Illustrazione: {SRD_IMAGE_CREDIT}</span>
        )}
      </div>
    </div>
  );
}
