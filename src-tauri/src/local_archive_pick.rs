//! Sélection de sources d'archive (fichiers), avec copie Shell pour MTP (tablette).

use tauri::{AppHandle, Runtime, WebviewWindow};

/// Ouvre un sélecteur multi-fichiers.
/// Sous Windows, les éléments MTP (tablette) sont copiés vers un staging local.
/// Les chemins disque classiques sont renvoyés tels quels.
#[tauri::command]
#[cfg(desktop)]
pub async fn local_archive_pick_sources<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        return windows_impl::pick_sources_windows(app, window).await;
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        fallback_impl::pick_sources_fallback(app).await
    }
}

#[tauri::command]
#[cfg(not(desktop))]
pub async fn local_archive_pick_sources<R: Runtime>(
    _app: AppHandle<R>,
    _window: WebviewWindow<R>,
) -> Result<Vec<String>, String> {
    Err("Sélection d'archive disponible uniquement sur desktop.".into())
}

#[cfg(all(desktop, not(windows)))]
mod fallback_impl {
    use tauri::{AppHandle, Runtime};
    use tauri_plugin_dialog::DialogExt;

    pub async fn pick_sources_fallback<R: Runtime>(
        app: AppHandle<R>,
    ) -> Result<Vec<String>, String> {
        let files = app
            .dialog()
            .file()
            .set_title("Choisir des fichiers d'archive")
            .blocking_pick_files();

        Ok(files
            .unwrap_or_default()
            .into_iter()
            .filter_map(|path| path.into_path().ok())
            .map(|path| path.to_string_lossy().to_string())
            .collect())
    }
}

#[cfg(all(desktop, windows))]
mod windows_impl {
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::{AppHandle, Runtime, WebviewWindow};

    const STAGE_DIR_NAME: &str = "mangatheque-archive-import";

    pub async fn pick_sources_windows<R: Runtime>(
        app: AppHandle<R>,
        window: WebviewWindow<R>,
    ) -> Result<Vec<String>, String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<String>, String>>();

        let hwnd_raw = window
            .hwnd()
            .map_err(|err| format!("HWND fenêtre indisponible : {err}"))?
            .0 as isize;

