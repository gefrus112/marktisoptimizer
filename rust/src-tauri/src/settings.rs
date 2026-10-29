//! Safe, reversible ClientAppSettings.json management.
//!
//! SAFETY BOUNDARY (must not be crossed):
//!  * Only local, reversible ClientAppSettings.json writes.
//!  * Timestamped backups are created before every write.
//!  * Unrelated keys are always preserved.
//!  * The canonical allowlist is the default; one separate experimental legacy
//!    FPS key is written only after explicit opt-in and is backed up/restorable.
//!  * Restore removes only the keys Marktis Optimizer manages.
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

/// Keys Marktis Optimizer is allowed to write. Everything else in the user's JSON is
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
    #[serde(default = "default_renderer")]
    pub renderer: String,
    #[serde(default)]
    pub geometry_distance: Option<u32>,
    #[serde(default = "default_true")]
    pub all_versions: bool,
    #[serde(default = "default_true")]
    pub vfx: bool,
}

fn default_mode() -> String { "Reduce building lag".to_string() }
fn default_tier() -> u32 { 21 }
fn default_fps() -> u32 { 240 }
fn default_renderer() -> String { "Auto".to_string() }
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
    pub experimental_legacy_fps: bool,
    pub injection: bool,
    pub memory_writes: bool,
    pub game_script_execution: bool,
}

fn apply_safety(experimental_legacy_fps: bool, backup_created: bool) -> ApplySafety {
    ApplySafety {
        local_json_only: true,
        backup_created,
        unrelated_keys_preserved: true,
        allowlist_only: !experimental_legacy_fps,
        experimental_legacy_fps,
        injection: false,
        memory_writes: false,
        game_script_execution: false,
    }
}

