import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./CollapsibleSection.css";

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  actions?: ReactNode;
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
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <section className="collapse-section">
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
      {open && <div className="collapse-body">{children}</div>}
    </section>
  );
}
