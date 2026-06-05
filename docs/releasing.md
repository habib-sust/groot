# Releasing groot

Releases are built and published by `.github/workflows/release.yml`, triggered
by pushing a `v*` tag. The workflow builds a universal (unsigned) `.dmg`,
creates the GitHub Release, and auto-updates `Casks/groot.rb` in the
`habib-sust/homebrew-groot` tap.

## Invariant

The git tag MUST match the app version. `v0.4.2` requires
`src-tauri/tauri.conf.json` `version` == `0.4.2`. CI fails fast if they differ.

## Steps

1. Bump the version in **both** files to the same value:
   - `src-tauri/tauri.conf.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version` under `[package]`
2. Commit: `git commit -am "release: vX.Y.Z"`
3. Tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
4. Watch the `release` workflow in the Actions tab. On success:
   - a GitHub Release with the `.dmg` exists, and
   - the tap repo has a new commit updating the cask version + sha256.
5. Verify the install: `brew update && brew upgrade --cask groot` (or a fresh
   `brew install --cask habib-sust/groot/groot`).

## Adding notarization later

Get an Apple Developer ID, then add the `APPLE_*` secrets referenced in the
commented hook in `release.yml`. No structural workflow change is required.
