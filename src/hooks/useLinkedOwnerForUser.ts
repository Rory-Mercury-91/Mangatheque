import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  fetchOwnersWithAccountLinks,
  type OwnerWithAccountLink,
} from "@/services/ownerAccountLinkService";

/**
 * @description Propriétaire métier lié au compte Supabase connecté (favoris, journal…).
 */
export function useLinkedOwnerForUser() {
  const { user } = useAuth();
  const [linkedOwner, setLinkedOwner] = useState<OwnerWithAccountLink | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchOwnersWithAccountLinks()
      .then((owners) => {
        if (cancelled) {
          return;
        }
        const match = user?.id
          ? (owners.find((owner) => owner.linkedUserId === user.id) ?? null)
          : null;
        setLinkedOwner(match);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { linkedOwner, loading };
}
