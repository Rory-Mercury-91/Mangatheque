import { useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { ArrowLeft, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { AddVolumeModal } from "@/features/works/AddVolumeModal";

import { BadgeList } from "@/components/common/BadgeList";

import { CoverImage } from "@/components/common/CoverImage";

import { InfoBadge } from "@/components/common/InfoBadge";

import { OwnerInitialBadge } from "@/components/common/OwnerInitialBadge";

import { WorkSeriesFinancialCards } from "@/features/works/WorkSeriesFinancialCards";

import {

  getWorkStatusColor,

  getWorkStatusLabel,

  normalizeWorkReadingStatus,

} from "@/constants/workStatus";

import { formatDateFr } from "@/utils/dateFormat";
import {
  getChapterSeriesOwnershipSource,
  shouldHideChapterVolumeGrid,
} from "@/utils/chapterSeries";
import { formatVolumeTitle, getTrackingUnitLabelPlural } from "@/utils/volumeDisplay";
import { formatWorkVolumeStatsLine } from "@/utils/workVolumeStats";

import { formatCurrency, formatEditionLabel } from "@/utils/ownerDisplay";

import { DeleteWorkModal } from "@/features/works/DeleteWorkModal";

import { WorkFormModal } from "@/features/works/WorkFormModal";

import { useOwners } from "@/hooks/useOwners";

import { fetchWorkFinancials } from "@/services/financialService";

import { openExternalUrl } from "@/services/platform/linkService";
import { fetchWorkForEdit } from "@/services/workService";

import type { SeriesFinancials, Work } from "@/types/database";
import type { VolumeFormRow } from "@/types/workForm";

import "./WorkDetailPage.css";



/**

 * @description Fiche détaillée d'une série (synopsis, métadonnées, tomes).

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

        <button
          type="button"
          className="btn-back"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="btn-back-label">Bibliothèque</span>
        </button>

        <p className="work-detail-error">{error ?? "Série introuvable."}</p>

      </main>

    );

  }



  const tags = [...(work.genres ?? []), ...(work.themes ?? [])];

  const ownerById = new Map(owners.map((o) => [o.id, o]));

  const readingStatus = normalizeWorkReadingStatus(work.reading_status);



  const volumeStatsLine = formatWorkVolumeStatsLine(
    volumes,
    work.volumes_vf_count,
    work.volumes_vo_total,
    work.default_price,
    work.price_format,
    work.tracking_unit ?? "volume",
  );

  const trackingUnit = work.tracking_unit ?? "volume";
  const chapterCount = work.volumes_vf_count ?? volumes.length;
  const hideChapterGrid = shouldHideChapterVolumeGrid(volumes, trackingUnit);
  const chapterOwnership = getChapterSeriesOwnershipSource(volumes);
  const chapterMihonOwner = chapterOwnership?.mihonOwnerId
    ? ownerById.get(chapterOwnership.mihonOwnerId)
    : null;
  const chapterPurchaseOwners =
    chapterOwnership?.ownerIds
      .map((id) => ownerById.get(id))
      .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner)) ??
    [];



  return (

    <main className="work-detail-page">

      <header className="work-detail-header">

        <button
          type="button"
          className="btn-back"
          onClick={() => navigate("/library")}
          title="Retour à la bibliothèque"
          aria-label="Retour à la bibliothèque"
        >
          <ArrowLeft size={18} aria-hidden />
          <span className="btn-back-label">Bibliothèque</span>
        </button>

        <div className="work-detail-actions">

          {work.source_url?.trim() ? (
            <button
              type="button"
              className="work-detail-icon-btn work-detail-icon-btn--secondary"
              title="Ouvrir sur Nautiljon"
              aria-label="Ouvrir sur Nautiljon"
              onClick={() => void openExternalUrl(work.source_url!)}
            >
              <ExternalLink size={18} aria-hidden />
              <span className="work-detail-action-label">Nautiljon</span>
            </button>
          ) : null}

          <button
            type="button"
            className="work-detail-icon-btn work-detail-icon-btn--primary"
            title="Modifier"
            aria-label="Modifier la série"
            onClick={() => setModalOpen(true)}
          >
            <Pencil size={18} aria-hidden />
            <span className="work-detail-action-label">Modifier</span>
          </button>

          <button
            type="button"
            className="work-detail-icon-btn work-detail-icon-btn--danger"
            title="Supprimer"
            aria-label="Supprimer la série"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={18} aria-hidden />
            <span className="work-detail-action-label">Supprimer</span>
          </button>

        </div>

      </header>



      <article className="work-detail-hero">

        <div className="work-detail-cover">

          <CoverImage url={work.cover_url} alt={work.title} zoomable />

        </div>

        <div className="work-detail-info">

          <h1>{work.title}</h1>



          <div className="work-detail-badge-row">

            {work.demographic_type ? (

              <InfoBadge label={work.demographic_type} color="#a78bfa" />

            ) : null}

            <InfoBadge

              label={getWorkStatusLabel(readingStatus)}

              color={getWorkStatusColor(readingStatus)}

            />

          </div>



          {tags.length > 0 ? <BadgeList items={tags} variant="tag" /> : null}



          <div className="work-detail-meta-block">

            {work.publisher_vf ? (

              <p className="work-detail-meta">{work.publisher_vf}</p>

            ) : null}

            {volumeStatsLine ? (
              <p className="work-detail-stats">{volumeStatsLine}</p>
            ) : null}

          </div>



          {work.synopsis ? (

            <p className="work-detail-synopsis">{work.synopsis}</p>

          ) : null}

        </div>

      </article>



      {workFinancials && volumes.length > 0 ? (

        <section className="work-detail-section">

          <h2>Coûts de la série</h2>

          <WorkSeriesFinancialCards

            financials={workFinancials}

            owners={owners}

          />

        </section>

      ) : null}



      <section className="work-detail-section">

        <div className="work-detail-section-header">

          <h2>
            {trackingUnit === "chapter"
              ? `${getTrackingUnitLabelPlural(trackingUnit)} (${chapterCount})`
              : `Tomes (${volumes.length})`}
          </h2>

          {!hideChapterGrid ? (
            <button
              type="button"
              className="work-detail-add-volume-btn"
              onClick={() => setAddVolumeOpen(true)}
            >
              <Plus size={16} aria-hidden />
              {trackingUnit === "chapter" ? "Ajouter un chapitre" : "Ajouter un tome"}
            </button>
          ) : null}

        </div>

        {hideChapterGrid ? (
          <div className="work-detail-chapter-summary">
            {chapterMihonOwner ? (
              <div className="work-detail-chapter-ownership-row">
                <OwnerInitialBadge owner={chapterMihonOwner} variant="mihon" />
              </div>
            ) : chapterPurchaseOwners.length > 0 ? (
              <div className="work-detail-chapter-ownership-row">
                {chapterPurchaseOwners.map((owner) => (
                  <OwnerInitialBadge
                    key={owner.id}
                    owner={owner}
                    variant="purchase"
                  />
                ))}
              </div>
            ) : (
              <p className="work-detail-empty">
                Aucune appartenance — ouvrez « Modifier », choisissez Mihon ou achat, puis
                enregistrez.
              </p>
            )}
            <p className="work-detail-chapter-summary-text">
              Suivi au niveau série
              {chapterCount > 0 ? ` — ${chapterCount} chapitres VF` : ""}.
            </p>
          </div>
        ) : volumes.length === 0 ? (

          <p className="work-detail-empty">
            {trackingUnit === "chapter"
              ? "Aucun chapitre enregistré."
              : "Aucun tome enregistré."}
          </p>

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

              const unitPrice =
                vol.catalogPrice ?? work.default_price ?? null;



              return (

                <li
                  key={`${vol.volumeNumber}-${vol.volumeLabel ?? ""}-${vol.editionType}`}
                  className="work-detail-volume"
                >
                  <div className="work-detail-volume-cover">

                    <CoverImage

                      url={vol.coverUrl}

                      alt={formatVolumeTitle(
                        vol.volumeNumber,
                        vol.volumeLabel,
                        work.tracking_unit ?? "volume",
                      )}

                      zoomable

                    />

                  </div>

                  <div className="work-detail-volume-body">

                    <strong>
                      {formatVolumeTitle(
                        vol.volumeNumber,
                        vol.volumeLabel,
                        work.tracking_unit ?? "volume",
                      )}
                    </strong>

                    {mihonOwner ? (
                      <div className="work-detail-volume-ownership">
                        <OwnerInitialBadge owner={mihonOwner} variant="mihon" />
                      </div>
                    ) : purchaseOwners.length > 0 ? (
                      <div className="work-detail-volume-ownership">
                        {purchaseOwners.map((owner) => (
                          <OwnerInitialBadge
                            key={owner.id}
                            owner={owner}
                            variant="purchase"
                          />
                        ))}
                      </div>
                    ) : null}

                    <p className="work-detail-volume-meta">

                      {vol.releaseDate &&

                        `Sortie : ${formatDateFr(vol.releaseDate)}`}

                      {vol.purchaseDate &&

                        ` · Acheté : ${formatDateFr(vol.purchaseDate)}`}

                      {unitPrice != null && unitPrice > 0

                        ? ` · ${formatCurrency(unitPrice)}`

                        : ""}

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

        onDeleted={() => navigate("/library")}

      />

    </main>

  );

}


