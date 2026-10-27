use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Embed the canonical repo-root allowlist so the Rust client, website, and
    // CLI never drift. build_downloads.py keeps the other copies in sync.
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    // src-tauri -> rust -> repo root
    let root = manifest.parent().and_then(|p| p.parent()).unwrap_or(&manifest);
    let canonical = root.join("fastflags-allowlist.json");
    let dest = out_dir.join("fastflags-allowlist.json");
    if canonical.exists() {
        fs::copy(&canonical, &dest).expect("failed to copy fastflags-allowlist.json into OUT_DIR");
        println!("cargo:rerun-if-changed={}", canonical.display());
    } else {
        // Fallback: never fail the build; settings.rs degrades to an empty set
        // (which means it writes nothing unsafe).
        fs::write(&dest, "{\"categories\":[]}").expect("failed to write fallback allowlist");
    }

    tauri_build::build()
}
