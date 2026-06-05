# Homebrew Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone install groot on macOS with `brew install --cask habib-sust/groot/groot`, with releases built and the cask updated automatically by CI on a version tag.

**Architecture:** A `v*` git tag triggers a GitHub Actions workflow that builds a universal (unsigned) `.dmg` via `tauri-action`, publishes it to a GitHub Release, then a second job discovers the real artifact name, computes its SHA256, and regenerates `Casks/groot.rb` in the separate `habib-sust/homebrew-groot` tap repo. The cask is rendered from one shared script (`scripts/render-cask.sh`) used both by CI and to seed the tap, so they never drift.

**Tech Stack:** GitHub Actions, `tauri-apps/tauri-action@v0`, `dtolnay/rust-toolchain`, Homebrew Cask (Ruby), bash, `gh` CLI.

---

## File structure

| File | Responsibility |
|---|---|
| `LICENSE` (create) | MIT license text for the public distributable. |
| `src-tauri/Cargo.toml` (modify) | Declare `license = "MIT"`. |
| `scripts/render-cask.sh` (create) | Single source of truth that renders `Casks/groot.rb` from `(version, sha256, arch)`. Used by CI and to seed the tap. |
| `.github/workflows/release.yml` (create) | `release` job (build + publish) and `bump-cask` job (compute SHA + push cask to tap). |
| `README.md` (modify) | "Install via Homebrew" section + first-launch quarantine note. |
| `docs/releasing.md` (create) | The bump-and-tag release procedure and version-sync invariant. |

The cask file itself lives in the **separate** `habib-sust/homebrew-groot` repo, created in Task 6.

---

### Task 1: Add MIT license

**Files:**
- Create: `LICENSE`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Create the LICENSE file**

Create `LICENSE` with exactly this content:

```
MIT License

Copyright (c) 2026 habib-sust

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Declare the license in Cargo.toml**

In `src-tauri/Cargo.toml`, change the `[package]` block. Find:

```toml
[package]
name = "groot"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
edition = "2021"
```

Replace with:

```toml
[package]
name = "groot"
version = "0.1.0"
description = "A lightweight Markdown WYSIWYG desktop app"
authors = ["habib-sust"]
license = "MIT"
edition = "2021"
```

- [ ] **Step 3: Verify the manifest still parses**

Run: `~/.cargo/bin/cargo check --manifest-path src-tauri/Cargo.toml`
Expected: compiles with no manifest errors (warnings are fine).

- [ ] **Step 4: Commit**

```bash
git add LICENSE src-tauri/Cargo.toml
git commit -m "chore: add MIT license"
```

---

### Task 2: Add the cask render script

**Files:**
- Create: `scripts/render-cask.sh`

- [ ] **Step 1: Write the script**

Create `scripts/render-cask.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# Renders the Homebrew cask for groot to stdout.
# Single source of truth, used by CI (.github/workflows/release.yml) and to
# seed the tap repo. Usage: render-cask.sh <version> <sha256> [arch]
set -euo pipefail

VERSION="${1:?usage: render-cask.sh <version> <sha256> [arch]}"
SHA="${2:?usage: render-cask.sh <version> <sha256> [arch]}"
ARCH="${3:-universal}"

cat <<EOF
cask "groot" do
  version "${VERSION}"
  sha256 "${SHA}"

  url "https://github.com/habib-sust/groot/releases/download/v#{version}/groot_#{version}_${ARCH}.dmg"
  name "groot"
  desc "Lightweight Markdown WYSIWYG desktop editor"
  homepage "https://github.com/habib-sust/groot"

  app "groot.app"

  caveats <<~CAVEAT
    groot is not yet notarized. On first launch macOS may block it.
    Right-click the app in Finder and choose Open, or run:
      xattr -dr com.apple.quarantine "/Applications/groot.app"
  CAVEAT

  zap trash: "~/Library/Application Support/com.groot.viewer"
end
EOF
```

Note: `#{version}` is intentional Ruby interpolation in the generated cask — it must reach the file literally (the unquoted heredoc does not expand it because there is no `$`). `${ARCH}` IS expanded by bash to the arch token CI discovers.

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/render-cask.sh`

- [ ] **Step 3: Run it and verify the output is valid Ruby**

Run:
```bash
scripts/render-cask.sh 0.1.0 0000000000000000000000000000000000000000000000000000000000000000 universal > /tmp/groot.rb
ruby -c /tmp/groot.rb
```
Expected: prints `Syntax OK`.

- [ ] **Step 4: Verify the URL and interpolation rendered correctly**

Run: `grep -E 'url "https://github.com/habib-sust/groot/releases/download/v#\{version\}/groot_#\{version\}_universal.dmg"' /tmp/groot.rb`
Expected: the line matches (confirms `#{version}` stayed literal and `universal` was substituted).

