#!/usr/bin/env bash
#
# rasputin bootstrap.sh — one-command FIRST-node flasher.
#
# Served statically from https://rasputin.geekdojo.com/bootstrap.sh (GitHub
# Pages — no backend). The Download page hands a new operator a single line:
#
#   curl -fsSL https://rasputin.geekdojo.com/bootstrap.sh | sudo bash
#
# This is the bootstrap sibling of the control plane's add-node flasher
# (rasputin-control-plane api/internal/api/flash.sh) and is FORKED from it —
# the disk picker, safety rails, download/verify/flash, and the block-level
# seed read-back are the same code. Keep fixes in sync between the two.
#
# Why a fork exists at all: flash.sh joins a node to a RUNNING cluster — it is
# served from rasputin.local and consumes a control-plane-minted seed. The
# FIRST node (the control plane itself) has no control plane to talk to yet,
# so this script differs in exactly three ways:
#
#   1. It BUILDS its own seed instead of receiving one. A first control plane
#      needs no join token and no NATS URL (it self-initialises against its
#      embedded NATS): just role=controlplane, a node id, and your SSH public
#      key (no key is baked into public images — yours is the only one).
#   2. It resolves the image ITSELF from the latest public stable release —
#      GitHub's releases/latest/download/manifest.json — instead of asking
#      /api/cluster/node-image. No GitHub API, no rate limits, no staleness.
#   3. Trust rides on HTTPS (this script and the manifest both arrive over
#      TLS) plus the manifest's per-image SHA-256, verified before flashing —
#      not on the cluster mesh CA, which doesn't exist at first-node time.
#
# Like flash.sh, it READS THE SEED BACK at the block level and fails loudly
# if it didn't land — a silently-unseeded first node boots un-enrollable.
#
# Cross-platform: macOS and Linux. Windows: use the manual steps on the
# Download page (Raspberry Pi Imager / Etcher, then drop the seed file).
#
# Env knobs (all optional — the script prompts for anything missing):
#   RASPUTIN_ARCH            target CPU arch: arm64 (Raspberry Pi 4/5/CM5) or
#                            amd64 (Intel N100 / any amd64 box)
#   RASPUTIN_NODE_ID         control-plane node id (default: cp-1)
#   RASPUTIN_SSH_AUTHORIZED_KEY  your SSH public key line ("ssh-ed25519 AAAA… you@laptop")
#   RASPUTIN_SSH_KEY_FILE    path to a .pub file to read the key from
#   RASPUTIN_RELEASE         pin a release tag (default: latest stable)
#   RASPUTIN_DISK            target device (e.g. /dev/disk4 or /dev/sdb); skips
#                            the interactive picker (still asks to confirm
#                            unless RASPUTIN_ASSUME_YES=1)
#   RASPUTIN_ASSUME_YES      =1 to skip the typed confirmation (non-interactive)
#   RASPUTIN_DRY_RUN         =1 to print the plan and stop before any write
#   RASPUTIN_ALLOW_INTERNAL  =1 to also offer internal disks (dangerous)
#
set -euo pipefail

RED=''; GRN=''; YEL=''; BLD=''; RST=''
if [ -t 2 ]; then RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLD=$'\033[1m'; RST=$'\033[0m'; fi
say()  { printf '%s\n' "$*" >&2; }
info() { printf '%s==>%s %s\n' "$GRN" "$RST" "$*" >&2; }
warn() { printf '%s!!%s  %s\n' "$YEL" "$RST" "$*" >&2; }
die()  { printf '%sERROR:%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }
ask()  { # ask <prompt> ; reads from the terminal even under `curl | bash`
	local __p="$1" __v
	if [ -r /dev/tty ]; then printf '%s' "$__p" >&2; IFS= read -r __v </dev/tty || __v=""; else __v=""; fi
	printf '%s' "$__v"
}
have() { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"
case "$OS" in
	Darwin|Linux) ;;
	*) die "unsupported OS: $OS (this flasher runs on macOS or Linux — on Windows, follow the manual steps on the Download page)" ;;
esac

[ "$(id -u)" = "0" ] || die "must run as root — paste the command including 'sudo' as shown on the Download page."

