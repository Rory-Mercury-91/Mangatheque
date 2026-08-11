import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/common/Modal";
import {
  FormModalCancelButton,
  FormModalSaveButton,
} from "@/components/common/FormModalActions";
import type { LocalArchivePlan } from "@/utils/localArchivePath";
import type { ArchiveFileRename } from "@/utils/localArchiveRename";
import type { LocalArchiveRenameMapping } from "@/services/platform/localArchiveFsService";
import { formatByteSize } from "@/utils/formatByteSize";
import "./LocalArchiveConfirmModal.css";

/** Mode d'opération sur l'archive locale. */
export type LocalArchiveConfirmMode = "create" | "append" | "replace";

/** Politique si le dossier cible existe déjà. */
export type LocalArchiveConflictPolicy = "merge" | "replace";

/** Style de fusion à l'ajout (même dossier / autre source). */
export type LocalArchiveMergeStyle = "direct" | "scan";

/** Ligne éditable du tableau de renommage. */
export type LocalArchiveRenameDraft = {
  fromName: string;
  toName: string;
  rename: boolean;
};

export interface LocalArchiveConfirmModalProps {
  open: boolean;
  mode: LocalArchiveConfirmMode;
  plan: LocalArchivePlan | null;
  sourceLabel: string;
  renames: ArchiveFileRename[];
  /** Le dossier de destination existe déjà sur le disque. */
  destinationExists: boolean;
  saving: boolean;
  error: string | null;
  onConfirm: (
    mappings: LocalArchiveRenameMapping[],
    conflictPolicy?: LocalArchiveConflictPolicy,
    mergeStyle?: LocalArchiveMergeStyle,
  ) => void;
  onClose: () => void;
}

/**
 * @description Construit les drafts depuis la proposition automatique.
 */
function toDrafts(renames: ArchiveFileRename[]): LocalArchiveRenameDraft[] {
  return renames.map((item) => ({
    fromName: item.fromName,
    toName: item.toName,
    rename: true,
  }));
}

/**
 * @description Modale de confirmation avant déplacement / ajout d'archive.
 */
