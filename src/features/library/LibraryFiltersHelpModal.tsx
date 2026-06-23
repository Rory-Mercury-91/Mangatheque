import { Modal } from "@/components/common/Modal";
import { LIBRARY_META_FILTER_GROUPS } from "@/features/library/libraryMetaFilterGroups";
import { LIBRARY_PRIMARY_FILTER_GROUPS } from "@/features/library/libraryPrimaryFilterGroups";
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
          <h3>Les six groupes</h3>
          <p>
            Chaque bouton ouvre ses pastilles. Un point bleu signale un filtre
            actif dans une section fermée.
          </p>
          <div className="library-filters-help-groups" aria-hidden>
            <div className="library-filters-help-groups-row library-filters-help-groups-row--primary">
              {LIBRARY_PRIMARY_FILTER_GROUPS.map((group) => (
                <span key={group.id} className="library-filters-help-group-chip">
                  <span className="library-filters-help-group-chip-icon">
                    {group.icon}
                  </span>
                  <span className="library-filters-help-group-chip-label">
                    {group.label}
                  </span>
                </span>
              ))}
            </div>
            <div className="library-filters-help-groups-row library-filters-help-groups-row--meta">
              {LIBRARY_META_FILTER_GROUPS.map((group) => (
                <span key={group.id} className="library-filters-help-group-chip">
                  <span className="library-filters-help-group-chip-icon">
                    {group.icon}
                  </span>
                  <span className="library-filters-help-group-chip-label">
                    {group.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="library-filters-help-section">
          <h3>Présentation selon l&apos;appareil</h3>
          <p>
            <strong>Ordinateur</strong> — tous les filtres sont visibles en
            grille avec icône et libellé. Le chevron masque ou affiche Lecture,
            Statut, Démographie et Genres.
          </p>
          <p>
            <strong>Tablette</strong> — ouvrez le tiroir (chevron) pour les
            filtres. Même disposition qu&apos;au-dessus : une ligne de quatre
            boutons, puis Démographie et Genres (icône, libellé et chevron).
          </p>
          <p>
            <strong>Mobile</strong> — ouvrez le tiroir pour accéder aux filtres.
            Quatre icônes sur la première ligne, puis Démographie et Genres en
            dessous (texte masqué, icône et chevron seuls). Le tiroir filtres et
            les volets ouverts se replient au défilement volontaire de la liste.
          </p>
        </section>

        <section className="library-filters-help-section">
          <h3>
            <span aria-hidden>👤 </span>
            Profil (Alex, Céline, Sébastien…)
          </h3>
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
          <p>Cycle en 3 appuis (dans le groupe Profil) :</p>
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
            <span aria-hidden>⭐ </span>
            <strong>Favoris</strong>,{" "}
            <span aria-hidden>📑 </span>
            <strong>Lecture</strong>,{" "}
            <span aria-hidden>🎬 </span>
            <strong>Statut</strong>,{" "}
            <span aria-hidden>👥 </span>
            <strong>Démographie</strong> et{" "}
            <span aria-hidden>🏷️ </span>
            <strong>Genres</strong> : un clic active ou désactive la pastille.
            Plusieurs pastilles d&apos;un même groupe = séries correspondant à
            au moins l&apos;un des critères choisis.
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
