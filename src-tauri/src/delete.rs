use crate::{hashing::validate_scanned_file, models::DeleteGroup};
use std::{collections::HashSet, fs, path::Path};

/// Deletes the selected copies after verifying every file still matches the scan.
#[tauri::command]
pub fn delete_duplicate_files(groups: Vec<DeleteGroup>) -> Result<usize, String> {
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
            fs::remove_file(&file.path)
                .map_err(|error| format!("Could not delete {}: {error}", file.path))?;
            deleted_count += 1;
        }
    }
    Ok(deleted_count)
}

#[cfg(test)]
mod tests {
    use super::delete_duplicate_files;
    use crate::{
        hashing::duplicate_hash,
        models::{DeleteGroup, ScannedFileRef},
        test_support::temp_root,
    };
    use std::{fs, path::Path};

    fn file_ref(path: &Path, expected_hash: &str) -> ScannedFileRef {
        ScannedFileRef {
            path: path.to_string_lossy().to_string(),
            expected_hash: expected_hash.to_string(),
        }
    }

    fn keeper_and_duplicate(label: &str) -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf, String) {
        let root = temp_root(label);
        let keeper = root.join("keeper.txt");
        let duplicate = root.join("duplicate.txt");
        fs::create_dir_all(&root).unwrap();
        fs::write(&keeper, "identical content").unwrap();
        fs::write(&duplicate, "identical content").unwrap();
        let expected_hash = duplicate_hash(&keeper).unwrap();
        (root, keeper, duplicate, expected_hash)
    }

    fn delete_group(keeper: &Path, duplicate: &Path, hash: &str, delete_all: bool) -> DeleteGroup {
        DeleteGroup {
            files: vec![file_ref(keeper, hash), file_ref(duplicate, hash)],
            kept_file: file_ref(keeper, hash),
            delete_all,
        }
    }

    #[test]
    fn delete_duplicate_files_keeps_the_kept_file() {
        let (root, keeper, duplicate, hash) = keeper_and_duplicate("delete-keep");

        let deleted = delete_duplicate_files(vec![delete_group(&keeper, &duplicate, &hash, false)]).unwrap();

        assert_eq!(deleted, 1);
        assert!(keeper.exists());
        assert!(!duplicate.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_duplicate_files_removes_every_copy_when_delete_all() {
        let (root, keeper, duplicate, hash) = keeper_and_duplicate("delete-all");

        let deleted = delete_duplicate_files(vec![delete_group(&keeper, &duplicate, &hash, true)]).unwrap();

        assert_eq!(deleted, 2);
        assert!(!keeper.exists());
        assert!(!duplicate.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_duplicate_files_rejects_missing_or_changed_scan_paths() {
        let (root, keeper, duplicate, hash) = keeper_and_duplicate("delete-stale");
        fs::write(&duplicate, "replacement original").unwrap();

        let error = delete_duplicate_files(vec![delete_group(&keeper, &duplicate, &hash, false)]).unwrap_err();

        assert!(error.contains("contents changed"));
        assert_eq!(fs::read(&keeper).unwrap(), b"identical content");
        assert_eq!(fs::read(&duplicate).unwrap(), b"replacement original");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_duplicate_files_aborts_when_a_scanned_file_was_removed() {
        let (root, keeper, duplicate, hash) = keeper_and_duplicate("delete-missing");
        fs::remove_file(&duplicate).unwrap();

        let error = delete_duplicate_files(vec![delete_group(&keeper, &duplicate, &hash, false)]).unwrap_err();

        assert!(error.contains("Missing file"));
        assert_eq!(fs::read(&keeper).unwrap(), b"identical content");
        fs::remove_dir_all(root).unwrap();
    }
}
