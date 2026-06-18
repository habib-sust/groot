#!/usr/bin/env bash
# Renders the Homebrew cask for groot to stdout.
# Single source of truth, used by CI (.github/workflows/release.yml) and to
# seed the tap repo. Usage: render-cask.sh <version> <sha256> [arch] [product]
#
# `product` is the Tauri `productName` ("Groot"), which is the case-sensitive
# prefix of the .dmg asset and the installed .app — keep it in sync with
# src-tauri/tauri.conf.json. The cask *token* stays lowercase "groot".
set -euo pipefail

VERSION="${1:?usage: render-cask.sh <version> <sha256> [arch] [product]}"
SHA="${2:?usage: render-cask.sh <version> <sha256> [arch] [product]}"
ARCH="${3:-universal}"
PRODUCT="${4:-Groot}"

cat <<EOF
cask "groot" do
  version "${VERSION}"
  sha256 "${SHA}"

  url "https://github.com/habib-sust/groot/releases/download/v#{version}/${PRODUCT}_#{version}_${ARCH}.dmg"
  name "Groot"
  desc "Lightweight Markdown WYSIWYG desktop editor"
  homepage "https://github.com/habib-sust/groot"

  app "${PRODUCT}.app"

  zap trash: "~/Library/Application Support/com.groot.viewer"
end
EOF
