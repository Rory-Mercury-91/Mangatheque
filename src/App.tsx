import { BookOpen, Loader2 } from "lucide-react";
import { useSupabaseHealth } from "@/hooks/useSupabaseHealth";
import "./App.css";

/**
 * @description Écran d'accueil temporaire en attendant les pages métier.
 */
function App() {
  const health = useSupabaseHealth();

  return (
    <main className="app-shell">
      <header className="app-header">
        <BookOpen size={28} aria-hidden />
        <h1>Mangathèque</h1>
      </header>

      <section className="app-status">
        <p>Suivi des achats manga, webtoon et light novels du foyer.</p>
        <SupabaseStatus health={health} />
      </section>
    </main>
  );
}

interface SupabaseStatusProps {
  health: ReturnType<typeof useSupabaseHealth>;
}

/**
 * @description Affiche le statut réel de la connexion Supabase.
 */
function SupabaseStatus({ health }: SupabaseStatusProps) {
  if (health.state === "checking") {
    return (
      <p className="status-checking">
        <Loader2 size={16} className="spin" aria-hidden />
        Vérification de la connexion Supabase…
      </p>
    );
  }

  if (health.state === "not_configured") {
    return (
      <p className="status-error">
        Supabase non configuré — copiez .env.example vers .env.
      </p>
    );
  }

  if (health.state === "migration_missing") {
    return (
      <p className="status-error">
        Connexion OK, mais les tables sont absentes. Exécutez la migration SQL
        dans le dashboard Supabase.
      </p>
    );
  }

  if (health.state === "error") {
    return (
      <p className="status-error">
        Erreur Supabase : {health.message}
      </p>
    );
  }

  const ownerNames = health.owners.map((owner) => owner.name).join(", ");

  return (
    <>
      <p className="status-ok">
        Base de données connectée — migration appliquée ({health.owners.length}{" "}
        propriétaire{health.owners.length > 1 ? "s" : ""}).
      </p>
      <p className="owners-hint">Propriétaires : {ownerNames || "—"}</p>
    </>
  );
}

export default App;