have curl || die "curl is required."

REPO_OWNER="geekdojo"
OS_REPO="rasputin-os"
GH_DL="https://github.com/${REPO_OWNER}/${OS_REPO}/releases"

# --- 1. target hardware ---------------------------------------------------------
ARCH="${RASPUTIN_ARCH:-}"
if [ -z "$ARCH" ]; then
	say ""
	say "${BLD}What hardware is this control plane?${RST}"
	say "  1) Raspberry Pi 4 / 5 / CM5            (arm64)"
	say "  2) Intel N100 / any amd64 mini-PC      (amd64)"
	say ""
	sel="$(ask "Pick 1 or 2: ")"
	case "$sel" in
		1) ARCH=arm64 ;;
		2) ARCH=amd64 ;;
		*) die "not a valid choice: '$sel' (or set RASPUTIN_ARCH=arm64|amd64)." ;;
	esac
fi
case "$ARCH" in arm64|amd64) ;; *) die "RASPUTIN_ARCH must be arm64 or amd64 (got '$ARCH')." ;; esac

# --- 2. node id -----------------------------------------------------------------
NODE_ID="${RASPUTIN_NODE_ID:-}"
if [ -z "$NODE_ID" ]; then
	NODE_ID="$(ask "Name this control plane [cp-1]: ")"
	[ -n "$NODE_ID" ] || NODE_ID="cp-1"
fi
printf '%s' "$NODE_ID" | grep -Eq '^[a-z0-9][a-z0-9-]*$' \
	|| die "node id '$NODE_ID' — use short lowercase letters, digits, and hyphens (e.g. cp-1)."

# --- 3. SSH public key ------------------------------------------------------------
# No key is baked into public images (by design); the seed's key is the only way
# in. Sources, in order: env, key file, the invoking user's ~/.ssh, paste.
invoker_home() {
	local u="${SUDO_USER:-}"
	if [ -z "$u" ]; then printf '%s' "${HOME:-}"; return; fi
	if [ "$OS" = "Darwin" ]; then
		dscl . -read "/Users/$u" NFSHomeDirectory 2>/dev/null | awk '{print $2; exit}'
	else
		getent passwd "$u" 2>/dev/null | cut -d: -f6
	fi
}
valid_pubkey() { printf '%s' "$1" | grep -Eq '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9-]+|sk-[a-z0-9-]+(@[a-z0-9.-]+)?) [A-Za-z0-9+/=]+'; }

SSH_KEY="${RASPUTIN_SSH_AUTHORIZED_KEY:-}"
if [ -z "$SSH_KEY" ] && [ -n "${RASPUTIN_SSH_KEY_FILE:-}" ]; then
	[ -r "$RASPUTIN_SSH_KEY_FILE" ] || die "can't read RASPUTIN_SSH_KEY_FILE: $RASPUTIN_SSH_KEY_FILE"
	SSH_KEY="$(head -1 "$RASPUTIN_SSH_KEY_FILE")"
fi
if [ -z "$SSH_KEY" ]; then
	ihome="$(invoker_home)"
	for f in "$ihome/.ssh/id_ed25519.pub" "$ihome/.ssh/id_ecdsa.pub" "$ihome/.ssh/id_rsa.pub"; do
		[ -r "$f" ] || continue
		cand="$(head -1 "$f")"
		valid_pubkey "$cand" || continue
		say ""
		say "Found an SSH public key: ${BLD}$f${RST}"
		say "  ${cand}"
		yn="$(ask "Use this key for SSH access to the node? [Y/n] ")"
		case "$yn" in n|N|no|NO) ;; *) SSH_KEY="$cand" ;; esac
		break
	done
fi
if [ -z "$SSH_KEY" ]; then
	say ""
	say "Paste your SSH ${BLD}public${RST} key (one line, e.g. from ~/.ssh/id_ed25519.pub)."
	say "It becomes the node's only authorized key — no key is baked into the image."
	SSH_KEY="$(ask "> ")"
fi
valid_pubkey "$SSH_KEY" || die "that doesn't look like an SSH public key (expected something like 'ssh-ed25519 AAAA… you@laptop')."

