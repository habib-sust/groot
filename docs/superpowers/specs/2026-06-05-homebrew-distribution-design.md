# Homebrew distribution for groot — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorming)

## Goal

Let anyone on macOS install groot with Homebrew:

```bash
brew install --cask habib-sust/groot/groot
```

Publishing a new version should be: bump the version, push a `v*` git tag — CI builds, releases, and updates the cask automatically.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Distribution mechanism | Homebrew **Cask** (not formula) | groot is a pre-built macOS GUI `.app`, not a source-built CLI tool. |
| Cask hosting | Self-hosted **tap** `habib-sust/homebrew-groot` | Official `homebrew/cask` has notability requirements a `0.1.0` app won't meet yet. |
| Code signing | **Unsigned now**, structured so notarization drops in later | Free; avoids the $99/yr Apple Developer cost for now. Signing is purely additive to the build, so no rework later. |
| Build & publish | **GitHub Actions** on `v*` tag | Reproducible, no local toil, natural home for signing secrets later. |
| Architecture | **Universal** (`universal-apple-darwin`) | One `.dmg` runs natively on Apple Silicon + Intel; simplest cask (one URL/checksum). |
| Cask update | **Auto-updated by CI** | New release is fully hands-off after pushing a tag. |
| License | **MIT** | Permissive, simple; required for a public distributable. |
| Tap repo + secret creation | **User performs**, guided by exact `gh` commands | Requires the user's GitHub account/permissions; cannot be done from this repo's tooling. |

## The Gatekeeper reality (why the caveat exists)

macOS quarantines anything downloaded from the internet, including artifacts Homebrew downloads. Homebrew Cask **keeps** the quarantine attribute by default. Because groot is unsigned/un-notarized, the first launch will be blocked by Gatekeeper. The cask documents the workaround (right-click → Open, or `xattr -dr com.apple.quarantine`). Only real Developer ID notarization removes this; that is deferred.

## Repositories & artifacts

- **`habib-sust/groot`** (this repo) — source + the release CI workflow. GitHub Releases here host the `.dmg`.
- **`habib-sust/homebrew-groot`** (new repo) — the Homebrew tap. Contains `Casks/groot.rb`. The `homebrew-` prefix is what makes `brew tap` discover it.
- **Artifact:** one universal `.dmg` attached to each GitHub Release. Exact filename is produced by Tauri and not hardcoded into CI logic (the checksum is computed from the actual artifact); the cask `url` references it by the documented Tauri naming pattern, verified during implementation.

## Component 1 — Release workflow (`.github/workflows/release.yml`)

**Trigger:** push of a tag matching `v*` (e.g. `v0.1.0`).

**Job `release` (runner `macos-latest`):**
1. Checkout.
2. Setup Node (with `npm ci`) + Rust toolchain.
3. `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
4. Build via `tauri-apps/tauri-action` with `args: --target universal-apple-darwin`.
   - The action runs `beforeBuildCommand` (`npm run build`), builds the universal app, creates the GitHub Release for the tag, and uploads the `.dmg`.
5. **Signing hook:** unsigned for now. The workflow contains clearly-commented placeholders for `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`/`APPLE_API_KEY` secrets so notarization is a later drop-in with no structural change.

## Component 2 — Tap auto-update (`bump-cask` job)

Runs after `release` succeeds (`needs: release`):
1. Download the published `.dmg` from the release, compute its **SHA256**.
2. Checkout `habib-sust/homebrew-groot` using a `HOMEBREW_TAP_TOKEN` repo secret (fine-grained PAT with contents-write access to the tap repo).
3. Rewrite `Casks/groot.rb` `version` and `sha256`, commit, and push.

## Component 3 — The cask (`Casks/groot.rb` in the tap repo)

```ruby
cask "groot" do
  version "0.1.0"
  sha256 "…"                       # auto-updated by CI
  url "https://github.com/habib-sust/groot/releases/download/v#{version}/groot_#{version}_universal.dmg"
  name "groot"
  desc "Lightweight Markdown WYSIWYG desktop editor"
  homepage "https://github.com/habib-sust/groot"
  app "groot.app"
  caveats <<~EOS
    groot is not yet notarized. On first launch macOS may block it.
    Right-click the app → Open, or run:
      xattr -dr com.apple.quarantine /Applications/groot.app
  EOS
  zap trash: ["~/Library/Application Support/com.groot.viewer"]
end
```

(`com.groot.viewer` is groot's bundle identifier, per `tauri.conf.json`.)

## Component 4 — Supporting changes in this repo

- **`LICENSE`** — add MIT (year 2026, copyright holder = repo owner). Optionally reference it from `Cargo.toml`/`tauri.conf.json` metadata.
- **README** — add an "Install via Homebrew" section and the first-launch quarantine note.
- **Release procedure docs** — document the bump-and-tag flow, keeping `tauri.conf.json` `version`, `Cargo.toml` `version`, and the git tag in sync.

## Component 5 — User-performed setup (guided)

Provided as copy-paste `gh` CLI commands:
1. Create the public tap repo: `gh repo create habib-sust/homebrew-groot --public ...`.
2. Push the initial `Casks/groot.rb`.
3. Create a fine-grained PAT scoped to the tap repo (contents: write) and add it to **this** repo as the `HOMEBREW_TAP_TOKEN` secret: `gh secret set HOMEBREW_TAP_TOKEN ...`.

## Verification

- **CI dry path:** push `v0.1.0`; confirm the GitHub Release + `.dmg` appear and the `bump-cask` job commits the updated checksum to the tap.
- **End-to-end install:** `brew tap habib-sust/groot && brew install --cask groot`; confirm groot lands in `/Applications` and launches after the documented quarantine bypass.

## Out of scope (YAGNI for now)

- Apple Developer ID signing / notarization (deferred; hook left in place).
- Auto-update inside the app (Tauri updater).
- Submission to the official `homebrew/cask` repo.
- Windows/Linux distribution.
