use std::{
    fs::{self, File},
    hash::{Hash, Hasher},
    io::Read,
    path::Path,
};

pub fn hash_file(path: &Path) -> Option<u64> {
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

/// Formats the size-and-content hash used to identify scanned files.
pub fn content_hash(size: u64, hash: u64) -> String {
    format!("{size:x}-{hash:x}")
}

pub fn duplicate_hash(path: &Path) -> Option<String> {
    let size = fs::metadata(path).ok()?.len();
    let hash = hash_file(path)?;
    Some(content_hash(size, hash))
}

/// Fails if the file is missing or no longer matches the scanned hash.
pub fn validate_scanned_file(path: &Path, expected_hash: &str) -> Result<(), String> {
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
