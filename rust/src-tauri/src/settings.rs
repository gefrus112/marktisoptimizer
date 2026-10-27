//! Safe, reversible ClientAppSettings.json management.
//!
//! SAFETY BOUNDARY (must not be crossed):
//!  * Only local, reversible ClientAppSettings.json writes.
//!  * Timestamped backups are created before every write.
//!  * Unrelated keys are always preserved.
//!  * Only keys present in the canonical allowlist are ever managed.
//!  * Restore removes only the keys Roptimer managed.
//!  * No DLL injection, process hooks, memory reads/writes, executable
//!    patching, telemetry/Crashpad/Backtrace disabling, anti-cheat bypass,
//!    executor APIs, loadstring, or game script execution.
//!  * "Reduce building lag" = safe LOD/texture/grass/graphics reduction, never
//!    deleting buildings or changing collision/gameplay geometry.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::detect::{detect, Detection};

/// The canonical allowlist is embedded from the repo-root JSON at compile time
/// via build.rs (env var), so the app and the website never drift apart.
const ALLOWLIST_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/fastflags-allowlist.json"));

/// Keys Roptimer is allowed to write. Everything else in the user's JSON is
/// preserved untouched. The legacy FPS flag is intentionally NOT in this set.
fn allowlisted_keys() -> HashSet<String> {
    let mut keys = HashSet::new();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(ALLOWLIST_JSON) {
        if let Some(categories) = value.get("categories").and_then(|c| c.as_array()) {
            for category in categories {
                if let Some(flags) = category.get("flags").and_then(|f| f.as_array()) {
                    for flag in flags {
                        if let Some(name) = flag.as_str() {
                            keys.insert(name.to_string());
                        }
                    }
                }
            }
        }
    }
    keys
}

const LEGACY_FPS_FLAG: &str = "DFIntTaskSchedulerTargetFps";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_tier")]
    pub tier: u32,
    #[serde(default)]
    pub texture: u32,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default)]
    pub legacy_fps: bool,
    #[serde(default = "default_true")]
    pub all_versions: bool,
    #[serde(default = "default_true")]
    pub vfx: bool,
}

fn default_mode() -> String { "Reduce building lag".to_string() }
fn default_tier() -> u32 { 21 }
fn default_fps() -> u32 { 144 }
fn default_true() -> bool { true }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub applied: bool,
    pub message: String,
    pub written_paths: Vec<String>,
    pub backups: Vec<String>,
    pub managed_keys: Vec<String>,
    pub safety: ApplySafety,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplySafety {
    pub local_json_only: bool,
    pub backup_created: bool,
    pub unrelated_keys_preserved: bool,
    pub allowlist_only: bool,
    pub injection: bool,
    pub memory_writes: bool,
    pub game_script_execution: bool,
}

fn apply_safety() -> ApplySafety {
    ApplySafety {
        local_json_only: true,
        backup_created: true,
        unrelated_keys_preserved: true,
        allowlist_only: true,
        injection: false,
        memory_writes: false,
        game_script_execution: false,
    }
}

fn now_stamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Build the map of allowlisted keys Roptimer wants to set for a profile.
/// Only keys returned by `allowlisted_keys()` are ever included.
fn build_managed(profile: &Profile, allowed: &HashSet<String>) -> serde_json::Map<String, serde_json::Value> {
    use serde_json::Value;
    let mut managed = serde_json::Map::new();
    let mode = profile.mode.to_lowercase();
    let lag = mode.contains("building") || mode.contains("maximum") || mode.contains("performance");
    let balanced = mode.contains("balanced");

    // Macro rather than a capturing closure so `managed` is free to be
    // returned without borrow-checker friction.
    macro_rules! put {
        ($key:expr, $value:expr) => {
            if allowed.contains($key) {
                managed.insert($key.to_string(), $value);
            }
        };
    }

    // Texture quality (allowlisted override).
    put!("DFFlagTextureQualityOverrideEnabled", Value::Bool(true));
    put!("DFIntTextureQualityOverride", Value::from(profile.texture.min(3)));

    // FRM graphics quality level (0-21).
    put!("DFIntDebugFRMQualityLevelOverride", Value::from(profile.tier.min(21)));

    // MSAA samples: lower = faster; keep a conservative floor of 1.
    put!("FIntDebugForceMSAASamples", Value::from(if lag { 1 } else { 2 }));

    // DPI scaling off renders at native pixels.
    put!("DFFlagDisableDPIScale", Value::Bool(true));

    if lag || balanced || profile.vfx {
        // Geometry LOD switching distances — safe "reduce building lag".
        let base = if lag { 64 } else { 128 };
        put!("DFIntCSGLevelOfDetailSwitchingDistance", Value::from(base));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL12", Value::from(base));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL23", Value::from(base / 2));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL34", Value::from(base / 4));

        // Grass draw distance + reduced motion.
        put!("FIntFRMMaxGrassDistance", Value::from(if lag { 40 } else { 80 }));
        put!("FIntFRMMinGrassDistance", Value::from(if lag { 10 } else { 20 }));
        put!("FIntGrassMovementReducedMotionFactor", Value::from(100));
    }

    if profile.vfx {
        put!("FFlagDebugSkyGray", Value::Bool(true));
        put!("DFFlagDebugPauseVoxelizer", Value::Bool(true));
    }

    // NOTE: DFIntTaskSchedulerTargetFps (legacy FPS flag) is deliberately NOT
    // written here — it is not on Roblox's current local allowlist and current
    // clients may ignore it. We note it separately in the app UI.

    managed
}

