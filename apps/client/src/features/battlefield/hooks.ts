import { useEffect, useRef, useState, type RefObject } from "react";
import { redoSceneEdit, undoSceneEdit } from "../../store/historyStore";

export function useImage(url: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);
  return image;
}

export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** Vero mentre il tasto è premuto (ignorato se il focus è in un campo di testo). */
export function useKeyHeld(code: string): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === code && !isTyping(e)) {
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === code && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [code]);
  return held;
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "color", "file"]);

/** Il focus è in un campo dove si scrive testo (lì Ctrl+Z annulla la digitazione, non la mappa). */
export function isTextEntry(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.tagName === "INPUT") return !NON_TEXT_INPUTS.has((t as HTMLInputElement).type);
  return t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

/** Ctrl/Cmd+Z annulla; Ctrl+Y e Ctrl/Cmd+Shift+Z ripetono. */
export function historyShortcut(e: KeyboardEvent): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

/** Scorciatoie di annulla/ripeti per la mappa del master; tacciono mentre si scrive in un campo o con una finestra aperta. */
export function useUndoShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = historyShortcut(e);
      if (!action || isTextEntry(e) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (action === "undo") undoSceneEdit();
      else redoSceneEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