# --- 4. resolve the image from the latest public stable release -------------------
# releases/latest/download/<asset> follows GitHub's redirect to the newest
# STABLE release (prereleases excluded) — no API call, no token, no rate limit.
if [ -n "${RASPUTIN_RELEASE:-}" ]; then
	MANIFEST_URL="$GH_DL/download/${RASPUTIN_RELEASE}/manifest.json"
else
	MANIFEST_URL="$GH_DL/latest/download/manifest.json"
fi
info "Resolving the ${RASPUTIN_RELEASE:-latest stable} Rasputin OS release…"
MANIFEST="$(curl -fsSL --max-time 30 "$MANIFEST_URL" 2>/dev/null || true)"
[ -n "$MANIFEST" ] || die "couldn't fetch $MANIFEST_URL — check your network (or the release tag, if you pinned one)."

# Minimal-dependency JSON pluck: flatten, split objects onto lines, take the
# artifact whose "architecture" matches. Keys are quote-anchored so e.g.
# "image" never matches "imageSha256".
FLAT="$(printf '%s' "$MANIFEST" | tr -d ' \n\t\r')"
ART="$(printf '%s' "$FLAT" | tr '}' '\n' | grep "\"architecture\":\"$ARCH\"" | head -1 || true)"
[ -n "$ART" ] || die "this release has no $ARCH image (manifest: $MANIFEST_URL)."
pluck() { printf '%s' "$2" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -1; }
IMG_VERSION="$(pluck version "$FLAT")"
IMG_NAME="$(pluck image "$ART")"
IMG_SHA="$(pluck imageSha256 "$ART")"
[ -n "$IMG_VERSION" ] && [ -n "$IMG_NAME" ] && [ -n "$IMG_SHA" ] \
	|| die "the release manifest didn't parse (version='$IMG_VERSION' image='$IMG_NAME') — file a bug at github.com/${REPO_OWNER}/${OS_REPO}."
IMG_URL="$GH_DL/download/${IMG_VERSION}/${IMG_NAME}"

info "First node ${BLD}${NODE_ID}${RST} (controlplane) → Rasputin OS ${BLD}${IMG_VERSION}${RST} (${ARCH})"

# --- pick the target disk -----------------------------------------------------
# list_disks prints one "<device>\t<size>\t<model>" line per candidate.
list_disks() {
	if [ "$OS" = "Darwin" ]; then
		local scope="external physical"; [ "${RASPUTIN_ALLOW_INTERNAL:-}" = "1" ] && scope="physical"
		local d
		for d in $(diskutil list $scope 2>/dev/null | awk '/^\/dev\/disk/{print $1}'); do
			local size name
			size="$(diskutil info "$d" 2>/dev/null | awk -F': *' '/Disk Size/{print $2; exit}')"
			name="$(diskutil info "$d" 2>/dev/null | awk -F': *' '/Device \/ Media Name/{print $2; exit}')"
			printf '%s\t%s\t%s\n' "$d" "${size:-?}" "${name:-disk}"
		done
	else
		local rootsrc rootdisk
		rootsrc="$(findmnt -no SOURCE / 2>/dev/null || true)"
		rootdisk="$(lsblk -no PKNAME "$rootsrc" 2>/dev/null | head -1 || true)"
		lsblk -dpno NAME,SIZE,MODEL,TRAN,RM,TYPE 2>/dev/null | while read -r name size model tran rm type rest; do
			[ "$type" = "disk" ] || continue
			[ "/dev/${rootdisk}" = "$name" ] && continue          # never the laptop's own root disk
			if [ "${RASPUTIN_ALLOW_INTERNAL:-}" != "1" ]; then
				[ "$rm" = "1" ] || [ "$tran" = "usb" ] || continue  # removable / USB only
			fi
			printf '%s\t%s\t%s\n' "$name" "${size:-?}" "${model:-disk}"
		done
	fi
}

