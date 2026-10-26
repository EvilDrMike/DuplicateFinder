use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    hash::{Hash, Hasher},
    io::{self, Read},
    path::{Path, PathBuf},
};

#[derive(Serialize)]
struct DuplicateFile {
    path: String,
    name: String,
    size: u64,
    #[serde(rename = "contentHash")]
    content_hash: String,
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
#[serde(rename_all = "camelCase")]
struct DeleteFile {
    path: String,
    expected_hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteGroup {
    files: Vec<DeleteFile>,
    kept_file: DeleteFile,
    #[serde(default)]
    delete_all: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveFile {
    path: String,
    expected_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveResult {
    source: String,
    destination: String,
}

#[tauri::command]
fn scan_directory(
    paths: Vec<String>,
    extensions: Vec<String>,
    match_by_filename: bool,
) -> Result<ScanResult, String> {
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
    if match_by_filename {
        let mut files_by_name: HashMap<String, Vec<DuplicateFile>> = HashMap::new();
        for files in files_by_size.into_values() {
            for file in files {
                files_by_name
                    .entry(file.name.to_lowercase())
                    .or_default()
                    .push(file);
            }
        }
        for (name, files) in files_by_name {
            if files.len() < 2 {
                continue;
            }
            let mut matching_files = Vec::new();
            for mut file in files {
                let path = PathBuf::from(&file.path);
                if let Some(hash) = hash_file(&path) {
                    file.content_hash = format!("{:x}-{hash:x}", file.size);
                    matching_files.push(file);
                }
            }
            if matching_files.len() > 1 {
                duplicate_groups.push(DuplicateGroup {
                    hash: format!("name:{name}"),
                    files: matching_files,
                });
            }
        }
    } else {
        for (size, files) in files_by_size {
            if files.len() < 2 {
                continue;
            }

            let mut files_by_hash: HashMap<u64, Vec<DuplicateFile>> = HashMap::new();
            for mut file in files {
                let path = PathBuf::from(&file.path);
                if let Some(hash) = hash_file(&path) {
                    file.content_hash = format!("{size:x}-{hash:x}");
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
    }

    Ok(ScanResult {
        groups: duplicate_groups,
        total_files,
        total_size,
    })
}

#[tauri::command]
fn move_duplicate_files(
    files: Vec<MoveFile>,
    destination: String,
    scanned_folders: Vec<String>,
) -> Result<Vec<MoveResult>, String> {
    let destination_dir = Path::new(&destination);
    if !destination_dir.is_dir() {
        return Err(format!("Not a destination directory: {destination}"));
    }
    let resolved_destination = fs::canonicalize(destination_dir)
        .map_err(|error| format!("Could not resolve destination folder: {error}"))?;
    for folder in scanned_folders {
        let searched_folder = Path::new(&folder);
        if !searched_folder.is_dir() {
            return Err(format!(
                "Searched folder is no longer available: {}. Rescan before moving files.",
                searched_folder.display()
            ));
        }
        let resolved_searched_folder = fs::canonicalize(searched_folder)
            .map_err(|error| format!("Could not resolve searched folder: {error}"))?;
        if resolved_destination.starts_with(&resolved_searched_folder) {
            return Err(format!(
                "Move destination cannot be inside a folder searched for duplicates: {}",
                searched_folder.display()
            ));
        }
    }

    let mut sources = HashSet::new();
    let mut pending_sources = Vec::new();
    for file in files {
        let source = PathBuf::from(file.path);
        validate_scanned_file(&source, &file.expected_hash)?;
        let resolved_source = fs::canonicalize(&source)
            .map_err(|error| format!("Could not resolve {}: {error}", source.display()))?;
        if !sources.insert(resolved_source.clone()) {
            return Err(format!(
                "File was selected more than once: {}",
                source.display()
            ));
        }
        pending_sources.push((source, resolved_source, file.expected_hash));
    }

    let resolved_sources: Vec<PathBuf> = pending_sources
        .iter()
        .map(|(_, resolved_source, _)| resolved_source.clone())
        .collect();
    let common_parent = common_parent(&resolved_sources)?;
    let mut targets = HashSet::new();
    let mut pending = Vec::with_capacity(pending_sources.len());
    for (source, resolved_source, expected_hash) in pending_sources {
        let relative_path = resolved_source
            .strip_prefix(&common_parent)
            .map_err(|error| format!("Could not preserve folder structure: {error}"))?;
        let target = destination_dir.join(relative_path);
        if source == target {
            return Err(format!(
                "{} is already in the destination folder.",
                source.display()
            ));
        }
        if !targets.insert(target.clone()) {
            return Err(format!(
                "Multiple selected files would use the same destination: {}",
                target.display()
            ));
        }
        if target.exists() {
            return Err(format!(
                "A file already exists at the destination: {}",
                target.display()
            ));
        }
        pending.push((source, target, expected_hash));
    }

    let mut created_directories = Vec::new();
    for (_, target, _) in &pending {
        if let Some(parent) = target.parent() {
            if let Err(error) = create_missing_directories(parent, &mut created_directories) {
                remove_created_directories(&created_directories);
                return Err(format!(
                    "Could not create destination folder {}: {error}",
                    parent.display()
                ));
            }
        }
    }

    let mut moved: Vec<(PathBuf, PathBuf, String)> = Vec::new();
    for (source, target, expected_hash) in &pending {
        if let Err(error) = move_file_without_overwrite(source, target, expected_hash) {
            let mut rollback_errors = Vec::new();
            for (moved_source, moved_target, moved_hash) in moved.iter().rev() {
                if let Err(rollback_error) =
                    move_file_without_overwrite(moved_target, moved_source, moved_hash)
                {
                    rollback_errors.push(format!("{} ({rollback_error})", moved_target.display()));
                }
            }
            remove_created_directories(&created_directories);
            if rollback_errors.is_empty() {
                return Err(format!(
                    "Could not move {}: {error}. No files remain moved.",
                    source.display()
                ));
            }
            return Err(format!(
                "Could not move {}: {error}. Could not restore: {}.",
                source.display(),
                rollback_errors.join(", ")
            ));
        }
        moved.push((source.clone(), target.clone(), expected_hash.clone()));
    }

    Ok(moved
        .into_iter()
        .map(|(source, destination, _)| MoveResult {
            source: source.to_string_lossy().to_string(),
            destination: destination.to_string_lossy().to_string(),
        })
        .collect())
}

fn common_parent(paths: &[PathBuf]) -> Result<PathBuf, String> {
    let Some(first_path) = paths.first() else {
        return Err("No files were selected to move.".to_string());
    };
    let Some(mut common_parent) = first_path.parent().map(Path::to_path_buf) else {
        return Err("Could not determine the common folder for the selected files.".to_string());
    };

    for path in paths.iter().skip(1) {
        let Some(parent) = path.parent() else {
            return Err("Could not determine the common folder for the selected files.".to_string());
        };
        while !parent.starts_with(&common_parent) {
            if !common_parent.pop() || common_parent.as_os_str().is_empty() {
                return Err(
                    "Selected files do not share a common drive or root folder.".to_string(),
                );
            }
        }
    }

    Ok(common_parent)
}

fn create_missing_directories(
    path: &Path,
    created_directories: &mut Vec<PathBuf>,
) -> io::Result<()> {
    if path.is_dir() {
        return Ok(());
    }
    if path.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "a non-directory path already exists",
        ));
    }
    if let Some(parent) = path.parent() {
        create_missing_directories(parent, created_directories)?;
    }
    match fs::create_dir(path) {
        Ok(()) => created_directories.push(path.to_path_buf()),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists && path.is_dir() => {}
        Err(error) => return Err(error),
    }
    Ok(())
}

fn remove_created_directories(created_directories: &[PathBuf]) {
    for path in created_directories.iter().rev() {
        let _ = fs::remove_dir(path);
    }
}

fn validate_scanned_file(path: &Path, expected_hash: &str) -> Result<(), String> {
    if !path.is_file() {
        return Err(format!(
            "Scan is out of date. Missing file: {}.",
            path.display()
        ));
    }
    if duplicate_hash(path).as_deref() != Some(expected_hash) {
        return Err(format!(
            "Scan is out of date. File contents changed: {}.",
            path.display()
        ));
    }
    Ok(())
}

fn move_file_without_overwrite(
    source: &Path,
    target: &Path,
    expected_hash: &str,
) -> Result<(), String> {
    validate_scanned_file(source, expected_hash)?;

    match fs::hard_link(source, target) {
        Ok(()) => {
            if let Err(error) = validate_scanned_file(target, expected_hash) {
                let _ = fs::remove_file(target);
                return Err(error);
            }
            if validate_scanned_file(source, expected_hash).is_ok() {
                if let Err(error) = fs::remove_file(source) {
                    let _ = fs::remove_file(target);
                    return Err(format!("Could not remove {}: {error}", source.display()));
                }
            }
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Err(format!(
            "A file already exists at the destination: {}",
            target.display()
        )),
        Err(_) => copy_file_without_overwrite(source, target, expected_hash),
    }
}

fn copy_file_without_overwrite(
    source: &Path,
    target: &Path,
    expected_hash: &str,
) -> Result<(), String> {
    let mut target_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                format!("A file already exists at the destination: {}", target.display())
            } else {
                format!("Could not create {}: {error}", target.display())
            }
        })?;
    let copy_result = File::open(source)
        .and_then(|mut source_file| io::copy(&mut source_file, &mut target_file).map(|_| ()))
        .and_then(|()| target_file.sync_all());
    drop(target_file);
    if let Err(error) = copy_result {
        let _ = fs::remove_file(target);
        return Err(format!("Could not copy {}: {error}", source.display()));
    }
    if let Err(error) = validate_scanned_file(target, expected_hash) {
        let _ = fs::remove_file(target);
        return Err(error);
    }
    if validate_scanned_file(source, expected_hash).is_ok() {
        if let Err(error) = fs::remove_file(source) {
            let _ = fs::remove_file(target);
            return Err(format!("Could not remove {}: {error}", source.display()));
        }
    }
    Ok(())
}

#[tauri::command]
fn delete_duplicate_files(groups: Vec<DeleteGroup>) -> Result<usize, String> {
    let mut selected_paths = HashSet::new();
    for group in &groups {
        for file in &group.files {
            if !selected_paths.insert(file.path.clone()) {
                return Err(format!("File was selected more than once: {}", file.path));
            }
            validate_scanned_file(Path::new(&file.path), &file.expected_hash)?;
        }
        validate_scanned_file(
            Path::new(&group.kept_file.path),
            &group.kept_file.expected_hash,
        )?;
    }

    let mut deleted_count = 0;
    for group in groups {
        for file in group.files {
            if !group.delete_all && file.path == group.kept_file.path {
                continue;
            }
            validate_scanned_file(Path::new(&file.path), &file.expected_hash)?;
            std::fs::remove_file(&file.path)
                .map_err(|error| format!("Could not delete {}: {error}", file.path))?;
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
            content_hash: String::new(),
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

fn duplicate_hash(path: &Path) -> Option<String> {
    let size = fs::metadata(path).ok()?.len();
    let hash = hash_file(path)?;
    Some(format!("{size:x}-{hash:x}"))
}

#[cfg(test)]
mod tests {
    use super::{
        delete_duplicate_files, duplicate_hash, move_duplicate_files, scan_directory, DeleteFile,
        DeleteGroup, MoveFile,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn move_duplicate_files_preserves_only_paths_below_common_parent() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-move-{}-{unique}",
            std::process::id()
        ));
        let first_source = root.join("source/common/one/shared.txt");
        let second_source = root.join("source/common/two/shared.txt");
        let destination = root.join("destination");

        fs::create_dir_all(first_source.parent().unwrap()).unwrap();
        fs::create_dir_all(second_source.parent().unwrap()).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(&first_source, "first").unwrap();
        fs::write(&second_source, "second").unwrap();

        let result = move_duplicate_files(
            vec![
                MoveFile {
                    path: first_source.to_string_lossy().to_string(),
                    expected_hash: duplicate_hash(&first_source).unwrap(),
                },
                MoveFile {
                    path: second_source.to_string_lossy().to_string(),
                    expected_hash: duplicate_hash(&second_source).unwrap(),
                },
            ],
            destination.to_string_lossy().to_string(),
            Vec::new(),
        )
        .unwrap();

        assert_eq!(result.len(), 2);
        assert!(!first_source.exists());
        assert!(!second_source.exists());
        assert_eq!(fs::read(destination.join("one/shared.txt")).unwrap(), b"first");
        assert_eq!(fs::read(destination.join("two/shared.txt")).unwrap(), b"second");

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn scan_matches_same_filename_with_different_content_and_size() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-match-name-{}-{unique}",
            std::process::id()
        ));
        let first_file = root.join("first/Report.txt");
        let second_file = root.join("second/report.TXT");
        fs::create_dir_all(first_file.parent().unwrap()).unwrap();
        fs::create_dir_all(second_file.parent().unwrap()).unwrap();
        fs::write(&first_file, "one").unwrap();
        fs::write(&second_file, "different content and size").unwrap();

        let content_scan = scan_directory(
            vec![root.to_string_lossy().to_string()],
            Vec::new(),
            false,
        )
        .unwrap();
        let filename_scan = scan_directory(
            vec![root.to_string_lossy().to_string()],
            Vec::new(),
            true,
        )
        .unwrap();

        assert!(content_scan.groups.is_empty());
        assert_eq!(filename_scan.groups.len(), 1);
        assert_eq!(filename_scan.groups[0].hash, "name:report.txt");
        assert_eq!(filename_scan.groups[0].files.len(), 2);
        assert_ne!(
            filename_scan.groups[0].files[0].content_hash,
            filename_scan.groups[0].files[1].content_hash
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_duplicate_files_rejects_changed_source_without_moving_it() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-move-stale-{}-{unique}",
            std::process::id()
        ));
        let source = root.join("source/group/file.txt");
        let destination = root.join("destination");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(&source, "original duplicate").unwrap();
        let expected_hash = duplicate_hash(&source).unwrap();
        fs::write(&source, "replacement original").unwrap();

