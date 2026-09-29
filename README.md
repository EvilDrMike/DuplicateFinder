# DuplicateFinder

DuplicateFinder is a Windows desktop application for finding identical files across multiple folders. Scanning happens locally: files are grouped by size first and then compared by content hash.

## Using the app

1. Open DuplicateFinder.
2. Add folders with **Browse** or type a folder path and choose **Add**. Multiple folders can be scanned together.
3. Optionally enter file extensions such as `jpg, png, pdf`, or choose an image, video, or document preset.
4. Select **Scan selected folders**.
5. Review the results in the **Files** tab or the **Folder** tab.

### Files tab

- Select a duplicate group with the checkbox on the left.
- Select **Keep** for the copy you want to preserve.
- Use the reveal icon beside a path to open that file in Windows Explorer.
- Select **Delete all copies** only when every file in that group should be removed. The group is greyed out and displays a warning.
- Use **Delete selected copies** to delete the selected groups while preserving the kept copy.

### Folder tab

- View every folder that contains duplicate files.
- Select individual folders or use **Select all folders**.
- Use the up and down controls to arrange folders. Folder order controls the order used when deleting duplicates from selected folders.
- **Delete duplicates from selected folders** removes duplicate copies only from the checked folders. The operation works from the bottom folder upward and preserves one copy within the selected folders. Files in unselected folders are not considered when choosing the preserved copy.

## Data and safety

- Scan results, selected folders, page size, and other view settings are stored locally in the app’s WebView storage.
- Files are not uploaded.
- Deletion validates that the scanned files still exist before removing anything. If the scan is out of date, deletion is aborted and no files are removed.
- Use **Clear all** to remove the selected folders and current scan results.

## Development

### Requirements

- Node.js and npm
- Rust with the Windows MSVC toolchain
- Tauri prerequisites for Windows desktop development

Install JavaScript dependencies:

```powershell
npm install
```

Run the web development server:

```powershell
npm run dev
```

Run the desktop app in development mode:

```powershell
npm run tauri dev
```

Validate the frontend:

```powershell
npm run build
```

Validate the Rust backend:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

## Windows release build

Use the release script to increment the patch version in `package.json` and `src-tauri/tauri.conf.json`, then build the Windows packages:

```powershell
npm run release:build
```

The installers are generated under:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

## Test fixtures

Sample files are under `public/test-images/`. The repository includes small duplicate groups and larger fixture sets for testing scans, including `bulk-100` and `bulk-10000`.

## Project stack

- React and TypeScript for the interface
- Vite for frontend development and bundling
- Tauri 2 for the Windows desktop shell
- Rust for recursive scanning, hashing, and guarded deletion
- Plain CSS for styling
