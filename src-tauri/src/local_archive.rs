//! Déplacement et inspection d'archives locales (desktop uniquement).

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Entrée visible d'un dossier source.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArchiveEntry {
    pub name: String,
    pub is_dir: bool,
}

/// Résultat d'inspection d'un chemin source.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArchiveInspectResult {
    pub path: String,
    pub is_dir: bool,
    pub name: String,
    pub entry_count: u32,
    pub entries: Vec<LocalArchiveEntry>,
    pub size_bytes: u64,
}

/// Résultat d'un déplacement d'archive.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArchiveMoveResult {
    pub path: String,
    pub size_bytes: u64,
}

/// Mapping de renommage fourni par le frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalArchiveRenameMapping {
    pub from_name: String,
    pub to_name: String,
}

/// Liste les entrées « contenu » d'un dossier.
fn list_content_entries(dir: &Path) -> Result<Vec<LocalArchiveEntry>, String> {
    let read = fs::read_dir(dir).map_err(|err| {
        format!(
            "Lecture impossible de « {} » : {err}",
            dir.display()
        )
    })?;
    let mut entries = Vec::new();
    for entry in read {
        let entry = entry.map_err(|err| format!("Entrée illisible : {err}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("Thumbs.db") {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|err| format!("Type illisible pour « {name} » : {err}"))?;
        entries.push(LocalArchiveEntry {
            name,
            is_dir: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
    });
    Ok(entries)
}

/// Mesure récursive la taille d'un fichier ou dossier.
fn measure_path_size(path: &Path) -> Result<u64, String> {
    if path.is_file() {
        return fs::metadata(path)
            .map(|meta| meta.len())
            .map_err(|err| {
                format!(
                    "Taille illisible pour « {} » : {err}",
                    path.display()
                )
            });
    }
    if !path.is_dir() {
        return Ok(0);
    }
    let mut total = 0u64;
    let read = fs::read_dir(path).map_err(|err| {
        format!(
            "Lecture impossible de « {} » : {err}",
            path.display()
        )
    })?;
    for entry in read {
        let entry = entry.map_err(|err| format!("Entrée illisible : {err}"))?;
        let child = entry.path();
        total = total.saturating_add(measure_path_size(&child)?);
    }
    Ok(total)
}

/// Inspecte un fichier ou dossier d'archive.
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_inspect(path: String) -> Result<LocalArchiveInspectResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Chemin vide.".into());
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() {
        return Err(format!("Chemin introuvable : {trimmed}"));
    }
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| trimmed.to_string());
    let is_dir = p.is_dir();
    let entries = if is_dir {
        list_content_entries(&p)?
    } else {
        Vec::new()
    };
    let entry_count = if is_dir {
        entries.len() as u32
    } else {
        1
    };
    let size_bytes = measure_path_size(&p)?;
    Ok(LocalArchiveInspectResult {
        path: p.to_string_lossy().to_string(),
        is_dir,
        name,
        entry_count,
        entries,
        size_bytes,
    })
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_inspect(_path: String) -> Result<LocalArchiveInspectResult, String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}

/// Copie récursive d'un dossier (secours cross-volume).
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|err| {
        format!("Création de « {} » impossible : {err}", dst.display())
    })?;
    let entries = fs::read_dir(src).map_err(|err| {
        format!("Lecture de « {} » impossible : {err}", src.display())
    })?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("Entrée illisible : {err}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to).map_err(|err| {
                format!(
                    "Copie de « {} » vers « {} » impossible : {err}",
                    from.display(),
                    to.display()
                )
            })?;
        }
    }
    Ok(())
}

/// Supprime un dossier récursivement.
fn remove_dir_recursive(path: &Path) -> Result<(), String> {
    fs::remove_dir_all(path).map_err(|err| {
        format!("Suppression de « {} » impossible : {err}", path.display())
    })
}

