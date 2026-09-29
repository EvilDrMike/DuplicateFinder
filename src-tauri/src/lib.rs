use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, File},
    hash::{Hash, Hasher},
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
struct DuplicateFile {
    path: String,
    name: String,
    size: u64,
}

#[derive(Serialize)]
struct DuplicateGroup {
    hash: String,
    files: Vec<DuplicateFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    groups: Vec<DuplicateGroup>,
    total_files: usize,
    total_size: u64,
}

#[derive(Deserialize)]
struct DeleteGroup {
    files: Vec<String>,
    #[serde(rename = "keptFile")]
    kept_file: String,
    #[serde(rename = "deleteAll", default)]
    delete_all: bool,
}

#[tauri::command]
fn scan_directory(paths: Vec<String>, extensions: Vec<String>) -> Result<ScanResult, String> {
    let extensions: Vec<String> = extensions
        .into_iter()
        .map(|extension| extension.trim_start_matches('.').to_ascii_lowercase())
        .filter(|extension| !extension.is_empty())
        .collect();
    let mut files_by_size: HashMap<u64, Vec<DuplicateFile>> = HashMap::new();
    for path in paths {
        let root = Path::new(&path);
        if !root.is_dir() {
            return Err(format!("Not a directory: {path}"));
        }
        collect_files(root, &extensions, &mut files_by_size);
    }

    let total_files = files_by_size.values().map(Vec::len).sum();
    let total_size = files_by_size
        .iter()
        .map(|(size, files)| *size * files.len() as u64)
        .sum();
    let mut duplicate_groups = Vec::new();
    for (size, files) in files_by_size {
        if files.len() < 2 {
            continue;
        }

        let mut files_by_hash: HashMap<u64, Vec<DuplicateFile>> = HashMap::new();
        for file in files {
            let path = PathBuf::from(&file.path);
            if let Some(hash) = hash_file(&path) {
                files_by_hash.entry(hash).or_default().push(file);
            }
        }

        duplicate_groups.extend(
            files_by_hash
                .into_iter()
                .filter(|(_, files)| files.len() > 1)
                .map(|(hash, files)| DuplicateGroup {
                    hash: format!("{size:x}-{hash:x}"),
                    files,
                }),
        );
    }

    Ok(ScanResult {
        groups: duplicate_groups,
        total_files,
        total_size,
    })
}

#[tauri::command]
fn delete_duplicate_files(groups: Vec<DeleteGroup>) -> Result<usize, String> {
    let missing_files: Vec<String> = groups
        .iter()
        .flat_map(|group| group.files.iter())
        .filter(|path| !Path::new(path).is_file())
        .cloned()
        .collect();
    let missing_kept_files: Vec<String> = groups
        .iter()
        .filter(|group| !Path::new(&group.kept_file).is_file())
        .map(|group| group.kept_file.clone())
        .collect();
    if !missing_files.is_empty() || !missing_kept_files.is_empty() {
        let mut all_missing_files = missing_files;
        all_missing_files.extend(missing_kept_files);
        return Err(format!(
            "Scan is out of date. Missing file(s): {}.",
            all_missing_files.join(", ")
        ));
    }

    let mut deleted_count = 0;
    for group in groups {
        for path in group.files {
            if !group.delete_all && path == group.kept_file {
                continue;
            }
            std::fs::remove_file(&path)
                .map_err(|error| format!("Could not delete {path}: {error}"))?;
            deleted_count += 1;
        }
    }
    Ok(deleted_count)
}

fn collect_files(
    directory: &Path,
    extensions: &[String],
    files_by_size: &mut HashMap<u64, Vec<DuplicateFile>>,
) {
    let Ok(entries) = fs::read_dir(directory) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, extensions, files_by_size);
            continue;
        }
        if !extensions.is_empty()
            && !path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extensions.iter().any(|allowed| allowed == &extension.to_ascii_lowercase()))
                .unwrap_or(false)
        {
            continue;
        }
        let Ok(metadata) = entry.metadata() else { continue };
        files_by_size.entry(metadata.len()).or_default().push(DuplicateFile {
            name: path.file_name().and_then(|name| name.to_str()).unwrap_or("unknown").to_string(),
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
        });
    }
}

fn hash_file(path: &Path) -> Option<u64> {
    let mut file = File::open(path).ok()?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let bytes_read = file.read(&mut buffer).ok()?;
        if bytes_read == 0 {
            break;
        }
        buffer[..bytes_read].hash(&mut hasher);
    }
    Some(hasher.finish())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! This is DuplicateFinder running from Rust.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_directory,
            delete_duplicate_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