export function LocalArchiveConfirmModal({
  open,
  mode,
  plan,
  sourceLabel,
  renames,
  destinationExists,
  saving,
  error,
  onConfirm,
  onClose,
}: LocalArchiveConfirmModalProps) {
  const formId = useId();
  const [drafts, setDrafts] = useState<LocalArchiveRenameDraft[]>([]);
  const [conflictPolicy, setConflictPolicy] =
    useState<LocalArchiveConflictPolicy | null>(null);
  const [mergeStyle, setMergeStyle] =
    useState<LocalArchiveMergeStyle>("direct");

  const needsConflictChoice =
    destinationExists && mode !== "append";

  useEffect(() => {
    if (open) {
      setDrafts(toDrafts(renames));
      setConflictPolicy(mode === "replace" ? "replace" : null);
      setMergeStyle("direct");
    }
  }, [open, plan?.destinationPath, mode, renames]);

  if (!plan) {
    return null;
  }

  const unitLabel = plan.unit === "chapter" ? "chapitres" : "volumes";
  const hasExtras =
    plan.expectedCount != null &&
    plan.expectedCount > 0 &&
    plan.receivedCount > plan.expectedCount;
  const contentLabel = hasExtras
    ? `${plan.receivedCount} fichiers · ${plan.expectedCount} ${unitLabel} catalogue (+ sous-chapitres / extras)`
    : `${plan.receivedCount} ${unitLabel}${
        plan.expectedCount != null
          ? ` / ${plan.expectedCount} attendus`
          : ""
      }`;

  const title =
    mode === "append"
      ? "Ajouter à l'archive"
      : mode === "replace"
        ? "Remplacer l'archive"
        : "Ranger l'archive";

  const intro =
    mode === "append" ? (
      <>
        Les fichiers seront <strong>déplacés</strong> dans l&apos;archive
        existante :
      </>
    ) : mode === "replace" ? (
      <>L&apos;archive actuelle sera remplacée (déplacement) vers :</>
    ) : (
      <>
        L&apos;archive sera <strong>déplacée</strong> (pas copiée) vers :
      </>
    );

  const canSubmit = !saving && (!needsConflictChoice || conflictPolicy != null);

  const patchDraft = (
    fromName: string,
    patch: Partial<LocalArchiveRenameDraft>,
  ) => {
    setDrafts((prev) =>
      prev.map((row) =>
        row.fromName === fromName ? { ...row, ...patch } : row,
      ),
    );
  };

  const buildMappings = (): LocalArchiveRenameMapping[] =>
    drafts.map((row) => {
      const trimmed = row.toName.trim();
      return {
        fromName: row.fromName,
        toName: row.rename && trimmed ? trimmed : row.fromName,
      };
    });

  return (
    <Modal
      open={open}
      title={title}
      wide
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <FormModalCancelButton disabled={saving} onClick={onClose} />
          <FormModalSaveButton
            type="submit"
            form={formId}
            saving={saving}
            disabled={!canSubmit}
            title={mode === "append" ? "Ajouter" : "Déplacer"}
            aria-label={
              mode === "append"
                ? "Confirmer l'ajout"
                : "Confirmer le déplacement"
            }
          />
        </>
      }
    >
      <form
        id={formId}
        className="local-archive-confirm"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }
          onConfirm(
            buildMappings(),
            needsConflictChoice
              ? (conflictPolicy ?? undefined)
              : mode === "replace"
                ? "replace"
                : undefined,
            mode === "append" ? mergeStyle : undefined,
          );
        }}
      >
        <div className="local-archive-confirm-dest">
          <p className="local-archive-confirm-dest-label">{intro}</p>
          <p
            className="local-archive-confirm-path"
            title={plan.destinationPath}
          >
            {plan.destinationPath}
          </p>
        </div>

        {mode === "append" ? (
          <fieldset className="local-archive-confirm-merge">
            <legend>Type de fusion</legend>
            <div
              className="local-archive-confirm-merge-pills"
              role="radiogroup"
              aria-label="Type de fusion"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mergeStyle === "direct"}
                className={`local-archive-confirm-merge-pill${
                  mergeStyle === "direct"
                    ? " local-archive-confirm-merge-pill--active"
                    : ""
                }`}
                disabled={saving}
                onClick={() => setMergeStyle("direct")}
              >
                Fusion directe (même source)
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mergeStyle === "scan"}
                className={`local-archive-confirm-merge-pill${
                  mergeStyle === "scan"
                    ? " local-archive-confirm-merge-pill--active"
                    : ""
                }`}
                disabled={saving}
                onClick={() => setMergeStyle("scan")}
              >
                Fusion scan (autre source)
              </button>
            </div>
            {mergeStyle === "scan" ? (
              <p className="local-archive-confirm-merge-hint">
                Les fichiers seront suffixés <code>-scan</code> dans le même
                dossier (ex. 309.cbz → 309-scan.cbz).
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {needsConflictChoice ? (
          <fieldset className="local-archive-confirm-conflict">
            <legend>Ce dossier existe déjà</legend>
            <p className="local-archive-confirm-conflict-hint">
              Que souhaitez-vous faire ?
            </p>
            <label className="local-archive-confirm-conflict-option">
              <input
                type="radio"
                name="archive-conflict"
                checked={conflictPolicy === "merge"}
                disabled={saving}
                onChange={() => setConflictPolicy("merge")}
              />
              <span>
                <strong>Fusionner</strong> — conserver l&apos;existant et y
                ajouter les nouveaux fichiers (homonymes écrasés).
              </span>
            </label>
            <label className="local-archive-confirm-conflict-option">
              <input
                type="radio"
                name="archive-conflict"
                checked={conflictPolicy === "replace"}
                disabled={saving}
                onChange={() => setConflictPolicy("replace")}
              />
              <span>
                <strong>Remplacer</strong> — supprimer le contenu actuel du
                dossier, puis y ranger la source.
              </span>
            </label>
          </fieldset>
        ) : null}

        <dl className="local-archive-confirm-meta">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          <div>
            <dt>Démographie</dt>
            <dd>{plan.demographicFolder}</dd>
          </div>
          <div>
            <dt>Statut dossier</dt>
            <dd>{plan.statusFolder}</dd>
          </div>
          <div>
            <dt>Contenu détecté</dt>
            <dd>{contentLabel}</dd>
          </div>
          <div>
            <dt>Poids</dt>
            <dd>{formatByteSize(plan.sizeBytes)}</dd>
          </div>
        </dl>

        {plan.note ? (
          <p className="local-archive-confirm-note" role="status">
            {plan.note}
          </p>
        ) : null}

        {drafts.length > 0 ? (
          <div className="local-archive-confirm-table-wrap">
            <table className="local-archive-confirm-table">
              <thead>
                <tr>
                  <th scope="col" className="local-archive-confirm-table-check">
                    <span className="sr-only">Renommer</span>
                  </th>
                  <th scope="col">Fichier source</th>
                  <th scope="col">Nom cible</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((row) => (
                  <tr
                    key={row.fromName}
                    className={row.rename ? undefined : "is-skipped"}
                  >
                    <td className="local-archive-confirm-table-check">
                      <input
                        type="checkbox"
                        checked={row.rename}
                        disabled={saving}
                        title="Renommer ce fichier"
                        aria-label={`Renommer ${row.fromName}`}
                        onChange={(event) =>
                          patchDraft(row.fromName, {
                            rename: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td>
                      <span
                        className="local-archive-confirm-rename-from"
                        title={row.fromName}
                      >
                        {row.fromName}
                      </span>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="local-archive-confirm-name-input"
                        value={row.toName}
                        disabled={saving || !row.rename}
                        spellCheck={false}
                        aria-label={`Nom cible pour ${row.fromName}`}
                        onChange={(event) =>
                          patchDraft(row.fromName, {
                            toName: event.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {error ? (
          <p className="local-archive-confirm-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
