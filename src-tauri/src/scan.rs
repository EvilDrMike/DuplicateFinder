use crate::{
    hashing::{content_hash, hash_file},
    models::{DuplicateFile, DuplicateGroup, ScanResult},
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

#[tauri::command]
pub fn scan_directory(
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
    let mut folder_file_counts = HashMap::new();
    for path in paths {
        let root = Path::new(&path);
        if !root.is_dir() {
            return Err(format!("Not a directory: {path}"));
        }
        collect_files(
            root,
            &extensions,
            &mut files_by_size,
            &mut folder_file_counts,
        );
    }

    let total_files = files_by_size.values().map(Vec::len).sum();
    let total_size = files_by_size
        .iter()
        .map(|(size, files)| *size * files.len() as u64)
        .sum();
    let groups = if match_by_filename {
        group_by_filename(files_by_size)
    } else {
        group_by_content(files_by_size)
    };

    Ok(ScanResult {
        groups,
        total_files,
        total_size,
        folder_file_counts,
    })
}

fn group_by_filename(files_by_size: HashMap<u64, Vec<DuplicateFile>>) -> Vec<DuplicateGroup> {
    let mut files_by_name: HashMap<String, Vec<DuplicateFile>> = HashMap::new();
    for file in files_by_size.into_values().flatten() {
        files_by_name
            .entry(file.name.to_lowercase())
            .or_default()
            .push(file);
    }

    let mut groups = Vec::new();
    for (name, files) in files_by_name {
        if files.len() < 2 {
            continue;
        }
        let matching_files: Vec<DuplicateFile> = files
            .into_iter()
            .filter_map(|mut file| {
                let hash = hash_file(&PathBuf::from(&file.path))?;
                file.content_hash = content_hash(file.size, hash);
                Some(file)
            })
            .collect();
        if matching_files.len() > 1 {
            groups.push(DuplicateGroup {
                hash: format!("name:{name}"),
                files: matching_files,
            });
        }
    }
    groups
}

fn group_by_content(files_by_size: HashMap<u64, Vec<DuplicateFile>>) -> Vec<DuplicateGroup> {
    let mut groups = Vec::new();
    for (size, files) in files_by_size {
        // A file with a unique size cannot have a duplicate, so skip hashing it.
        if files.len() < 2 {
            continue;
        }
        let mut files_by_hash: HashMap<u64, Vec<DuplicateFile>> = HashMap::new();
        for mut file in files {
            if let Some(hash) = hash_file(&PathBuf::from(&file.path)) {
                file.content_hash = content_hash(size, hash);
                files_by_hash.entry(hash).or_default().push(file);
            }
        }
        groups.extend(
            files_by_hash
                .into_iter()
                .filter(|(_, files)| files.len() > 1)
                .map(|(hash, files)| DuplicateGroup {
                    hash: content_hash(size, hash),
                    files,
                }),
        );
    }
    groups
}

fn has_allowed_extension(path: &Path, extensions: &[String]) -> bool {
    extensions.is_empty()
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| {
                let extension = extension.to_ascii_lowercase();
                extensions.iter().any(|allowed| allowed == &extension)
            })
            .unwrap_or(false)
}

fn collect_files(
    directory: &Path,
    extensions: &[String],
    files_by_size: &mut HashMap<u64, Vec<DuplicateFile>>,
    folder_file_counts: &mut HashMap<String, usize>,
) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, extensions, files_by_size, folder_file_counts);
            continue;
        }
        if !has_allowed_extension(&path, extensions) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if let Some(parent) = path.parent() {
            *folder_file_counts
                .entry(parent.to_string_lossy().to_string())
                .or_default() += 1;
        }
        files_by_size
            .entry(metadata.len())
            .or_default()
            .push(DuplicateFile {
                name: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
                content_hash: String::new(),
            });
    }
}

#[cfg(test)]
mod tests {
    use super::scan_directory;
    use crate::test_support::temp_root;
    use std::fs;

    #[test]
    fn scan_matches_same_filename_with_different_content_and_size() {
        let root = temp_root("match-name");
        let first_file = root.join("first/Report.txt");
        let second_file = root.join("second/report.TXT");
        fs::create_dir_all(first_file.parent().unwrap()).unwrap();
        fs::create_dir_all(second_file.parent().unwrap()).unwrap();
        fs::write(&first_file, "one").unwrap();
        fs::write(&second_file, "different content and size").unwrap();

        let root_path = root.to_string_lossy().to_string();
        let content_scan = scan_directory(vec![root_path.clone()], Vec::new(), false).unwrap();
        let filename_scan = scan_directory(vec![root_path], Vec::new(), true).unwrap();

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
    fn scan_groups_identical_content_and_respects_extension_filter() {
        let root = temp_root("match-content");
        fs::create_dir_all(root.join("a")).unwrap();
        fs::create_dir_all(root.join("b")).unwrap();
        fs::write(root.join("a/photo.jpg"), "same bytes").unwrap();
        fs::write(root.join("b/copy.JPG"), "same bytes").unwrap();
        fs::write(root.join("b/single.jpg"), "unique bytes here").unwrap();
        fs::write(root.join("b/notes.txt"), "same bytes").unwrap();

        let result = scan_directory(
            vec![root.to_string_lossy().to_string()],
            vec![".jpg".to_string()],
            false,
        )
        .unwrap();

        assert_eq!(result.total_files, 3);
        assert_eq!(
            result
                .folder_file_counts
                .get(&root.join("a").to_string_lossy().to_string()),
            Some(&1)
        );
        assert_eq!(
            result
                .folder_file_counts
                .get(&root.join("b").to_string_lossy().to_string()),
            Some(&2)
        );
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].files.len(), 2);
        fs::remove_dir_all(root).unwrap();
    }
}
