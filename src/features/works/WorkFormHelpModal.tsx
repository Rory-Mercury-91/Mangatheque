import { Modal } from "@/components/common/Modal";
import "./WorkFormHelpModal.css";

export type WorkFormHelpSection = "general" | "hors-serie" | "edition" | "ownership";

export interface WorkFormHelpModalProps {
  open: boolean;
  section?: WorkFormHelpSection;
  onClose: () => void;
}

/**
 * @description Aide contextuelle pour le formulaire création / édition de série.
 */
export function WorkFormHelpModal({
  open,
  section = "general",
  onClose,
}: WorkFormHelpModalProps) {
  return (
    <Modal open={open} title="Aide — formulaire série" onClose={onClose} stacked>
      <div className="work-form-help">
        <section
          id="work-form-help-general"
          className={`work-form-help-section${section === "general" ? " work-form-help-section--focus" : ""}`}
        >
          <h3>Informations communes</h3>
          <p>
            Titre, couverture, éditeur VF, genres et statut de lecture. Les
            compteurs VF / VO servent à l&apos;affichage « Parution » sur la fiche
            détail.
          </p>
        </section>

        <section
          id="work-form-help-hors-serie"
          className={`work-form-help-section${section === "hors-serie" ? " work-form-help-section--focus" : ""}`}
        >
          <h3>Hors série</h3>
          <p>
            À utiliser pour un tome sans numéro classique : fanbook, guide
            officiel, artbook, coffret spécial, etc. Renseignez soit un numéro
            (ex. 1, 1.5), soit ce libellé — au moins l&apos;un des deux est
            obligatoire.
          </p>
          <p className="work-form-help-example">
            Exemples : « Official Guide Book », « Artbook », « Fanbook ».
          </p>
        </section>

        <section
          id="work-form-help-edition"
          className={`work-form-help-section${section === "edition" ? " work-form-help-section--focus" : ""}`}
        >
          <h3>Édition Simple / Collector</h3>
          <p>
            Chaque tome est en édition <strong>Simple</strong> ou{" "}
            <strong>Collector</strong>. Pour ajouter la variante manquante,
            ouvrez le tome existant puis « Dupliquer en Collector » (ou Simple)
            — plus sûr qu&apos;un raccourci sur la fiche série.
          </p>
        </section>

        <section
          id="work-form-help-ownership"
          className={`work-form-help-section${section === "ownership" ? " work-form-help-section--focus" : ""}`}
        >
          <h3>Achat physique et Mihon</h3>
          <p>
            <strong>Achat physique</strong> : propriétaires qui possèdent le
            tome en version papier. <strong>Partagé</strong> divise le prix entre
            les co-acheteurs.
          </p>
          <p>
            <strong>Mihon</strong> : lecture numérique suivie — plusieurs comptes
            peuvent coexister sur le même tome ; l&apos;économie Mihon ne compte
            qu&apos;une seule fois.
          </p>
        </section>
      </div>
    </Modal>
  );
}
