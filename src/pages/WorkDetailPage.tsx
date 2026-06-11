import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { AddVolumeModal } from "@/features/works/AddVolumeModal";
import { BadgeList } from "@/components/common/BadgeList";
import { CoverImage } from "@/components/common/CoverImage";
import { OwnerBadgeLegend } from "@/components/common/OwnerBadgeLegend";
import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";
import { formatDateFr } from "@/utils/dateFormat";
import { formatCurrency, formatEditionLabel } from "@/utils/ownerDisplay";
import { DeleteWorkModal } from "@/features/works/DeleteWorkModal";
import { WorkFormModal } from "@/features/works/WorkFormModal";
import { useOwners } from "@/hooks/useOwners";
import { fetchWorkFinancials } from "@/services/financialService";
import { fetchWorkForEdit } from "@/services/workService";
import type { SeriesFinancials, Work } from "@/types/database";
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
  const [addVolumeOpen, setAddVolumeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [workFinancials, setWorkFinancials] = useState<SeriesFinancials | null>(
    null,
  );

  const reload = async () => {
    if (!workId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, financials] = await Promise.all([
        fetchWorkForEdit(workId),
        fetchWorkFinancials(workId),
      ]);
      setWork(data.work);
      setVolumes(data.volumes);
      setWorkFinancials(financials);
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
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const sortedOwners = [...owners].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <main className="work-detail-page">
      <header className="work-detail-header">
        <button type="button" className="btn-back" onClick={() => navigate("/")}>
          <ArrowLeft size={18} /> Bibliothèque
        </button>
        <div className="work-detail-actions">
          <button
            type="button"
            className="btn-danger-outline"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={16} aria-hidden />
            Supprimer
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setModalOpen(true)}
          >
            <Pencil size={16} aria-hidden />
            Modifier
          </button>
        </div>
      </header>

      <article className="work-detail-hero">
        <div className="work-detail-cover">
          <CoverImage url={work.cover_url} alt={work.title} zoomable />
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

      {workFinancials && volumes.length > 0 && (
        <section className="work-detail-section">
          <h2>Coûts de la série</h2>
          <div className="work-financial-grid work-financial-grid--totals">
            <div className="work-financial-stat">
              <span>Valeur catalogue</span>
              <strong>{formatCurrency(workFinancials.catalogValue)}</strong>
            </div>
            <div className="work-financial-stat work-financial-stat--paid">
              <span>Total dépensé</span>
              <strong>{formatCurrency(workFinancials.totalPaid)}</strong>
            </div>
            <div className="work-financial-stat work-financial-stat--mihon">
              <span>Économie Mihon</span>
              <strong>{formatCurrency(workFinancials.totalMihonSavings)}</strong>
            </div>
          </div>
          <div className="work-financial-grid work-financial-grid--owners">
            {sortedOwners.map((owner) => {
              const row = workFinancials.perOwner.find(
                (item) => item.ownerId === owner.id,
              );
              const amountPaid = row?.amountPaid ?? 0;
              const mihonSavings = row?.mihonSavings ?? 0;
              return (
                <div
                  key={owner.id}
                  className="work-financial-stat work-financial-stat--owner"
                  style={{ "--owner-color": owner.color } as CSSProperties}
                >
                  <span>{owner.name}</span>
                  <strong>{formatCurrency(amountPaid)}</strong>
                  {mihonSavings > 0 ? (
                    <small className="work-financial-owner-mihon">
                      Mihon −{formatCurrency(mihonSavings)}
                    </small>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="work-detail-section">
        <div className="work-detail-section-header">
          <h2>Tomes VF ({volumes.length})</h2>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setAddVolumeOpen(true)}
          >
            <Plus size={16} aria-hidden />
            Ajouter un tome
          </button>
        </div>
        {volumes.length > 0 ? (
          <OwnerBadgeLegend
            compact
            sampleOwner={
              sortedOwners[0]
                ? {
                    name: sortedOwners[0].name,
                    color: sortedOwners[0].color,
                    badge_label: sortedOwners[0].badge_label,
                  }
                : undefined
            }
          />
        ) : null}
        {volumes.length === 0 ? (
          <p className="work-detail-empty">Aucun tome enregistré.</p>
        ) : (
          <ul className="work-detail-volumes">
            {volumes.map((vol) => {
              const mihonOwner = vol.mihonOwnerId
                ? ownerById.get(vol.mihonOwnerId)
                : null;
              const purchaseOwners = vol.ownerIds
                .map((id) => ownerById.get(id))
                .filter((owner): owner is NonNullable<typeof owner> =>
                  Boolean(owner),
                );

              return (
                <li key={vol.volumeNumber} className="work-detail-volume">
                  <div className="work-detail-volume-badges">
                    {mihonOwner ? (
                      <OwnerInitialBadge owner={mihonOwner} variant="mihon" />
                    ) : purchaseOwners.length > 0 ? (
                      purchaseOwners.map((owner) => (
                        <OwnerInitialBadge
                          key={owner.id}
                          owner={owner}
                          variant="purchase"
                        />
                      ))
                    ) : null}
                  </div>
                  <div className="work-detail-volume-cover">
                    <CoverImage
                      url={vol.coverUrl}
                      alt={`Tome ${vol.volumeNumber}`}
                      zoomable
                    />
                  </div>
                  <div className="work-detail-volume-body">
                    <strong>Tome {vol.volumeNumber}</strong>
                    <p className="work-detail-volume-meta">
                      {vol.releaseDate &&
                        `Sortie : ${formatDateFr(vol.releaseDate)}`}
                      {vol.purchaseDate &&
                        ` · Acheté : ${formatDateFr(vol.purchaseDate)}`}
                      {` · ${formatEditionLabel(vol.editionType)}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AddVolumeModal
        open={addVolumeOpen}
        workId={work.id}
        workTitle={work.title}
        existingVolumes={volumes}
        owners={owners}
        onClose={() => setAddVolumeOpen(false)}
        onSaved={() => void reload()}
      />

      <WorkFormModal
        open={modalOpen}
        workId={work.id}
        owners={owners}
        onClose={() => setModalOpen(false)}
        onSaved={() => void reload()}
      />

      <DeleteWorkModal
        open={deleteOpen}
        workId={work.id}
        workTitle={work.title}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate("/")}
      />
    </main>
  );
}
