use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize)]
pub struct DuplicateFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    #[serde(rename = "contentHash")]
    pub content_hash: String,
}

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub files: Vec<DuplicateFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub total_files: usize,
    pub total_size: u64,
    pub folder_file_counts: HashMap<String, usize>,
}

/// A file from a previous scan; its hash is re-checked before any change is made.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFileRef {
    pub path: String,
    pub expected_hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteGroup {
    pub files: Vec<ScannedFileRef>,
    pub kept_file: ScannedFileRef,
    #[serde(default)]
    pub delete_all: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveResult {
    pub source: String,
    pub destination: String,
}