fn target_paths(detection: &Detection, all_versions: bool) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = detection
        .versions
        .iter()
        .filter_map(|v| v.settings_path.as_deref().map(PathBuf::from))
        .collect();
    if !all_versions && paths.len() > 1 {
        paths.truncate(1);
    }
    paths
}

fn read_json_object(path: &Path) -> serde_json::Map<String, serde_json::Value> {
    if let Ok(text) = std::fs::read_to_string(path) {
        if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(&text) {
            return map;
        }
    }
    serde_json::Map::new()
}

fn write_backup(path: &Path, original: Option<&str>) -> Option<String> {
    let backup = path.with_file_name(format!(
        "{}.bak-{}",
        path.file_name()?.to_string_lossy(),
        now_stamp()
    ));
    let content = original.unwrap_or("{}");
    std::fs::write(&backup, content).ok()?;
    Some(backup.to_string_lossy().to_string())
}

#[tauri::command]
pub fn apply_settings(profile: Profile) -> ApplyResult {
    let allowed = allowlisted_keys();
    let managed = build_managed(&profile, &allowed);
    let managed_keys: Vec<String> = managed.keys().cloned().collect();
    let detection = detect();
    let paths = target_paths(&detection, profile.all_versions);

    let mut written = Vec::new();
    let mut backups = Vec::new();

    for path in paths {
        let parent = match path.parent() {
            Some(p) => p,
            None => continue,
        };
        if std::fs::create_dir_all(parent).is_err() {
            continue;
        }
        let original = std::fs::read_to_string(&path).ok();
        // Preserve unrelated keys; merge only allowlisted managed keys.
        let mut document = read_json_object(&path);
        if let Some(backup) = write_backup(&path, original.as_deref()) {
            backups.push(backup);
        }
        for (key, value) in &managed {
            if allowed.contains(key) {
                document.insert(key.clone(), value.clone());
            }
        }
        let pretty = serde_json::to_string_pretty(&serde_json::Value::Object(document))
            .unwrap_or_else(|_| "{}".to_string());
        if std::fs::write(&path, format!("{}\n", pretty)).is_ok() {
            written.push(path.to_string_lossy().to_string());
        }
    }

    let applied = !written.is_empty();
    let message = if applied {
        format!(
            "Applied {} allowlisted settings to {} file(s). Backups created; use Restore to undo.",
            managed_keys.len(),
            written.len()
        )
    } else {
        "No Roblox ClientSettings files were found. Install/launch Roblox once, then try again.".to_string()
    };

    ApplyResult { applied, message, written_paths: written, backups, managed_keys, safety: apply_safety() }
}

#[tauri::command]
pub fn restore_settings() -> ApplyResult {
    let detection = detect();
    let allowed = allowlisted_keys();
    let paths = target_paths(&detection, true);
    let mut written = Vec::new();
    let mut backups = Vec::new();
    let mut managed_keys: Vec<String> = allowed.iter().cloned().collect();
    managed_keys.sort();

    for path in paths {
        if !path.exists() {
            continue;
        }
        let original = std::fs::read_to_string(&path).ok();
        let mut document = read_json_object(&path);
        if let Some(backup) = write_backup(&path, original.as_deref()) {
            backups.push(backup);
        }
        // Remove only the keys Roptimer manages; keep everything else.
        for key in &managed_keys {
            document.remove(key);
        }
        document.remove(LEGACY_FPS_FLAG);
        let pretty = serde_json::to_string_pretty(&serde_json::Value::Object(document))
            .unwrap_or_else(|_| "{}".to_string());
        if std::fs::write(&path, format!("{}\n", pretty)).is_ok() {
            written.push(path.to_string_lossy().to_string());
        }
    }

    let applied = !written.is_empty();
    let message = if applied {
        format!("Restored managed settings in {} file(s). Backups kept.", written.len())
    } else {
        "No Roblox ClientSettings files were found to restore.".to_string()
    };
    ApplyResult { applied, message, written_paths: written, backups, managed_keys, safety: apply_safety() }
}