        app.run_on_main_thread(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                pick_sources_windows_ui(hwnd_raw)
            }))
            .unwrap_or_else(|_| Err("Échec interne du sélecteur Windows.".into()));
            let _ = tx.send(result);
        })
        .map_err(|err| format!("Impossible d'ouvrir le sélecteur : {err}"))?;

        rx.recv()
            .map_err(|_| "Sélection interrompue.".to_string())?
    }

    fn pick_sources_windows_ui(hwnd_raw: isize) -> Result<Vec<String>, String> {
        use windows::core::HSTRING;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, IShellItem, IShellItemArray, FOS_ALLOWMULTISELECT,
            FOS_FILEMUSTEXIST,
        };

        let com_owned = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok();

        let result = (|| {
            let dialog: IFileOpenDialog =
                unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_ALL) }
                    .map_err(|err| format!("Création du sélecteur impossible : {err}"))?;

            // Pas de FOS_FORCEFILESYSTEM : indispensable pour voir la tablette (MTP).
            let options = unsafe { dialog.GetOptions() }
                .map_err(|err| format!("Options sélecteur illisibles : {err}"))?;
            unsafe {
                dialog.SetOptions(options | FOS_ALLOWMULTISELECT | FOS_FILEMUSTEXIST)
            }
            .map_err(|err| format!("Configuration sélecteur impossible : {err}"))?;

            unsafe {
                dialog.SetTitle(&HSTRING::from(
                    "Choisir des fichiers d'archive (PC ou tablette)",
                ))
            }
            .ok();

            // Toujours démarrer sur « Ce PC » (évite un dernier dossier MTP / introuvable).
            if let Ok(computer) = unsafe {
                windows::Win32::UI::Shell::SHGetKnownFolderItem::<
                    windows::Win32::UI::Shell::IShellItem,
                >(
                    &windows::Win32::UI::Shell::FOLDERID_ComputerFolder,
                    windows::Win32::UI::Shell::KF_FLAG_DEFAULT,
                    None,
                )
            } {
                unsafe { dialog.SetFolder(&computer) }.ok();
            }

            let owner = HWND(hwnd_raw as *mut std::ffi::c_void);
            let show = unsafe { dialog.Show(Some(owner)) };
            if show.is_err() {
                return Ok(Vec::new());
            }

            let results: IShellItemArray = unsafe { dialog.GetResults() }
                .map_err(|err| format!("Lecture de la sélection impossible : {err}"))?;
            let count = unsafe { results.GetCount() }
                .map_err(|err| format!("Comptage sélection impossible : {err}"))?;

            if count == 0 {
                return Ok(Vec::new());
            }

            let mut paths = Vec::with_capacity(count as usize);
            let mut staging: Option<PathBuf> = None;

            for index in 0..count {
                let item: IShellItem = unsafe { results.GetItemAt(index) }
                    .map_err(|err| format!("Élément #{index} illisible : {err}"))?;

                if let Some(fs_path) = shell_item_filesystem_path(&item) {
                    paths.push(fs_path);
                    continue;
                }

                let stage_dir = match &staging {
                    Some(dir) => dir.clone(),
                    None => {
                        let dir = create_staging_dir()?;
                        staging = Some(dir.clone());
                        dir
                    }
                };

                let copied = shell_copy_item_to_dir(&item, &stage_dir)?;
                paths.push(copied);
            }

            Ok(paths)
        })();

        if com_owned {
            unsafe { CoUninitialize() };
        }

        result
    }

    fn shell_item_filesystem_path(
        item: &windows::Win32::UI::Shell::IShellItem,
    ) -> Option<String> {
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::SIGDN_FILESYSPATH;

        let pwstr = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.ok()?;
        let path = unsafe { pwstr.to_string() }.ok()?;
        unsafe { CoTaskMemFree(Some(pwstr.0 as _)) };
        if path.is_empty() || !PathBuf::from(&path).exists() {
            return None;
        }
        Some(path)
    }

    fn shell_item_display_name(
        item: &windows::Win32::UI::Shell::IShellItem,
    ) -> Result<String, String> {
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::SIGDN_NORMALDISPLAY;

        let pwstr = unsafe { item.GetDisplayName(SIGDN_NORMALDISPLAY) }
            .map_err(|err| format!("Nom d'élément illisible : {err}"))?;
        let name = unsafe { pwstr.to_string() }
            .map_err(|err| format!("Nom d'élément invalide : {err}"))?;
        unsafe { CoTaskMemFree(Some(pwstr.0 as _)) };
        if name.is_empty() {
            return Err("Nom d'élément vide.".into());
        }
        Ok(name)
    }

    fn create_staging_dir() -> Result<PathBuf, String> {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let dir = std::env::temp_dir()
            .join(STAGE_DIR_NAME)
            .join(format!("{millis}"));
        std::fs::create_dir_all(&dir).map_err(|err| {
            format!(
                "Création du dossier temporaire impossible ({}) : {err}",
                dir.display()
            )
        })?;
        Ok(dir)
    }

    fn shell_copy_item_to_dir(
        item: &windows::Win32::UI::Shell::IShellItem,
        dest_dir: &Path,
    ) -> Result<String, String> {
        use windows::core::HSTRING;
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
        use windows::Win32::UI::Shell::{
            FileOperation, IFileOperation, FOF_NOCONFIRMMKDIR, FOF_NOCONFIRMATION, FOF_NOERRORUI,
            FOF_SILENT, SHCreateItemFromParsingName,
        };

        let display_name = shell_item_display_name(item)?;
        let dest_path = dest_dir.join(&display_name);

        let dest_item = unsafe {
            SHCreateItemFromParsingName::<_, Option<_>, windows::Win32::UI::Shell::IShellItem>(
                &HSTRING::from(dest_dir.as_os_str()),
                None,
            )
        }
        .map_err(|err| {
            format!(
                "Dossier temporaire inaccessible ({}) : {err}",
                dest_dir.display()
            )
        })?;

        let op: IFileOperation =
            unsafe { CoCreateInstance(&FileOperation, None, CLSCTX_ALL) }
                .map_err(|err| format!("Initialisation copie Shell impossible : {err}"))?;

        unsafe {
            op.SetOperationFlags(
                FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT | FOF_NOCONFIRMMKDIR,
            )
        }
        .map_err(|err| format!("Flags copie Shell impossibles : {err}"))?;

        unsafe { op.CopyItem(item, &dest_item, None, None) }.map_err(|err| {
            format!("Copie depuis la tablette impossible (« {display_name} ») : {err}")
        })?;

        unsafe { op.PerformOperations() }.map_err(|err| {
            format!("Exécution de la copie impossible (« {display_name} ») : {err}")
        })?;

        if !dest_path.exists() {
            return Err(format!(
                "Copie terminée mais fichier introuvable : {}",
                dest_path.display()
            ));
        }

        Ok(dest_path.to_string_lossy().to_string())
    }
}
