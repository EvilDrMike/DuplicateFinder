use std::{fs, io, path::PathBuf};
use tauri::Manager;

const MAX_SETTINGS_BYTES: usize = 64 * 1024;

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = settings_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).ok()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    if !settings.is_object() {
        return Err("Settings must be a JSON object.".into());
    }
    let contents = serde_json::to_vec_pretty(&settings).map_err(|error| error.to_string())?;
    if contents.len() > MAX_SETTINGS_BYTES {
        return Err("Settings are too large to save.".into());
    }
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    // Write then rename so a crash mid-write can't corrupt the existing file.
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, contents).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, &path).map_err(|error| error.to_string())
}
