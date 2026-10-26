use crate::{
    hashing::validate_scanned_file,
    models::{MoveResult, ScannedFileRef},
};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
};

/// Moves the selected copies into `destination`, keeping their folders below
/// the common parent. Any failure rolls back files already moved.
#[tauri::command]
pub fn move_duplicate_files(
    files: Vec<ScannedFileRef>,
    destination: String,
    scanned_folders: Vec<String>,
) -> Result<Vec<MoveResult>, String> {
    let destination_dir = Path::new(&destination);
    ensure_destination_outside_scan(destination_dir, &destination, &scanned_folders)?;

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
            let rollback_errors = roll_back_moves(&moved);
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

/// Rejects destinations that would be picked up by the next scan.
fn ensure_destination_outside_scan(
    destination_dir: &Path,
    destination: &str,
    scanned_folders: &[String],
) -> Result<(), String> {
    if !destination_dir.is_dir() {
        return Err(format!("Not a destination directory: {destination}"));
    }
    let resolved_destination = fs::canonicalize(destination_dir)
        .map_err(|error| format!("Could not resolve destination folder: {error}"))?;
    for folder in scanned_folders {
        let searched_folder = Path::new(folder);
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
    Ok(())
}

fn roll_back_moves(moved: &[(PathBuf, PathBuf, String)]) -> Vec<String> {
    moved
        .iter()
        .rev()
        .filter_map(|(source, target, hash)| {
            move_file_without_overwrite(target, source, hash)
                .err()
                .map(|error| format!("{} ({error})", target.display()))
        })
        .collect()
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

/// Verifies the new copy, then removes the source if it is still unchanged.
fn finish_move(source: &Path, target: &Path, expected_hash: &str) -> Result<(), String> {
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

fn move_file_without_overwrite(
    source: &Path,
    target: &Path,
    expected_hash: &str,
) -> Result<(), String> {
    validate_scanned_file(source, expected_hash)?;

    match fs::hard_link(source, target) {
        Ok(()) => finish_move(source, target, expected_hash),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => Err(format!(
            "A file already exists at the destination: {}",
            target.display()
        )),
        // Hard links fail across volumes, so fall back to copying.
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
    finish_move(source, target, expected_hash)
}

#[cfg(test)]
mod tests {
    use super::move_duplicate_files;
    use crate::{hashing::duplicate_hash, models::ScannedFileRef, test_support::temp_root};
    use std::{fs, path::Path};

    fn file_ref(path: &Path, expected_hash: String) -> ScannedFileRef {
        ScannedFileRef {
            path: path.to_string_lossy().to_string(),
            expected_hash,
        }
    }

    #[test]
    fn move_duplicate_files_preserves_only_paths_below_common_parent() {
        let root = temp_root("move");
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
                file_ref(&first_source, duplicate_hash(&first_source).unwrap()),
                file_ref(&second_source, duplicate_hash(&second_source).unwrap()),
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
    fn move_duplicate_files_rejects_changed_source_without_moving_it() {
        let root = temp_root("move-stale");
        let source = root.join("source/group/file.txt");
        let destination = root.join("destination");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(&source, "original duplicate").unwrap();
        let expected_hash = duplicate_hash(&source).unwrap();
        fs::write(&source, "replacement original").unwrap();

        let Err(error) = move_duplicate_files(
            vec![file_ref(&source, expected_hash)],
            destination.to_string_lossy().to_string(),
            Vec::new(),
        ) else {
            panic!("changed source unexpectedly moved");
        };

        assert!(error.contains("contents changed"));
        assert_eq!(fs::read(&source).unwrap(), b"replacement original");
        assert!(!destination.join("group/file.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_duplicate_files_does_not_overwrite_existing_destination() {
        let root = temp_root("move-conflict");
        let source = root.join("source/group/file.txt");
        let destination = root.join("destination");
        let target = destination.join("file.txt");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, "scanned duplicate").unwrap();
        fs::write(&target, "existing original").unwrap();
        let expected_hash = duplicate_hash(&source).unwrap();

        let Err(error) = move_duplicate_files(
            vec![file_ref(&source, expected_hash)],
            destination.to_string_lossy().to_string(),
            Vec::new(),
        ) else {
            panic!("existing destination was unexpectedly overwritten");
        };

        assert!(error.contains("already exists"));
        assert_eq!(fs::read(&source).unwrap(), b"scanned duplicate");
        assert_eq!(fs::read(&target).unwrap(), b"existing original");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn move_duplicate_files_rejects_destinations_inside_searched_folders() {
        let root = temp_root("move-guard");
        let searched_folder = root.join("searched");
        let destination = searched_folder.join("destination");
        fs::create_dir_all(&destination).unwrap();

        let Err(error) = move_duplicate_files(
            Vec::new(),
            destination.to_string_lossy().to_string(),
            vec![searched_folder.to_string_lossy().to_string()],
        ) else {
            panic!("destination inside a searched folder was accepted");
        };

        assert!(error.contains("cannot be inside a folder searched"));
        fs::remove_dir_all(root).unwrap();
    }
}