DISK="${RASPUTIN_DISK:-}"
if [ -z "$DISK" ]; then
	mapfile_disks="$(list_disks || true)"
	if [ -z "$mapfile_disks" ]; then
		die "no external/removable disk found. Plug in the node's microSD/SSD (a USB enclosure or card reader works), then re-run. (To target an internal disk, set RASPUTIN_ALLOW_INTERNAL=1 — careful.)"
	fi
	say ""; say "${BLD}Plugged-in disks:${RST}"
	i=0; devs=""
	while IFS=$'\t' read -r dev size model; do
		i=$((i+1)); devs="$devs $dev"
		printf '  %s) %-14s %8s  %s\n' "$i" "$dev" "$size" "$model" >&2
	done <<EOF
$mapfile_disks
EOF
	say ""
	sel="$(ask "Which disk number to flash (1-$i, or q to quit)? ")"
	[ "$sel" = "q" ] && die "cancelled."
	case "$sel" in ''|*[!0-9]*) die "not a number: '$sel'";; esac
	[ "$sel" -ge 1 ] && [ "$sel" -le "$i" ] || die "out of range: $sel"
	DISK="$(printf '%s' "$devs" | tr ' ' '\n' | sed -n "$((sel+1))p")"
fi
[ -n "$DISK" ] && [ -b "$DISK" ] || die "invalid disk: '$DISK'"

# Refuse the root disk on Linux even if passed explicitly.
if [ "$OS" = "Linux" ]; then
	rootsrc="$(findmnt -no SOURCE / 2>/dev/null || true)"
	rootdisk="$(lsblk -no PKNAME "$rootsrc" 2>/dev/null | head -1 || true)"
	[ "/dev/${rootdisk}" = "$DISK" ] && die "refusing to flash $DISK — it backs this computer's root filesystem."
fi

part_for() { # first partition device of a whole disk
	if [ "$OS" = "Darwin" ]; then printf '%ss1' "$1"; else
		case "$1" in *[0-9]) printf '%sp1' "$1";; *) printf '%s1' "$1";; esac
	fi
}
PART="$(part_for "$DISK")"

# --- confirm ------------------------------------------------------------------
DISK_DESC="$(list_disks | awk -F'\t' -v d="$DISK" '$1==d{print $2"  "$3}')"
say ""
warn "About to ${BLD}ERASE ALL DATA${RST}${YEL} on ${BLD}${DISK}${RST}${YEL}  ${DISK_DESC}${RST}"
say   "        and flash Rasputin OS ${IMG_VERSION}, seeded as ${NODE_ID} (controlplane)."
if [ "${RASPUTIN_DRY_RUN:-}" = "1" ]; then info "DRY RUN — stopping before any write. Disk=$DISK Part=$PART Image=$IMG_URL"; exit 0; fi
if [ "${RASPUTIN_ASSUME_YES:-}" != "1" ]; then
	short="$(basename "$DISK")"
	ans="$(ask "Type ${BLD}${short}${RST} to confirm (anything else aborts): ")"
	[ "$ans" = "$short" ] || die "aborted — '$ans' did not match '$short'. Nothing was written."
fi

# --- download + verify --------------------------------------------------------
TMP="$(mktemp -d "${TMPDIR:-/tmp}/rasputin-bootstrap.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
IMG="$TMP/node.img.xz"
info "Downloading $IMG_URL"
curl -fL --progress-bar -o "$IMG" "$IMG_URL" || die "image download failed."
info "Verifying checksum…"
if have shasum; then got="$(shasum -a 256 "$IMG" | awk '{print $1}')"; else got="$(sha256sum "$IMG" | awk '{print $1}')"; fi
[ "$got" = "$IMG_SHA" ] || die "checksum MISMATCH — refusing to flash a corrupt download.\n  expected $IMG_SHA\n  got      $got"
info "Checksum OK."

# --- flash --------------------------------------------------------------------
have xz || die "xz is required to decompress the image (macOS: 'brew install xz'; Linux: install xz-utils)."
info "Flashing ${DISK} (this takes a few minutes; do not unplug)…"
if [ "$OS" = "Darwin" ]; then
	diskutil unmountDisk "$DISK" >/dev/null 2>&1 || true
	RDISK="/dev/r${DISK#/dev/}"   # raw device (e.g. /dev/disk4 -> /dev/rdisk4) is much faster on macOS
	xz -dc "$IMG" | dd of="$RDISK" bs=4m || die "write to $RDISK failed (see the error above — is the disk in use?)."