/// Déplace un chemin (fichier ou dossier). Secours copie+suppression si rename échoue.
fn move_path(src: &Path, dst: &Path, overwrite: bool) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "Création du dossier parent « {} » impossible : {err}",
                parent.display()
            )
        })?;
    }
    if dst.exists() {
        if !overwrite {
            return Err(format!(
                "La destination existe déjà : {}",
                dst.display()
            ));
        }
        if dst.is_dir() {
            remove_dir_recursive(dst)?;
        } else {
            fs::remove_file(dst).map_err(|err| {
                format!(
                    "Suppression de « {} » impossible : {err}",
                    dst.display()
                )
            })?;
        }
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(rename_err) => {
            if src.is_dir() {
                copy_dir_recursive(src, dst)?;
                remove_dir_recursive(src).map_err(|err| {
                    format!(
                        "Déplacement partiel : copie OK mais suppression source échouée ({err}). Rename initial : {rename_err}"
                    )
                })?;
                Ok(())
            } else {
                fs::copy(src, dst).map_err(|err| {
                    format!(
                        "Déplacement impossible (rename: {rename_err}, copie: {err})"
                    )
                })?;
                fs::remove_file(src).map_err(|err| {
                    format!(
                        "Fichier copié mais source non supprimée ({err}). Destination : {}",
                        dst.display()
                    )
                })?;
                Ok(())
            }
        }
    }
}

/// Indique si un dossier est vide (ou n'existe plus).
fn dir_is_empty(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(true);
    }
    let mut read = fs::read_dir(path).map_err(|err| {
        format!("Lecture de « {} » impossible : {err}", path.display())
    })?;
    Ok(read.next().is_none())
}

/// Déplace le contenu d'un dossier vers la destination avec renommages optionnels.
fn move_dir_contents_with_renames(
    src_dir: &Path,
    dest: &Path,
    renames: &[LocalArchiveRenameMapping],
    overwrite: bool,
) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|err| {
        format!(
            "Création de « {} » impossible : {err}",
            dest.display()
        )
    })?;

    if !renames.is_empty() {
        for mapping in renames {
            let from = src_dir.join(&mapping.from_name);
            if !from.exists() {
                return Err(format!(
                    "Fichier source introuvable : {}",
                    from.display()
                ));
            }
            let to = dest.join(&mapping.to_name);
            move_path(&from, &to, overwrite)?;
        }
    } else {
        let entries = list_content_entries(src_dir)?;
        for entry in entries {
            let from = src_dir.join(&entry.name);
            let to = dest.join(&entry.name);
            move_path(&from, &to, overwrite)?;
        }
    }

    if dir_is_empty(src_dir)? {
        let _ = fs::remove_dir(src_dir);
    }

    Ok(())
}

/// Politique si le dossier série cible existe déjà.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OnExistingPolicy {
    Merge,
    Replace,
}

fn parse_on_existing(value: Option<String>) -> Result<Option<OnExistingPolicy>, String> {
    match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some("merge") => Ok(Some(OnExistingPolicy::Merge)),
        Some("replace") => Ok(Some(OnExistingPolicy::Replace)),
        Some(other) => Err(format!(
            "Politique inconnue « {other} » (attendu : merge ou replace)."
        )),
    }
}

