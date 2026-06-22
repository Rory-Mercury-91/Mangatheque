import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAutoCollapseWhenObscured } from "@/hooks/useAutoCollapseWhenObscured";
import "./CollapsibleSection.css";

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Replie la section si son en-tête sort du conteneur scrollable (mobile / tablette). */
  autoCollapseWhenObscured?: boolean;
}

/**
 * @description Section réductible (mode contrôlé ou interne).
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  actions,
  className,
  autoCollapseWhenObscured = false,
}: CollapsibleSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const collapse = useCallback(() => {
    if (!open) {
      return;
    }
    if (!isControlled) {
      setInternalOpen(false);
    }
    onOpenChange?.(false);
  }, [isControlled, onOpenChange, open]);

  useAutoCollapseWhenObscured(
    autoCollapseWhenObscured,
    open,
    sectionRef,
    collapse,
  );

  const toggle = () => {
    const next = !open;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <section
      ref={sectionRef}
      className={`collapse-section${className ? ` ${className}` : ""}`}
    >
      <header className="collapse-header">
        <button
          type="button"
          className="collapse-toggle"
          onClick={toggle}
          aria-expanded={open}
        >
          <ChevronDown
            size={18}
            className={`collapse-chevron${open ? " collapse-chevron--open" : ""}`}
            aria-hidden
          />
          <span>{title}</span>
        </button>
        {actions}
      </header>
      {open ? <div className="collapse-body">{children}</div> : null}
    </section>
  );
}
