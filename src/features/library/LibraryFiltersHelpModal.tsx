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
          <h3>Présentation selon l&apos;appareil</h3>
          <p>
            <strong>Ordinateur</strong> — tous les filtres sont visibles en
            grille. Le chevron masque ou affiche Lecture, Statut, Démographie
            et Genres.
          </p>
          <p>
            <strong>Tablette</strong> — ouvrez le tiroir (chevron) pour les
            filtres. Deux rangées : Profil / Favoris / Statut / Lecture, puis
            Démographie / Genres (icône, libellé et chevron).
          </p>
          <p>
            <strong>Mobile</strong> — ouvrez le tiroir pour accéder aux filtres.
            Même disposition en deux rangées ; icône et chevron seuls sur petit
            écran. Un point bleu signale un filtre actif dans une section
            fermée.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Profils (Alex, Céline, Sébastien)</h3>
          <p>
            Chaque badge se parcourt en <strong>3 appuis</strong> :
          </p>
          <ol className="library-filters-help-steps">
            <li>
              <strong>Neutre</strong> — cadre coloré du compte, filtre inactif.
            </li>
            <li>
              <strong>Présent</strong> — fond teinté : séries où le compte
              apparaît (achat, co-propriété ou Mihon).
            </li>
            <li>
              <strong>Seul</strong> — fond teinté, nom en rouge : séries dont
              ce compte est seul propriétaire physique (hors co-propriété et
              Mihon).
            </li>
          </ol>
          <p className="library-filters-help-note">
            Plusieurs comptes actifs : une série suffit si elle correspond à
            l&apos;un d&apos;eux.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Mihon</h3>
          <p>Cycle en 3 appuis :</p>
          <ol className="library-filters-help-steps">
            <li>
              <strong>Neutre</strong> — cadre cyan, filtre inactif.
            </li>
            <li>
              <strong>Mihon uniquement</strong> — fond teinté cyan.
            </li>
            <li>
              <strong>Sans Mihon</strong> — fond teinté, nom barré en rouge.
            </li>
          </ol>
        </section>

        <section className="library-filters-help-section">
          <h3>Filtres simples</h3>
          <p>
            Favoris, Lecture, Statut, Démographie et Genres : un clic active
            ou désactive la pastille. Plusieurs pastilles d&apos;un même groupe
            = séries correspondant à au moins l&apos;un des critères choisis.
          </p>
          <p>
            <strong>Statut</strong> (publication VF) se distingue par un contour
            pointillé. <strong>Lecture</strong> concerne votre progression
            personnelle.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>Recherche et tri</h3>
          <p>
            La recherche filtre par titre. Sur ordinateur et tablette, le tri et
            l&apos;épingle sont sur la même ligne que la recherche. Sur mobile,
            le tri se trouve dans le tiroir des filtres. L&apos;épingle
            enregistre le tri par défaut de votre compte.
          </p>
        </section>
      </div>
    </Modal>
  );
}
