import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { BadgeList } from "@/components/common/BadgeList";
import { CoverImage } from "@/components/common/CoverImage";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { useOwners } from "@/hooks/useOwners";
import { fetchWorkForEdit } from "@/services/workService";
import type { Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";
import "./WorkDetailPage.css";

/**
 * @description Fiche détaillée d'une œuvre (synopsis, métadonnées, tomes VF).
 */
export function WorkDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const { owners } = useOwners();

  const [work, setWork] = useState<Work | null>(null);
  const [volumes, setVolumes] = useState<VolumeFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const reload = async () => {
    if (!workId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkForEdit(workId);
      setWork(data.work);
      setVolumes(data.volumes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [workId]);

  if (loading) {
    return (
      <main className="work-detail-page">
        <p className="work-detail-status">
          <Loader2 size={18} className="spin" aria-hidden />
          Chargement…
        </p>
      </main>
    );
  }

  if (error || !work) {
    return (
      <main className="work-detail-page">
        <button type="button" className="btn-back" onClick={() => navigate("/")}>
          <ArrowLeft size={18} /> Bibliothèque
        </button>
        <p className="work-detail-error">{error ?? "Œuvre introuvable."}</p>
      </main>
    );
  }

  const tags = [...(work.genres ?? []), ...(work.themes ?? [])];
  const ownerMap = new Map(owners.map((o) => [o.id, o.name]));

  return (
    <main className="work-detail-page">
      <header className="work-detail-header">
        <button type="button" className="btn-back" onClick={() => navigate("/")}>
          <ArrowLeft size={18} /> Bibliothèque
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setModalOpen(true)}
        >
          <Pencil size={16} aria-hidden />
          Modifier
        </button>
      </header>

      <article className="work-detail-hero">
        <div className="work-detail-cover">
          <CoverImage url={work.cover_url} alt={work.title} />
        </div>
        <div className="work-detail-info">
          <h1>{work.title}</h1>
          {work.demographic_type && (
            <p className="work-detail-meta">{work.demographic_type}</p>
          )}
          {work.publisher_vf && (
            <p className="work-detail-meta">{work.publisher_vf}</p>
          )}
          <BadgeList items={tags} />
          <p className="work-detail-stats">
            {work.volumes_vf_count ?? volumes.length} tome(s) VF
            {work.volumes_vo_total != null && ` · ${work.volumes_vo_total} VO`}
            {work.default_price != null &&
              ` · ${work.default_price} € (${work.price_format === "broche" ? "broché" : "numérique"})`}
          </p>
        </div>
      </article>

      {work.synopsis && (
        <section className="work-detail-section">
          <h2>Synopsis</h2>
          <p className="work-detail-synopsis">{work.synopsis}</p>
        </section>
      )}

      <section className="work-detail-section">
        <h2>Tomes VF ({volumes.length})</h2>
        {volumes.length === 0 ? (
          <p className="work-detail-empty">Aucun tome enregistré.</p>
        ) : (
          <ul className="work-detail-volumes">
            {volumes.map((vol) => (
              <li key={vol.volumeNumber} className="work-detail-volume">
                <div className="work-detail-volume-cover">
                  <CoverImage
                    url={vol.coverUrl}
                    alt={`Tome ${vol.volumeNumber}`}
                  />
                </div>
                <div>
                  <strong>Tome {vol.volumeNumber}</strong>
                  <p className="work-detail-volume-meta">
                    {vol.releaseDate && `Sortie : ${vol.releaseDate}`}
                    {vol.purchaseDate && ` · Acheté : ${vol.purchaseDate}`}
                    {` · ${vol.editionType === "collector" ? "Collector" : "Classique"}`}
                  </p>
                  <p className="work-detail-volume-owners">
                    {vol.mihonOwnerId
                      ? `Mihon : ${ownerMap.get(vol.mihonOwnerId) ?? "?"}`
                      : vol.ownerIds.length > 0
                        ? `Achat : ${vol.ownerIds.map((id) => ownerMap.get(id)).join(", ")}`
                        : "Propriétaire non renseigné"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <WorkFormModal
        open={modalOpen}
        workId={work.id}
        owners={owners}
        onClose={() => setModalOpen(false)}
        onSaved={() => void reload()}
      />
    </main>
  );
}