fn now_stamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Build the map of allowlisted keys Marktis Optimizer wants to set for a profile.
/// Only keys returned by `allowlisted_keys()` are ever included.
fn build_managed(profile: &Profile, allowed: &HashSet<String>) -> serde_json::Map<String, serde_json::Value> {
    use serde_json::Value;
    let mut managed = serde_json::Map::new();
    let mode = profile.mode.to_lowercase();
    let lag = mode.contains("building") || mode.contains("maximum") || mode.contains("performance");
    let balanced = mode.contains("balanced");
    let high_quality = mode.contains("high quality");

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

    // Renderer preference uses only the three mutually exclusive allowlisted
    // switches. "Auto" leaves every preference off; Direct3D 12 is not on the
    // canonical allowlist and is intentionally not offered.
    let renderer = profile.renderer.to_ascii_lowercase();
    put!("FFlagDebugGraphicsPreferD3D11", Value::Bool(renderer == "direct3d 11" || renderer == "d3d11"));
    put!("FFlagDebugGraphicsPreferVulkan", Value::Bool(renderer == "vulkan"));
    put!("FFlagDebugGraphicsPreferOpenGL", Value::Bool(renderer == "opengl"));

    if lag || balanced || high_quality || profile.vfx {
        // Geometry LOD switching distances — higher keeps detail visible farther away.
        let default_distance = if lag { 64 } else if high_quality { 256 } else { 128 };
        let base = profile
            .geometry_distance
            .unwrap_or(default_distance)
            .clamp(32, 256);
        put!("DFIntCSGLevelOfDetailSwitchingDistance", Value::from(base));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL12", Value::from(base));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL23", Value::from(base / 2));
        put!("DFIntCSGLevelOfDetailSwitchingDistanceL34", Value::from(base / 4));

        // Grass detail follows the selected preset; high detail retains more range.
        put!("FIntFRMMaxGrassDistance", Value::from(if lag { 40 } else if high_quality { 160 } else { 80 }));
        put!("FIntFRMMinGrassDistance", Value::from(if lag { 10 } else if high_quality { 40 } else { 20 }));
        put!("FIntGrassMovementReducedMotionFactor", Value::from(if high_quality { 0 } else { 100 }));
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

/// Add the optional, unsupported legacy FPS request only after canonical
/// allowlist-derived settings have been constructed.
fn add_experimental_legacy_fps(
    managed: &mut serde_json::Map<String, serde_json::Value>,
    profile: &Profile,
) {
    if profile.legacy_fps {
        managed.insert(
            LEGACY_FPS_FLAG.to_string(),
            serde_json::Value::from(profile.fps.clamp(60, 1000)),
        );
    }
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

fn parse_json_object(text: &str) -> Option<serde_json::Map<String, serde_json::Value>> {
    match serde_json::from_str::<serde_json::Value>(text).ok()? {
        serde_json::Value::Object(map) => Some(map),
        _ => None,
    }
}

fn write_backup(path: &Path, original: Option<&str>) -> Option<String> {
    use std::io::Write;

    let file_name = path.file_name()?.to_string_lossy();
    let base = format!("{}.bak-{}", file_name, now_stamp());
    let content = original.unwrap_or("{}");
    for suffix in 0..10_000 {
        let name = if suffix == 0 { base.clone() } else { format!("{}-{}", base, suffix) };
        let backup = path.with_file_name(name);
        let mut file = match std::fs::OpenOptions::new().write(true).create_new(true).open(&backup) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return None,
        };
        if file.write_all(content.as_bytes()).is_err() {
            drop(file);
            let _ = std::fs::remove_file(&backup);
            return None;
        }
        return Some(backup.to_string_lossy().to_string());
    }
    None
}

#[tauri::command]
pub fn apply_settings(profile: Profile) -> ApplyResult {
    let allowed = allowlisted_keys();
    let mut managed = build_managed(&profile, &allowed);
    // This explicit opt-in remains separate from the canonical 18-key set.
    add_experimental_legacy_fps(&mut managed, &profile);
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
        let original = match std::fs::read_to_string(&path) {
            Ok(content) => Some(content),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => continue,
        };
        // Refuse to replace a malformed/non-object file; its original bytes stay untouched.
        let mut document = match original.as_deref() {
            Some(content) => match parse_json_object(content) {
                Some(document) => document,
                None => continue,
            },
            None => serde_json::Map::new(),
        };
        // Never write if a backup could not be created first.
        let backup = match write_backup(&path, original.as_deref()) {
            Some(path) => path,
            None => continue,
        };
        backups.push(backup);
        // Preserve unrelated keys; merge only allowlisted managed keys.
        for (key, value) in &managed {
            if allowed.contains(key) || (profile.legacy_fps && key == LEGACY_FPS_FLAG) {
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
        let canonical_count = managed_keys.len() - (if profile.legacy_fps { 1 } else { 0 });
        if profile.legacy_fps {
            format!(
                "Applied {} canonical allowlisted settings and experimental legacy FPS target {} to {} file(s). Backups created; use Restore to remove managed keys.",
                canonical_count,
                profile.fps.clamp(60, 1000),
                written.len()
            )
        } else {
            format!(
                "Applied {} allowlisted settings to {} file(s). Backups created; use Restore to remove managed keys.",
                canonical_count,
                written.len()
            )
        }
    } else {
        "No usable Roblox ClientSettings files were found. Check the local JSON format, install/launch Roblox once, then try again.".to_string()
    };

    let backup_created = !written.is_empty() && backups.len() == written.len();
    ApplyResult {
        applied,
        message,
        written_paths: written,
        backups,
        managed_keys,
        safety: apply_safety(profile.legacy_fps, backup_created),
    }
}

#[tauri::command]
pub fn restore_settings() -> ApplyResult {
    let detection = detect();
    let allowed = allowlisted_keys();
    let paths = target_paths(&detection, true);
    let mut written = Vec::new();
    let mut backups = Vec::new();
    let mut managed_keys: Vec<String> = allowed.iter().cloned().collect();
    managed_keys.push(LEGACY_FPS_FLAG.to_string());
    managed_keys.sort();

    for path in paths {
        if !path.exists() {
            continue;
        }
        let original = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let mut document = match parse_json_object(&original) {
            Some(document) => document,
            None => continue,
        };
        let backup = match write_backup(&path, Some(&original)) {
            Some(path) => path,
            None => continue,
        };
        backups.push(backup);
        // Remove only the keys Marktis Optimizer manages; keep everything else.
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
        "No valid Roblox ClientSettings files were found to restore.".to_string()
    };
    let backup_created = !written.is_empty() && backups.len() == written.len();
    ApplyResult {
        applied,
        message,
        written_paths: written,
        backups,
        managed_keys,
        safety: apply_safety(true, backup_created),
    }
}

#[cfg(test)]
mod tests {
    use super::{add_experimental_legacy_fps, allowlisted_keys, build_managed, Profile, LEGACY_FPS_FLAG};

    fn profile(renderer: &str) -> Profile {
        Profile {
            mode: "Balanced".to_string(),
            tier: 21,
            texture: 0,
            fps: 240,
            legacy_fps: false,
            renderer: renderer.to_string(),
            geometry_distance: Some(128),
            all_versions: true,
            vfx: false,
        }
    }

    #[test]
    fn profile_defaults_legacy_fps_off_and_reads_camel_case_fields() {
        let defaults: Profile = serde_json::from_str("{}").expect("profile defaults should deserialize");
        assert_eq!(defaults.fps, 240);
        assert!(!defaults.legacy_fps);

        let profile: Profile = serde_json::from_str(r#"{"fps":360,"legacyFps":true}"#)
            .expect("frontend profile should deserialize");
        assert_eq!(profile.fps, 360);
        assert!(profile.legacy_fps);
    }

    #[test]
    fn legacy_fps_request_is_opt_in_and_separate_from_canonical_allowlist() {
        let allowed = allowlisted_keys();
        assert!(!allowed.contains(LEGACY_FPS_FLAG));

        let mut off_profile = profile("Auto");
        let mut off = build_managed(&off_profile, &allowed);
        add_experimental_legacy_fps(&mut off, &off_profile);
        assert!(!off.contains_key(LEGACY_FPS_FLAG));

        off_profile.legacy_fps = true;
        off_profile.fps = 1200;
        let mut opted_in = build_managed(&off_profile, &allowed);
        assert!(!opted_in.contains_key(LEGACY_FPS_FLAG));
        add_experimental_legacy_fps(&mut opted_in, &off_profile);
        assert_eq!(
            opted_in.get(LEGACY_FPS_FLAG).and_then(serde_json::Value::as_u64),
            Some(1000)
        );

        off_profile.fps = 30;
        let mut minimum = build_managed(&off_profile, &allowed);
        add_experimental_legacy_fps(&mut minimum, &off_profile);
        assert_eq!(
            minimum.get(LEGACY_FPS_FLAG).and_then(serde_json::Value::as_u64),
            Some(60)
        );
    }

    #[test]
    fn maximum_performance_profile_uses_lower_graphics_workload() {
        let allowed = allowlisted_keys();
        let mut profile = profile("Auto");
        profile.mode = "Maximum performance".to_string();
        profile.geometry_distance = Some(64);
        profile.texture = 0;
        profile.tier = 6;
        profile.vfx = true;
        let managed = build_managed(&profile, &allowed);
        assert_eq!(managed.get("DFIntTextureQualityOverride").and_then(serde_json::Value::as_u64), Some(0));
        assert_eq!(managed.get("DFIntDebugFRMQualityLevelOverride").and_then(serde_json::Value::as_u64), Some(6));
        assert_eq!(managed.get("DFIntCSGLevelOfDetailSwitchingDistance").and_then(serde_json::Value::as_u64), Some(64));
        assert_eq!(managed.get("FIntFRMMaxGrassDistance").and_then(serde_json::Value::as_u64), Some(40));
    }

    #[test]
    fn high_quality_profile_keeps_detail_distance_and_grass_range() {
        let allowed = allowlisted_keys();
        let mut profile = profile("Auto");
        profile.mode = "High quality".to_string();
        profile.geometry_distance = Some(256);
        profile.texture = 3;
        profile.tier = 21;
        profile.vfx = false;
        let managed = build_managed(&profile, &allowed);
        assert_eq!(managed.get("DFIntTextureQualityOverride").and_then(serde_json::Value::as_u64), Some(3));
        assert_eq!(managed.get("DFIntDebugFRMQualityLevelOverride").and_then(serde_json::Value::as_u64), Some(21));
        assert_eq!(managed.get("DFIntCSGLevelOfDetailSwitchingDistance").and_then(serde_json::Value::as_u64), Some(256));
        assert_eq!(managed.get("FIntFRMMaxGrassDistance").and_then(serde_json::Value::as_u64), Some(160));
        assert_eq!(managed.get("FIntGrassMovementReducedMotionFactor").and_then(serde_json::Value::as_u64), Some(0));
    }

    #[test]
    fn renderer_preference_is_mutually_exclusive_and_allowlisted() {
        let allowed = allowlisted_keys();
        let renderer_keys = [
            "FFlagDebugGraphicsPreferD3D11",
            "FFlagDebugGraphicsPreferVulkan",
            "FFlagDebugGraphicsPreferOpenGL",
        ];
        for (choice, expected) in [
            ("Auto", None),
            ("Direct3D 11", Some("FFlagDebugGraphicsPreferD3D11")),
            ("Vulkan", Some("FFlagDebugGraphicsPreferVulkan")),
            ("OpenGL", Some("FFlagDebugGraphicsPreferOpenGL")),
            ("Direct3D 12", None),
        ] {
            let managed = build_managed(&profile(choice), &allowed);
            let enabled: Vec<_> = renderer_keys
                .iter()
                .filter(|key| managed.get(**key).and_then(serde_json::Value::as_bool) == Some(true))
                .copied()
                .collect();
            match expected {
                Some(key) => assert_eq!(enabled, vec![key]),
                None => assert!(enabled.is_empty()),
            }
        }
    }
}
