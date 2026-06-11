import { Pencil } from "lucide-react";
import { BadgeList } from "@/components/common/BadgeList";
import type { Work } from "@/types/database";
import "./WorkCard.css";

export interface WorkCardProps {
  work: Work;
  onEdit: (workId: string) => void;
}

/**
 * @description Carte résumé d'une œuvre dans la bibliothèque.
 */
export function WorkCard({ work, onEdit }: WorkCardProps) {
  const tags = [...(work.genres ?? []), ...(work.themes ?? [])];

  return (
    <article className="work-card">
      <div className="work-card-cover">
        {work.cover_url ? (
          <img src={work.cover_url} alt="" loading="lazy" />
        ) : (
          <div className="work-card-placeholder">Pas de couverture</div>
        )}
      </div>
      <div className="work-card-body">
        <div className="work-card-header">
          <h3>{work.title}</h3>
          <button
            type="button"
            className="work-card-edit"
            onClick={() => onEdit(work.id)}
            aria-label={`Modifier ${work.title}`}
          >
            <Pencil size={16} />
          </button>
        </div>
        {work.demographic_type && (
          <p className="work-card-meta">{work.demographic_type}</p>
        )}
        {work.publisher_vf && (
          <p className="work-card-meta">{work.publisher_vf}</p>
        )}
        <BadgeList items={tags} />
        <p className="work-card-volumes">
          {work.volumes_vf_count ?? "?"} VF / {work.volumes_vo_total ?? "?"} VO
          {work.default_price != null && ` · ${work.default_price} €`}
        </p>
      </div>
    </article>
  );
}
