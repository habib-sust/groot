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