- [ ] **Step 5: Commit**

```bash
git add scripts/render-cask.sh
git commit -m "build: add cask render script (single source of truth)"
```

---

### Task 3: Add the release build job

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow with the release job**

Create `.github/workflows/release.yml` with exactly this content (the `bump-cask` job is added in Task 4):

```yaml
name: release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify tag matches tauri.conf version
        run: |
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          CONF_VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
          if [ "$TAG_VERSION" != "$CONF_VERSION" ]; then
            echo "::error::tag $GITHUB_REF_NAME does not match tauri.conf.json version $CONF_VERSION"
            exit 1
          fi

      - uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - run: npm ci

      # --- Signing/notarization hook (deferred) -----------------------------
      # When an Apple Developer ID is available, add these to the env: below:
      #   APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY,
      #   APPLE_ID, APPLE_PASSWORD (or APPLE_API_KEY/APPLE_API_ISSUER).
      # No other change is needed; tauri-action signs + notarizes when present.
      # ----------------------------------------------------------------------
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "groot ${{ github.ref_name }}"
          releaseBody: "Download the .dmg below. groot is not yet notarized — see the README for the first-launch step."
          releaseDraft: false
          prerelease: false
          args: --target universal-apple-darwin
```

- [ ] **Step 2: Verify the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build + publish universal macOS release on v* tag"
```

---

### Task 4: Add the cask auto-update job

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Append the `bump-cask` job**

Add the following job to `.github/workflows/release.yml`, indented as a sibling of `release:` under `jobs:` (i.e. at the same indentation as `release:`):

```yaml
  bump-cask:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Resolve version, asset, arch and checksum
        id: meta
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          ASSET="$(gh release view "$GITHUB_REF_NAME" -R habib-sust/groot \
            --json assets -q '.assets[].name | select(endswith(".dmg"))' | head -n1)"
          if [ -z "$ASSET" ]; then
            echo "::error::no .dmg asset found on release $GITHUB_REF_NAME"
            exit 1
          fi
          ARCH="${ASSET#groot_${VERSION}_}"
          ARCH="${ARCH%.dmg}"
          gh release download "$GITHUB_REF_NAME" -R habib-sust/groot -p "$ASSET" -O /tmp/groot.dmg
          SHA="$(sha256sum /tmp/groot.dmg | cut -d' ' -f1)"
          {
            echo "version=$VERSION"
            echo "arch=$ARCH"
            echo "sha=$SHA"
          } >> "$GITHUB_OUTPUT"

      - name: Checkout tap repo
        uses: actions/checkout@v4
        with:
          repository: habib-sust/homebrew-groot
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          path: tap

      - name: Render cask into the tap
        run: |
          mkdir -p tap/Casks
          bash scripts/render-cask.sh \
            "${{ steps.meta.outputs.version }}" \
            "${{ steps.meta.outputs.sha }}" \
            "${{ steps.meta.outputs.arch }}" > tap/Casks/groot.rb
          cat tap/Casks/groot.rb

      - name: Commit and push
        run: |
          cd tap
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add Casks/groot.rb
          if git diff --staged --quiet; then
            echo "cask already up to date"
          else
            git commit -m "groot ${{ steps.meta.outputs.version }}"
            git push
          fi
```

- [ ] **Step 2: Verify the YAML still parses and both jobs exist**

Run:
```bash
python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/release.yml')); print(sorted(d['jobs']))"
```
Expected: prints `['bump-cask', 'release']`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: auto-update homebrew tap cask after release"
```

---

### Task 5: Document install and release procedure

**Files:**
- Modify: `README.md`
- Create: `docs/releasing.md`

- [ ] **Step 1: Add the Homebrew install section to the README**

In `README.md`, immediately after the first paragraph (the line starting "A lightweight Markdown desktop app…") and before `## Features`, insert:

```markdown
## Install (macOS)

```bash
brew install --cask habib-sust/groot/groot
```

> **First launch:** groot is not yet notarized by Apple, so macOS Gatekeeper
> blocks it the first time. Right-click the app in Finder and choose **Open**
> (then confirm), or run once:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/groot.app
> ```

