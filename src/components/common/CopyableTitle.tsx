import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { isMobileRuntime } from "@/lib/platform";
import { copyTextToClipboard } from "@/utils/clipboard";
import "./CopyableTitle.css";

const LONG_PRESS_MS = 450;

export interface CopyableTitleProps {
  /** Titre à afficher et à copier. */
  title: string;
  className?: string;
}

/**
 * @description Titre de fiche cliquable (bureau) / appui long (mobile) pour copier.
 */
export function CopyableTitle({ title, className = "" }: CopyableTitleProps) {
  const [copied, setCopied] = useState(false);
  const mobile = isMobileRuntime();
  const pressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pressTimerRef.current != null) {
        window.clearTimeout(pressTimerRef.current);
      }
      if (copiedTimerRef.current != null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const showCopied = useCallback(() => {
    setCopied(true);
    if (copiedTimerRef.current != null) {
      window.clearTimeout(copiedTimerRef.current);
    }
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimerRef.current = null;
    }, 1600);
  }, []);

  const copyTitle = useCallback(async () => {
    const ok = await copyTextToClipboard(title);
    if (ok) showCopied();
  }, [title, showCopied]);

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  const handleClick = () => {
    if (mobile) {
      // Sur mobile, seul l'appui long copie (évite les copies accidentelles).
      return;
    }
    void copyTitle();
  };

  const handlePointerDown = (event: PointerEvent<HTMLHeadingElement>) => {
    if (!mobile || event.button !== 0) return;
    didLongPressRef.current = false;
    clearPressTimer();
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      didLongPressRef.current = true;
      void copyTitle();
    }, LONG_PRESS_MS);
  };

  const handlePointerEnd = () => {
    clearPressTimer();
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (mobile && didLongPressRef.current) {
      event.preventDefault();
    }
  };

  const hint = mobile
    ? "Appui long pour copier le titre"
    : "Cliquer pour copier le titre";

  return (
    <h1
      className={`copyable-title${copied ? " copyable-title--copied" : ""}${
        className ? ` ${className}` : ""
      }`}
      title={copied ? "Titre copié" : hint}
      aria-label={`${title}. ${hint}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onContextMenu={handleContextMenu}
    >
      <span className="copyable-title-text">{title}</span>
      <span className="copyable-title-feedback" aria-live="polite">
        {copied ? "Copié" : ""}
      </span>
    </h1>
  );
}
