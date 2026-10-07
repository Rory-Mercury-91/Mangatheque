import type { ImportFieldDiff, MergeFieldSide } from "@/services/importMergeService";

/**
 * @description Boutons pour retenir toute une section en base ou dans la fusion.
 */
export function BulkSideButtons({
  onKeep,
  onTake,
}: {
  onKeep: () => void;
  onTake: () => void;
}) {
  return (
    <div className="import-merge-bulk">
      <button type="button" className="import-merge-bulk-btn" onClick={onKeep}>
        Tout garder
      </button>
      <button type="button" className="import-merge-bulk-btn" onClick={onTake}>
        Tout prendre
      </button>
    </div>
  );
}

/**
 * @description Tableau avant / proposé. Chaque valeur est cliquable sauf en lecture seule.
 */
export function DiffTable({
  diffs,
  selected,
  onSelect,
  readOnly = false,
}: {
  diffs: ImportFieldDiff[];
  selected?: (fieldKey: string) => MergeFieldSide;
  onSelect?: (fieldKey: string, side: MergeFieldSide) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="import-merge-table-wrap">
      <table className="import-merge-table">
        <thead>
          <tr>
            <th scope="col">Champ</th>
            <th scope="col">En base</th>
            <th scope="col">Proposé</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => {
            const side = selected?.(diff.fieldKey) ?? "take";
            return (
              <tr key={diff.fieldKey}>
                <th scope="row">{diff.label}</th>
                <td className="import-merge-before">
                  {readOnly || !onSelect ? (
                    diff.before
                  ) : (
                    <button
                      type="button"
                      className={`import-merge-choice${side === "keep" ? " import-merge-choice--selected" : ""}`}
                      aria-pressed={side === "keep"}
                      aria-label={`Garder ${diff.label} : ${diff.before}`}
                      onClick={() => onSelect(diff.fieldKey, "keep")}
                    >
                      {diff.before}
                    </button>
                  )}
                </td>
                <td className="import-merge-after">
                  {readOnly || !onSelect ? (
                    diff.after
                  ) : (
                    <button
                      type="button"
                      className={`import-merge-choice${side === "take" ? " import-merge-choice--selected" : ""}`}
                      aria-pressed={side === "take"}
                      aria-label={`Prendre ${diff.label} : ${diff.after}`}
                      onClick={() => onSelect(diff.fieldKey, "take")}
                    >
                      {diff.after}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
