interface LibraryFilterGroupLabelProps {
  icon: string;
  label: string;
  className?: string;
}

/**
 * @description En-tête de groupe de filtres avec icône et libellé (grille desktop / tablette).
 */
export function LibraryFilterGroupLabel({
  icon,
  label,
  className = "",
}: LibraryFilterGroupLabelProps) {
  return (
    <span
      className={["library-filters-label", className].filter(Boolean).join(" ")}
    >
      <span className="library-filters-label-icon" aria-hidden>
        {icon}
      </span>
      <span className="library-filters-label-text">{label}</span>
    </span>
  );
}
