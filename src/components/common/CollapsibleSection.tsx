import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./CollapsibleSection.css";

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}

/**
 * @description Section réductible pour la modale œuvre / tomes.
 */
export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  actions,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="collapse-section">
      <header className="collapse-header">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setOpen((v) => !v)}
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