else
	for p in $(lsblk -lnpo NAME "$DISK" 2>/dev/null | tail -n +2); do umount "$p" 2>/dev/null || true; done
	if xz -dc "$IMG" | dd of="$DISK" bs=4M oflag=sync status=progress 2>/dev/null; then :; else
		xz -dc "$IMG" | dd of="$DISK" bs=4M 2>/dev/null || die "dd failed."
	fi
fi
sync
info "Image written. Settling partitions…"
if [ "$OS" = "Darwin" ]; then diskutil unmountDisk "$DISK" >/dev/null 2>&1 || true; else
	have partprobe && partprobe "$DISK" 2>/dev/null || true
	have udevadm && udevadm settle 2>/dev/null || true
	sleep 2
fi

# --- write the seed onto the boot FAT, then READ IT BACK ----------------------
SEED="RASPUTIN_NODE_ROLE=controlplane
RASPUTIN_NODE_ID=$NODE_ID
RASPUTIN_SSH_AUTHORIZED_KEY=\"$SSH_KEY\"
"
SEED_FILE="$TMP/rasputin-seed.env"; printf '%s' "$SEED" > "$SEED_FILE"
READBACK="$TMP/readback.env"
write_and_verify_seed() {
	if have mcopy; then
		# Block-level write (no FS cache between us and the medium — the safe path).
		[ "$OS" = "Darwin" ] && diskutil unmount "$PART" >/dev/null 2>&1 || umount "$PART" 2>/dev/null || true
		mcopy -o -i "$PART" "$SEED_FILE" ::rasputin-seed.env || return 1
		rm -f "$READBACK"
		mcopy -n -i "$PART" ::rasputin-seed.env "$READBACK" || return 1
	else
		# Mount-dance fallback: write, sync, UNMOUNT, then MOUNT FRESH to read
		# back — a fresh mount reads from the medium, defeating any write cache
		# (the macOS FAT flush trap that motivated the flash.sh read-back).
		local mp="$TMP/mnt"; mkdir -p "$mp"
		if [ "$OS" = "Darwin" ]; then
			diskutil mount -mountPoint "$mp" "$PART" >/dev/null 2>&1 || return 1
			cp "$SEED_FILE" "$mp/rasputin-seed.env" || return 1; sync
			diskutil unmount "$mp" >/dev/null 2>&1 || return 1
			diskutil mount -mountPoint "$mp" "$PART" >/dev/null 2>&1 || return 1
			cp "$mp/rasputin-seed.env" "$READBACK" 2>/dev/null || true
			diskutil unmount "$mp" >/dev/null 2>&1 || true
		else
			mount "$PART" "$mp" || return 1
			cp "$SEED_FILE" "$mp/rasputin-seed.env" || return 1; sync
			umount "$mp" || return 1
			mount "$PART" "$mp" || return 1
			cp "$mp/rasputin-seed.env" "$READBACK" 2>/dev/null || true
			umount "$mp" || true
		fi
	fi
	return 0
}
info "Writing the control-plane seed to the boot partition…"
write_and_verify_seed || die "could not write the seed to $PART."
[ -s "$READBACK" ] && cmp -s "$SEED_FILE" "$READBACK" \
	|| die "seed read-back FAILED — the seed is not reliably on the disk. Re-run before booting the node (do NOT boot it as-is — it would come up unseeded)."
info "Seed verified on disk (read-back matches)."

# --- done ---------------------------------------------------------------------
if [ "$OS" = "Darwin" ]; then diskutil eject "$DISK" >/dev/null 2>&1 || true; else
	sync; have udisksctl && udisksctl power-off -b "$DISK" >/dev/null 2>&1 || true
fi
say ""
info "${GRN}${BLD}Done.${RST} Flashed Rasputin OS ${IMG_VERSION}, seeded as ${NODE_ID} (controlplane)."
say   "      Seat the disk in the node and power it on. In a minute or two, open"
say   "      ${BLD}http://rasputin.local${RST} — the first-run wizard takes it from there."