        let error = match move_duplicate_files(
            vec![MoveFile {
                path: source.to_string_lossy().to_string(),
                expected_hash,
            }],
            destination.to_string_lossy().to_string(),
            Vec::new(),
        ) {
            Ok(_) => panic!("changed source unexpectedly moved"),
            Err(error) => error,
        };

        assert!(error.contains("contents changed"));
        assert_eq!(fs::read(&source).unwrap(), b"replacement original");
        assert!(!destination.join("group/file.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_duplicate_files_does_not_overwrite_existing_destination() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-move-conflict-{}-{unique}",
            std::process::id()
        ));
        let source = root.join("source/group/file.txt");
        let destination = root.join("destination");
        let target = destination.join("file.txt");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, "scanned duplicate").unwrap();
        fs::write(&target, "existing original").unwrap();
        let expected_hash = duplicate_hash(&source).unwrap();

        let error = match move_duplicate_files(
            vec![MoveFile {
                path: source.to_string_lossy().to_string(),
                expected_hash,
            }],
            destination.to_string_lossy().to_string(),
            Vec::new(),
        ) {
            Ok(_) => panic!("existing destination was unexpectedly overwritten"),
            Err(error) => error,
        };

        assert!(error.contains("already exists"));
        assert_eq!(fs::read(&source).unwrap(), b"scanned duplicate");
        assert_eq!(fs::read(&target).unwrap(), b"existing original");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_duplicate_files_rejects_destinations_inside_searched_folders() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-move-guard-{}-{unique}",
            std::process::id()
        ));
        let searched_folder = root.join("searched");
        let destination = searched_folder.join("destination");
        fs::create_dir_all(&destination).unwrap();

        let error = move_duplicate_files(
            Vec::new(),
            destination.to_string_lossy().to_string(),
            vec![searched_folder.to_string_lossy().to_string()],
        )
        .err()
        .unwrap();

        assert!(error.contains("cannot be inside a folder searched"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_duplicate_files_rejects_missing_or_changed_scan_paths() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-delete-stale-{}-{unique}",
            std::process::id()
        ));
        let keeper = root.join("keeper.txt");
        let duplicate = root.join("duplicate.txt");
        fs::create_dir_all(&root).unwrap();
        fs::write(&keeper, "identical content").unwrap();
        fs::write(&duplicate, "identical content").unwrap();
        let expected_hash = duplicate_hash(&keeper).unwrap();
        fs::write(&duplicate, "replacement original").unwrap();

        let error = delete_duplicate_files(vec![DeleteGroup {
            files: vec![
                DeleteFile {
                    path: keeper.to_string_lossy().to_string(),
                    expected_hash: expected_hash.clone(),
                },
                DeleteFile {
                    path: duplicate.to_string_lossy().to_string(),
                    expected_hash: expected_hash.clone(),
                },
            ],
            kept_file: DeleteFile {
                path: keeper.to_string_lossy().to_string(),
                expected_hash: expected_hash.clone(),
            },
            delete_all: false,
        }])
        .unwrap_err();

        assert!(error.contains("contents changed"));
        assert_eq!(fs::read(&keeper).unwrap(), b"identical content");
        assert_eq!(fs::read(&duplicate).unwrap(), b"replacement original");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_duplicate_files_aborts_when_a_scanned_file_was_removed() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "duplicate-finder-delete-missing-{}-{unique}",
            std::process::id()
        ));
        let keeper = root.join("keeper.txt");
        let duplicate = root.join("duplicate.txt");
        fs::create_dir_all(&root).unwrap();
        fs::write(&keeper, "identical content").unwrap();
        fs::write(&duplicate, "identical content").unwrap();
        let expected_hash = duplicate_hash(&keeper).unwrap();
        fs::remove_file(&duplicate).unwrap();

        let error = delete_duplicate_files(vec![DeleteGroup {
            files: vec![
                DeleteFile {
                    path: keeper.to_string_lossy().to_string(),
                    expected_hash: expected_hash.clone(),
                },
                DeleteFile {
                    path: duplicate.to_string_lossy().to_string(),
                    expected_hash: expected_hash.clone(),
                },
            ],
            kept_file: DeleteFile {
                path: keeper.to_string_lossy().to_string(),
                expected_hash: expected_hash.clone(),
            },
            delete_all: false,
        }])
        .unwrap_err();

        assert!(error.contains("Missing file"));
        assert_eq!(fs::read(&keeper).unwrap(), b"identical content");
        fs::remove_dir_all(root).unwrap();
    }
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
            delete_duplicate_files,
            move_duplicate_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