/// Déplace dossier(s)/fichier(s) vers le dossier série cible (move, pas copie seule).
/// Si `renames` est fourni et qu'il y a un seul dossier source, les fichiers sont
/// déplacés un par un avec le nouveau nom.
/// `on_existing` : `merge` (fusionner / écraser homonymes) ou `replace` (vider puis ranger).
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_move(
    sources: Vec<String>,
    destination: String,
    renames: Option<Vec<LocalArchiveRenameMapping>>,
    on_existing: Option<String>,
) -> Result<LocalArchiveMoveResult, String> {
    let dest = PathBuf::from(destination.trim());
    if dest.as_os_str().is_empty() {
        return Err("Destination vide.".into());
    }
    let paths: Vec<PathBuf> = sources
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect();
    if paths.is_empty() {
        return Err("Aucune source à déplacer.".into());
    }
    for p in &paths {
        if !p.exists() {
            return Err(format!("Source introuvable : {}", p.display()));
        }
    }

    let rename_list = renames.unwrap_or_default();
    let existing_policy = parse_on_existing(on_existing)?;

    // Dossier unique : déplacer le contenu (avec renommage éventuel).
    if paths.len() == 1 && paths[0].is_dir() {
        if dest.exists() {
            match existing_policy {
                Some(OnExistingPolicy::Replace) => {
                    remove_dir_recursive(&dest)?;
                    move_dir_contents_with_renames(&paths[0], &dest, &rename_list, true)?;
                }
                Some(OnExistingPolicy::Merge) => {
                    move_dir_contents_with_renames(&paths[0], &dest, &rename_list, true)?;
                }
                None => {
                    return Err(format!(
                        "La destination existe déjà : {}. Choisissez fusionner ou remplacer.",
                        dest.display()
                    ));
                }
            }
        } else {
            move_dir_contents_with_renames(&paths[0], &dest, &rename_list, false)?;
        }
        let size_bytes = measure_path_size(&dest)?;
        return Ok(LocalArchiveMoveResult {
            path: dest.to_string_lossy().to_string(),
            size_bytes,
        });
    }

    // Un ou plusieurs fichiers → dossier série.
    if dest.exists() && !dest.is_dir() {
        return Err(format!(
            "La destination n'est pas un dossier : {}",
            dest.display()
        ));
    }
    if dest.exists() {
        match existing_policy {
            Some(OnExistingPolicy::Replace) => remove_dir_recursive(&dest)?,
            Some(OnExistingPolicy::Merge) => {}
            None => {
                return Err(format!(
                    "La destination existe déjà : {}. Choisissez fusionner ou remplacer.",
                    dest.display()
                ));
            }
        }
    }

    let overwrite = matches!(
        existing_policy,
        Some(OnExistingPolicy::Merge) | Some(OnExistingPolicy::Replace)
    );

    fs::create_dir_all(&dest).map_err(|err| {
        format!(
            "Création de « {} » impossible : {err}",
            dest.display()
        )
    })?;

    if !rename_list.is_empty() {
        for mapping in &rename_list {
            let src = paths
                .iter()
                .find(|p| {
                    p.file_name()
                        .map(|n| n.to_string_lossy() == mapping.from_name)
                        .unwrap_or(false)
                })
                .ok_or_else(|| {
                    format!(
                        "Source « {} » introuvable dans le dépôt.",
                        mapping.from_name
                    )
                })?;
            let target = dest.join(&mapping.to_name);
            move_path(src, &target, overwrite)?;
        }
    } else {
        for src in &paths {
            let name = src
                .file_name()
                .ok_or_else(|| format!("Nom invalide : {}", src.display()))?;
            let target = dest.join(name);
            move_path(src, &target, overwrite)?;
        }
    }

    let size_bytes = measure_path_size(&dest)?;
    Ok(LocalArchiveMoveResult {
        path: dest.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_move(
    _sources: Vec<String>,
    _destination: String,
    _renames: Option<Vec<LocalArchiveRenameMapping>>,
    _on_existing: Option<String>,
) -> Result<LocalArchiveMoveResult, String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}

/// Ouvre un dossier (ou le parent d'un fichier) dans l'explorateur.
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_open(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Chemin vide.".into());
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() {
        return Err(format!("Chemin introuvable : {trimmed}"));
    }
    let open_target = if p.is_dir() {
        p
    } else {
        p.parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or(p)
    };

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(open_target.as_os_str())
            .spawn()
            .map_err(|err| format!("Ouverture Explorateur impossible : {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(open_target.as_os_str())
            .spawn()
            .map_err(|err| format!("Ouverture Finder impossible : {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(open_target.as_os_str())
            .spawn()
            .map_err(|err| format!("Ouverture du dossier impossible : {err}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Plateforme non supportée.".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_open(_path: String) -> Result<(), String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}

/// Indique si un chemin existe encore sur le disque.
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_path_exists(path: String) -> Result<bool, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }
    Ok(Path::new(trimmed).exists())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_path_exists(_path: String) -> Result<bool, String> {
    Ok(false)
}

/// Mesure la taille d'un chemin (fichier ou dossier).
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_measure_size(path: String) -> Result<u64, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Chemin vide.".into());
    }
    let p = PathBuf::from(trimmed);
    if !p.exists() {
        return Err(format!("Chemin introuvable : {trimmed}"));
    }
    measure_path_size(&p)
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_measure_size(_path: String) -> Result<u64, String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}

/// Déplace un dossier/fichier d'archive déjà rangé vers un nouvel emplacement.
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_relocate(
    source: String,
    destination: String,
) -> Result<LocalArchiveMoveResult, String> {
    let src = PathBuf::from(source.trim());
    let dest = PathBuf::from(destination.trim());
    if src.as_os_str().is_empty() || dest.as_os_str().is_empty() {
        return Err("Chemin source ou destination vide.".into());
    }
    if !src.exists() {
        return Err(format!("Source introuvable : {}", src.display()));
    }
    if src == dest {
        let size_bytes = measure_path_size(&src)?;
        return Ok(LocalArchiveMoveResult {
            path: src.to_string_lossy().to_string(),
            size_bytes,
        });
    }
    move_path(&src, &dest, false)?;
    let size_bytes = measure_path_size(&dest)?;
    Ok(LocalArchiveMoveResult {
        path: dest.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_relocate(
    _source: String,
    _destination: String,
) -> Result<LocalArchiveMoveResult, String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}

/// Ajoute des fichiers/dossiers dans une archive déjà existante (déplacement).
#[tauri::command]
#[cfg(desktop)]
pub fn local_archive_add_files(
    sources: Vec<String>,
    destination: String,
    renames: Option<Vec<LocalArchiveRenameMapping>>,
) -> Result<LocalArchiveMoveResult, String> {
    let dest = PathBuf::from(destination.trim());
    if dest.as_os_str().is_empty() {
        return Err("Destination vide.".into());
    }
    if !dest.is_dir() {
        return Err(format!(
            "Le dossier d'archive n'existe pas : {}",
            dest.display()
        ));
    }

    let paths: Vec<PathBuf> = sources
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect();
    if paths.is_empty() {
        return Err("Aucun fichier à ajouter.".into());
    }
    for p in &paths {
        if !p.exists() {
            return Err(format!("Source introuvable : {}", p.display()));
        }
    }

    let rename_list = renames.unwrap_or_default();
    if !rename_list.is_empty() {
        for mapping in &rename_list {
            let src = paths
                .iter()
                .find(|p| {
                    p.file_name()
                        .map(|n| n.to_string_lossy() == mapping.from_name)
                        .unwrap_or(false)
                })
                .ok_or_else(|| {
                    format!(
                        "Source « {} » introuvable dans le dépôt.",
                        mapping.from_name
                    )
                })?;
            let target = dest.join(&mapping.to_name);
            if target.exists() {
                return Err(format!(
                    "Le fichier existe déjà dans l'archive : {}",
                    mapping.to_name
                ));
            }
            move_path(src, &target, false)?;
        }
    } else {
        for src in &paths {
            let name = src
                .file_name()
                .ok_or_else(|| format!("Nom invalide : {}", src.display()))?;
            let target = dest.join(name);
            if target.exists() {
                return Err(format!(
                    "Le fichier existe déjà dans l'archive : {}",
                    name.to_string_lossy()
                ));
            }
            move_path(src, &target, false)?;
        }
    }

    let size_bytes = measure_path_size(&dest)?;
    Ok(LocalArchiveMoveResult {
        path: dest.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn local_archive_add_files(
    _sources: Vec<String>,
    _destination: String,
    _renames: Option<Vec<LocalArchiveRenameMapping>>,
) -> Result<LocalArchiveMoveResult, String> {
    Err("Archives locales disponibles uniquement sur desktop.".into())
}
