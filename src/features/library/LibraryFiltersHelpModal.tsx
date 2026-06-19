import { Modal } from "@/components/common/Modal";
import "./LibraryFiltersHelpModal.css";

export interface LibraryFiltersHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * @description Aide condensée sur le fonctionnement des filtres bibliothèque.
 */
export function LibraryFiltersHelpModal({
  open,
  onClose,
}: LibraryFiltersHelpModalProps) {
  return (
    <Modal open={open} title="Aide — filtres bibliothèque" onClose={onClose}>
      <div className="library-filters-help">
        <p className="library-filters-help-intro">
          Les filtres se cumulent : une série doit correspondre à tous les
          groupes actifs en même temps.
        </p>

        <section className="library-filters-help-section">
          <h3>Comptes (Alex, Céline, Sébastien)</h3>
          <p>
            Chaque badge se parcourt en <strong>3 appuis</strong> :
          </p>
          <ol className="library-filters-help-steps">
            <li>
              <strong>Présent</strong> — séries où le compte apparaît (achat,
              co-propriété ou Mihon).
            </li>
            <li>
              <strong>Seul</strong> — séries dont ce compte est seul
              propriétaire physique (hors co-propriété et Mihon).
            </li>
            <li>
              <strong>Neutre</strong> — filtre désactivé pour ce compte.
            </li>
          </ol>
          <p className="library-filters-help-note">
            Plusieurs comptes actifs : une série suffit si elle correspond à
            l&apos;un d&apos;eux.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Mihon</h3>
          <p>
            Cycle en 3 appuis : <strong>Mihon uniquement</strong> →{" "}
            <strong>sans Mihon</strong> → inactif.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Filtres simples</h3>
          <p>
            Favoris, Ma lecture, Statut, Démographie et Genres : un clic active
            ou désactive la pastille. Plusieurs pastilles d&apos;un même groupe
            = séries correspondant à au moins l&apos;un des critères choisis.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Recherche et tri</h3>
          <p>
            La recherche filtre par titre. Le tri réorganise les résultats sans
            les exclure. L&apos;épingle enregistre le tri par défaut de votre
            compte.
          </p>
        </section>
      </div>
    </Modal>
  );
}
