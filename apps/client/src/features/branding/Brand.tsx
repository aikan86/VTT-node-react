import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../../api/http";
import defaultLogo from "../../assets/logo-default.png";
import { useSettingsStore } from "../../store/settingsStore";
import { reportError } from "../../store/statusStore";
import styles from "./Brand.module.css";

/** Logo e nome nell'intestazione; un clic sul logo apre il menu per cambiarlo o tornare a quello predefinito. */
export function Brand() {
  const logoUrl = useSettingsStore((s) => s.settings.logoUrl);
  const setLogo = useSettingsStore((s) => s.setLogo);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riscegliere lo stesso file
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.upload(file);
      setLogo(url);
      setOpen(false);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.brand} ref={root}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Cambia il logo"
        onClick={() => setOpen((o) => !o)}
      >
        <img src={logoUrl ?? defaultLogo} alt="Logo" className={styles.logo} />
        <span>VTT</span>
      </button>
      {open && (
        <div role="menu" aria-label="Logo" className={styles.menu}>
          <button type="button" role="menuitem" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Caricamento…" : "Carica un nuovo logo…"}
          </button>
          {logoUrl && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setLogo(null);
                setOpen(false);
              }}
            >
              Torna al logo predefinito
            </button>
          )}
          <span className={styles.hint}>PNG, JPEG, WebP o GIF. Meglio quadrato e con sfondo trasparente.</span>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Scegli l'immagine del logo"
        onChange={(e) => void onFile(e)}
        hidden
      />
    </div>
  );
}
