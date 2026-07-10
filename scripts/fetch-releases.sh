#!/usr/bin/env bash
# Resolve the latest STABLE release of each downloadable Rasputin product and
# write data/releases.json, which the Hugo Download page renders.
#
# Reads the PUBLIC source repos directly (ADR-0002 — the rasputin-releases
# mirror is retired) via `gh`: GITHUB_TOKEN in CI, your gh login locally.
# GitHub's /releases/latest already excludes prereleases, so this is always the
# newest STABLE build. Best-effort by design: if EITHER product fails to
# resolve, the committed data/releases.json is left in place, so a transient API
# hiccup can never publish an empty Download page. Idempotent.
set -uo pipefail
cd "$(dirname "$0")/.."
owner=geekdojo
out=data/releases.json

os_obj() {
  gh api "repos/${owner}/rasputin-os/releases/latest" 2>/dev/null | jq -e '{
    version: .tag_name,
    releaseUrl: .html_url,
    latestUrl: "https://github.com/geekdojo/rasputin-os/releases/latest",
    images: [
      (.assets[] | select(.name | test("-rpi-.*\\.img\\.xz$"))  | {label: "Raspberry Pi 4 / 5 / CM5", arch: "arm64", name: .name, url: .browser_download_url}),
      (.assets[] | select(.name | test("-n100-.*\\.img\\.xz$")) | {label: "Intel N100 / any amd64 box", arch: "amd64", name: .name, url: .browser_download_url})
    ]
  }' 2>/dev/null
}

fw_obj() {
  gh api "repos/${owner}/rasputin-openwrt-firewall/releases/latest" 2>/dev/null | jq -e '{
    version: .tag_name,
    releaseUrl: .html_url,
    latestUrl: "https://github.com/geekdojo/rasputin-openwrt-firewall/releases/latest",
    images: [
      (.assets[] | select(.name | test("-ab\\.img\\.gz$")) | {label: "Intel N100 firewall (x86-64)", arch: "amd64", name: .name, url: .browser_download_url})
    ]
  }' 2>/dev/null
}

os="$(os_obj)" || true
fw="$(fw_obj)" || true

if [ -z "${os}" ] || [ -z "${fw}" ]; then
  echo "fetch-releases: incomplete resolve (os=${os:+ok} fw=${fw:+ok}); leaving ${out} unchanged" >&2
  exit 0
fi

mkdir -p "$(dirname "$out")"
jq -n --arg generated "$(date -u +%Y-%m-%d)" --argjson os "$os" --argjson fw "$fw" \
  '{generated: $generated, os: $os, firewall: $fw}' >"$out"
echo "fetch-releases: wrote ${out}" >&2
