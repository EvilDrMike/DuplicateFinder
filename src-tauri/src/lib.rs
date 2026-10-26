mod delete;
mod hashing;
mod models;
mod move_files;
mod scan;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan::scan_directory,
            delete::delete_duplicate_files,
            move_files::move_duplicate_files,
            settings::load_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod test_support {
    use std::{
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    /// A unique, not-yet-created folder under the system temp directory.
    pub fn temp_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "duplicate-finder-{label}-{}-{unique}",
            std::process::id()
        ))
    }
}