```

- [ ] **Step 2: Create the release procedure doc**

Create `docs/releasing.md` with exactly this content:

```markdown
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
```

- [ ] **Step 3: Verify the README edit landed in the right place**

Run: `grep -n "Install (macOS)" README.md`
Expected: a line number that appears before the `## Features` line (confirm with `grep -n "## Features" README.md`).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/releasing.md
git commit -m "docs: homebrew install + release procedure"
```

---

### Task 6: Create the tap repo and CI secret (user-performed)

These steps require your GitHub account and **cannot** be done from this repo's
tooling. Run them yourself. They are ordered; do them after Tasks 1–5 are merged
to `main`.

**Files:** none in this repo (operates on the new tap repo + repo secrets).

- [ ] **Step 1: Create the public tap repo**

Run:
```bash
gh repo create habib-sust/homebrew-groot --public \
  --description "Homebrew tap for groot" --add-readme
```
Expected: prints the new repo URL `https://github.com/habib-sust/homebrew-groot`.

- [ ] **Step 2: Seed the initial cask using the shared render script**

From the groot repo root, render a placeholder cask (CI overwrites it on the
first release) and push it to the tap:
```bash
TMP="$(mktemp -d)"
git clone https://github.com/habib-sust/homebrew-groot "$TMP/tap"
mkdir -p "$TMP/tap/Casks"
scripts/render-cask.sh 0.1.0 \
  0000000000000000000000000000000000000000000000000000000000000000 \
  universal > "$TMP/tap/Casks/groot.rb"
cd "$TMP/tap"
git add Casks/groot.rb
git commit -m "groot 0.1.0 (placeholder, updated by CI on first release)"
git push
cd -
```
Expected: a commit lands on `homebrew-groot` containing `Casks/groot.rb`.

- [ ] **Step 3: Create a fine-grained PAT for the tap**

Create a token at https://github.com/settings/tokens?type=beta with:
- **Resource owner:** habib-sust
- **Repository access:** Only select repositories → `habib-sust/homebrew-groot`
- **Permissions:** Repository permissions → **Contents: Read and write**

Copy the token (starts with `github_pat_`).

- [ ] **Step 4: Add the token as a secret on the groot repo**

Run (paste the token when prompted, then Ctrl-D):
```bash
gh secret set HOMEBREW_TAP_TOKEN -R habib-sust/groot
```
Expected: `✓ Set secret HOMEBREW_TAP_TOKEN for habib-sust/groot`.

- [ ] **Step 5: Verify the secret exists**

Run: `gh secret list -R habib-sust/groot`
Expected: `HOMEBREW_TAP_TOKEN` appears in the list.

---

### Task 7: End-to-end release verification

**Files:** none (operational verification of the whole pipeline).

- [ ] **Step 1: Cut the first release**

Ensure `tauri.conf.json` and `Cargo.toml` are both `0.1.0`, then:
```bash
git tag v0.1.0
git push origin main --tags
```

- [ ] **Step 2: Verify the build + release**

Run: `gh run watch -R habib-sust/groot` (or watch the Actions tab).
Expected: both `release` and `bump-cask` jobs succeed.
Then: `gh release view v0.1.0 -R habib-sust/groot --json assets -q '.assets[].name'`
Expected: includes a `groot_0.1.0_*.dmg` asset.

- [ ] **Step 3: Verify the tap was updated with a real checksum**

Run:
```bash
gh api repos/habib-sust/homebrew-groot/contents/Casks/groot.rb \
  -q '.content' | base64 -d | grep -E 'version|sha256|url'
```
Expected: `version "0.1.0"`, a real 64-hex `sha256` (not all zeros), and a `url`
whose `_<arch>.dmg` token matches the actual asset name from Step 2.

- [ ] **Step 4: Verify a clean install**

Run:
```bash
brew untap habib-sust/groot 2>/dev/null || true
brew install --cask habib-sust/groot/groot
```
Expected: groot installs to `/Applications/groot.app`. Launch it (right-click →
Open the first time, per the README note) and confirm the window opens.

- [ ] **Step 5: No commit needed** — this task only verifies the live pipeline.

---

## Notes for the implementer

- There is no JS unit-test harness and CI cannot be unit-tested locally; the
  "tests" here are config/syntax checks (`cargo check`, `ruby -c`, `yaml.safe_load`)
  plus the live verification in Task 7. That live run is the real proof.
- Tasks 1–5 are ordinary repo edits (subagent-executable). Tasks 6–7 require the
  user's GitHub account and a tag push, so a subagent should hand them back to
  the user rather than attempt them.
- The cask `url` arch token (`universal`) is confirmed/derived from the real
  release asset by `bump-cask`; if Tauri emits a different token, CI writes the
  correct one automatically — no code change needed.
