import { useNavigate } from "react-router-dom";
import { CoverImage } from "@/components/common/CoverImage";
import type { TopExpensiveWork } from "@/services/financialService";
import type { Work } from "@/types/database";
import "./TopExpensiveWorks.css";

export interface TopExpensiveWorksProps {
  items: TopExpensiveWork[];
  worksById: Map<string, Work>;
}

/**
 * @description Top des séries aux dépenses réelles les plus élevées (Mihon exclu).
 */
export function TopExpensiveWorks({ items, worksById }: TopExpensiveWorksProps) {
  const navigate = useNavigate();

  const format = (n: number) =>
    n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  if (items.length === 0) {
    return <p className="top-expensive-empty">Aucune série à classer.</p>;
  }

  return (
    <ol className="top-expensive-list">
      {items.map((item, index) => {
        const work = worksById.get(item.workId);
        return (
          <li key={item.workId}>
            <button
              type="button"
              className="top-expensive-card"
              onClick={() => navigate(`/work/${item.workId}`)}
            >
              <span className="top-expensive-rank" aria-hidden>
                {index + 1}
              </span>
              <div className="top-expensive-cover">
                <CoverImage url={work?.cover_url} alt={item.title} />
              </div>
              <div className="top-expensive-info">
                <strong>{item.title}</strong>
                <span>Catalogue acheté : {format(item.catalogValue)}</span>
                <span>Dépensé : {format(item.totalPaid)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
