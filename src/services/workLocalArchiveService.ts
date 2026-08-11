import { getSupabaseClient } from "@/lib/supabaseClient";
import type { LocalArchiveUnit } from "@/constants/localArchive";

/** Archive locale liée à une œuvre (éventuellement à un propriétaire). */
export interface WorkLocalArchive {
  id: string;
  workId: string;
  ownerId: string | null;
  rootPath: string;
  demographicFolder: string;
  statusFolder: string;
  expectedCount: number | null;
  receivedCount: number;
  missingCount: number | null;
  unit: LocalArchiveUnit;
  sizeBytes: number;
  /** Plafond local figé (ignore le catalogue VF au rescan). */
  forceComplete: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload d'enregistrement / mise à jour. */
export interface WorkLocalArchiveUpsertInput {
  workId: string;
  ownerId: string | null;
  rootPath: string;
  demographicFolder: string;
  statusFolder: string;
  expectedCount: number | null;
  receivedCount: number;
  missingCount: number | null;
  unit: LocalArchiveUnit;
  sizeBytes: number;
  /** Défaut `false` si omis. */
  forceComplete?: boolean;
  notes: string | null;
}

/** Agrégat de stockage par propriétaire. */
export interface LocalArchiveOwnerStorage {
  ownerId: string | null;
  archiveCount: number;
  sizeBytes: number;
}

/** Totaux foyer des archives locales. */
export interface LocalArchiveStorageSummary {
  archiveCount: number;
  totalBytes: number;
  byOwner: LocalArchiveOwnerStorage[];
}

/** Série dans l'arborescence d'archives. */
export interface LocalArchiveTreeSeries {
  title: string;
  rootPath: string;
  sizeBytes: number;
}

/** Branche statut (Terminé, Incomplet…). */
export interface LocalArchiveTreeStatusBranch {
  statusFolder: string;
  series: LocalArchiveTreeSeries[];
}

/** Branche démographie. */
export interface LocalArchiveTreeDemographicBranch {
  demographicFolder: string;
  statuses: LocalArchiveTreeStatusBranch[];
}

type WorkLocalArchiveRow = {
  id: string;
  work_id: string;
  owner_id: string | null;
  root_path: string;
  demographic_folder: string;
  status_folder: string;
  expected_count: number | null;
  received_count: number;
  missing_count: number | null;
  unit: string;
  size_bytes: number | null;
  force_complete?: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ARCHIVE_SELECT =
  "id, work_id, owner_id, root_path, demographic_folder, status_folder, expected_count, received_count, missing_count, unit, size_bytes, force_complete, notes, created_at, updated_at";

/**
 * @description Mappe une ligne Supabase vers le type applicatif.
 */
function mapRow(row: WorkLocalArchiveRow): WorkLocalArchive {
  return {
    id: row.id,
    workId: row.work_id,
    ownerId: row.owner_id,
    rootPath: row.root_path,
    demographicFolder: row.demographic_folder,
    statusFolder: row.status_folder,
    expectedCount: row.expected_count,
    receivedCount: row.received_count,
    missingCount: row.missing_count,
    unit: row.unit === "chapter" ? "chapter" : "volume",
    sizeBytes: Number(row.size_bytes ?? 0),
    forceComplete: Boolean(row.force_complete),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @description Indique si l'erreur vient d'une table absente.
 */
function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("work_local_archives") ||
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  );
}

/**
 * @description Charge toutes les archives locales d'une œuvre (tous propriétaires).
 */
export async function fetchWorkLocalArchives(
  workId: string,
): Promise<WorkLocalArchive[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_local_archives")
    .select(ARCHIVE_SELECT)
    .eq("work_id", workId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      console.warn(
        "Table work_local_archives absente — lancez la migration Supabase.",
      );
      return [];
    }
    throw new Error(
      `Impossible de charger les archives locales : ${error.message}`,
    );
  }

  return (data ?? []).map((row) => mapRow(row as WorkLocalArchiveRow));
}

/**
 * @description Charge l'archive locale d'une œuvre pour un propriétaire (ou la première).
 */
export async function fetchWorkLocalArchive(
  workId: string,
  ownerId?: string | null,
): Promise<WorkLocalArchive | null> {
  const rows = await fetchWorkLocalArchives(workId);
  if (rows.length === 0) {
    return null;
  }
  if (ownerId) {
    return rows.find((row) => row.ownerId === ownerId) ?? null;
  }
  return rows[0] ?? null;
}

/**
 * @description Enregistre ou met à jour l'archive locale d'une œuvre pour un propriétaire.
 */
export async function upsertWorkLocalArchive(
  input: WorkLocalArchiveUpsertInput,
): Promise<WorkLocalArchive> {
  const supabase = getSupabaseClient();
  const payload = {
    work_id: input.workId,
    owner_id: input.ownerId,
    root_path: input.rootPath,
    demographic_folder: input.demographicFolder,
    status_folder: input.statusFolder,
    expected_count: input.expectedCount,
    received_count: input.receivedCount,
    missing_count: input.missingCount,
    unit: input.unit,
    size_bytes: Math.max(0, Math.floor(input.sizeBytes)),
    force_complete: input.forceComplete === true,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  };

  // Upsert manuel : contrainte partielle (work_id, owner_id) peu fiable via onConflict PostgREST.
  let existingId: string | null = null;
  if (input.ownerId) {
    const { data: existing } = await supabase
      .from("work_local_archives")
      .select("id")
      .eq("work_id", input.workId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    existingId = existing?.id ?? null;
  } else {
    const { data: existing } = await supabase
      .from("work_local_archives")
      .select("id")
      .eq("work_id", input.workId)
      .is("owner_id", null)
      .maybeSingle();
    existingId = existing?.id ?? null;
  }

  const query = existingId
    ? supabase
        .from("work_local_archives")
        .update(payload)
        .eq("id", existingId)
    : supabase.from("work_local_archives").insert(payload);

  const { data, error } = await query.select(ARCHIVE_SELECT).single();

  if (error) {
    throw new Error(
      `Impossible d'enregistrer l'archive locale : ${error.message}`,
    );
  }

  return mapRow(data as WorkLocalArchiveRow);
}

/**
 * @description Met à jour uniquement la taille d'une archive.
 */
export async function updateWorkLocalArchiveSize(
  archiveId: string,
  sizeBytes: number,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("work_local_archives")
    .update({
      size_bytes: Math.max(0, Math.floor(sizeBytes)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", archiveId);

  if (error) {
    throw new Error(
      `Impossible de mettre à jour la taille : ${error.message}`,
    );
  }
}

/**
 * @description Supprime le lien archive locale d'une œuvre pour un propriétaire.
 * @param workId - Identifiant de l'œuvre.
 * @param ownerId - Propriétaire du lien (`null` = entrée sans propriétaire).
 */
export async function deleteWorkLocalArchive(
  workId: string,
  ownerId: string | null,
): Promise<void> {
  const supabase = getSupabaseClient();
  let query = supabase.from("work_local_archives").delete().eq("work_id", workId);
  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  } else {
    query = query.is("owner_id", null);
  }

  const { error } = await query;

  if (error) {
    throw new Error(
      `Impossible de supprimer le lien archive : ${error.message}`,
    );
  }
}

/**
 * @description Métadonnées archive locale pour filtres / badges bibliothèque.
 */
export interface LocalArchiveLibraryMeta {
  statusFolder: string;
  missingCount: number | null;
}

/**
 * @description Mappe workId → dossier / manquants pour le propriétaire courant.
 */
export async function fetchLocalArchiveLibraryMetaByWorkId(
  ownerId?: string | null,
): Promise<Map<string, LocalArchiveLibraryMeta>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_local_archives")
    .select("work_id, owner_id, status_folder, missing_count, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      return new Map();
    }
    throw new Error(
      `Impossible de charger les dossiers d'archive : ${error.message}`,
    );
  }

  const map = new Map<string, LocalArchiveLibraryMeta>();
  for (const row of data ?? []) {
    const workId = String(row.work_id ?? "");
    const statusFolder = String(row.status_folder ?? "").trim();
    if (!workId || !statusFolder) {
      continue;
    }
    const rowOwnerId =
      row.owner_id == null ? null : String(row.owner_id);
    if (ownerId && rowOwnerId !== ownerId) {
      continue;
    }
    if (!map.has(workId)) {
      const rawMissing = row.missing_count;
      const missingCount =
        rawMissing == null || Number.isNaN(Number(rawMissing))
          ? null
          : Math.max(0, Math.floor(Number(rawMissing)));
      map.set(workId, { statusFolder, missingCount });
    }
  }
  return map;
}

/**
 * @description Mappe workId → status_folder (raccourci filtre biblio).
 */
export async function fetchLocalArchiveStatusFolderByWorkId(
  ownerId?: string | null,
): Promise<Map<string, string>> {
  const meta = await fetchLocalArchiveLibraryMetaByWorkId(ownerId);
  const map = new Map<string, string>();
  for (const [workId, value] of meta) {
    map.set(workId, value.statusFolder);
  }
  return map;
}

/**
 * @description Agrège le poids total des archives locales (foyer + par propriétaire).
 */
export async function fetchLocalArchiveStorageSummary(): Promise<LocalArchiveStorageSummary> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_local_archives")
    .select("owner_id, size_bytes");

  if (error) {
    if (isMissingTableError(error.message)) {
      return { archiveCount: 0, totalBytes: 0, byOwner: [] };
    }
    throw new Error(
      `Impossible de charger le stockage archives : ${error.message}`,
    );
  }

  const rows = data ?? [];
  const byOwnerMap = new Map<string | null, LocalArchiveOwnerStorage>();
  let totalBytes = 0;

  for (const row of rows) {
    const ownerId = (row.owner_id as string | null) ?? null;
    const size = Number(row.size_bytes ?? 0);
    totalBytes += size;
    const current = byOwnerMap.get(ownerId) ?? {
      ownerId,
      archiveCount: 0,
      sizeBytes: 0,
    };
    current.archiveCount += 1;
    current.sizeBytes += size;
    byOwnerMap.set(ownerId, current);
  }

  return {
    archiveCount: rows.length,
    totalBytes,
    byOwner: Array.from(byOwnerMap.values()).sort(
      (a, b) => b.sizeBytes - a.sizeBytes,
    ),
  };
}

/**
 * @description Dernier segment d'un chemin d'archive (nom de série).
 */
function archivePathBasename(path: string): string {
  const parts = path
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .split("\\")
    .filter(Boolean);
  return parts[parts.length - 1] || path.trim() || "sans-nom";
}

/**
 * @description Construit l'arborescence démographie → statut → séries par propriétaire.
 */
export async function fetchLocalArchiveTreesByOwner(): Promise<
  Map<string | null, LocalArchiveTreeDemographicBranch[]>
> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("work_local_archives")
    .select(
      "owner_id, root_path, demographic_folder, status_folder, size_bytes",
    )
    .order("demographic_folder", { ascending: true })
    .order("status_folder", { ascending: true })
    .order("root_path", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      return new Map();
    }
    throw new Error(
      `Impossible de charger l'arborescence archives : ${error.message}`,
    );
  }

  type AccStatus = Map<string, LocalArchiveTreeSeries[]>;
  type AccDemo = Map<string, AccStatus>;
  const byOwner = new Map<string | null, AccDemo>();

  for (const row of data ?? []) {
    const ownerId = (row.owner_id as string | null) ?? null;
    const demographic =
      String(row.demographic_folder ?? "").trim() || "autre";
    const status = String(row.status_folder ?? "").trim() || "Sans statut";
    const rootPath = String(row.root_path ?? "").trim();
    if (!rootPath) {
      continue;
    }
    const sizeBytes = Math.max(0, Number(row.size_bytes ?? 0));

    let demos = byOwner.get(ownerId);
    if (!demos) {
      demos = new Map();
      byOwner.set(ownerId, demos);
    }
    let statuses = demos.get(demographic);
    if (!statuses) {
      statuses = new Map();
      demos.set(demographic, statuses);
    }
    const series = statuses.get(status) ?? [];
    series.push({
      title: archivePathBasename(rootPath),
      rootPath,
      sizeBytes,
    });
    statuses.set(status, series);
  }

  const result = new Map<string | null, LocalArchiveTreeDemographicBranch[]>();
  for (const [ownerId, demos] of byOwner) {
    const branches: LocalArchiveTreeDemographicBranch[] = [];
    for (const [demographicFolder, statuses] of demos) {
      const statusBranches: LocalArchiveTreeStatusBranch[] = [];
      for (const [statusFolder, series] of statuses) {
        statusBranches.push({
          statusFolder,
          series: [...series].sort((a, b) =>
            a.title.localeCompare(b.title, "fr", { sensitivity: "base" }),
          ),
        });
      }
      statusBranches.sort((a, b) =>
        a.statusFolder.localeCompare(b.statusFolder, "fr", {
          sensitivity: "base",
        }),
      );
      branches.push({ demographicFolder, statuses: statusBranches });
    }
    branches.sort((a, b) =>
      a.demographicFolder.localeCompare(b.demographicFolder, "fr", {
        sensitivity: "base",
      }),
    );
    result.set(ownerId, branches);
  }
  return result;
}
