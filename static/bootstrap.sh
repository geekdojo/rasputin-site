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
#   3. Trust starts at a FINGERPRINT BAKED INTO THIS FILE, not at the cluster
#      mesh CA, which doesn't exist at first-node time: the root CA is checked
#      against RASPUTIN_ROOT_CA_SHA256, the release manifest must carry a
#      signature that verifies against that root and that was made by a leaf
#      authorized for firmware, and only then is the image's SHA-256 read out
#      of the manifest. See the shared release verifier below.
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
#   RASPUTIN_CLUSTER_ID      cluster name — the mDNS name you browse
#                            (https://<name>.local), the WebAuthn RP ID, and the
#                            <name>.internal DNS zone (default: rasputin)
#   RASPUTIN_NODE_ID         control-plane node id (default: cp-1)
#   RASPUTIN_SSH_AUTHORIZED_KEY  your SSH public key line ("ssh-ed25519 AAAA… you@laptop")
#   RASPUTIN_SSH_KEY_FILE    path to a .pub file to read the key from
#   RASPUTIN_RELEASE         pin a release tag (default: latest stable). A
#                            release with no manifest.json.sig (anything before
#                            2026-09) is refused.
#   RASPUTIN_MANIFEST_FILE   use this already-downloaded manifest.json instead
#                            of fetching one. It is verified here regardless.
#   RASPUTIN_MANIFEST_SIG_FILE  its detached signature (default:
#                            <RASPUTIN_MANIFEST_FILE>.sig)
#   RASPUTIN_ROOT_CA_FILE    use a local copy of the Rasputin root CA. It must
#                            still match the fingerprint baked into this script.
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
# One DNS label per RFC 1123: lowercase alphanumerics and hyphens, starting AND
# ending alphanumeric, 1-63 characters. Both names this script collects become
# hostname labels — the cluster name is also a TLS SAN and the WebAuthn RP ID
# (`<cluster>.local`), and a node is addressable at `<node>.<cluster>.internal` —
# so a trailing hyphen is not merely untidy, it is an uncertifiable host.
valid_label() { printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'; }

# ==============================================================================
# BEGIN shared release verifier
# ------------------------------------------------------------------------------
# This block is the ONE laptop-side verifier, kept BYTE-IDENTICAL in two places:
#
#   rasputin-site               static/bootstrap.sh          (canonical copy)
#   rasputin-control-plane      api/internal/api/flash.sh    (vendored copy)
#
# The markers are how the two are compared: rasputin-control-plane's
# TestFlashScriptVerifierMatchesCanonical extracts everything between them and
# checks it against a pinned hash, so an edit to one copy fails that repo's
# tests until the other is updated. Change the canonical copy, then copy the
# whole block across, markers included.
#
# The two scripts are otherwise different programs — bootstrap.sh flashes a
# FIRST control plane from a public release, flash.sh joins a node to a running
# cluster and is handed the manifest by that cluster — and only this part is
# shared, because only this part is a security decision.
#
# WHAT IT ESTABLISHES (geekdojo/geekdojo-brain#528)
#   Before this, a first flash trusted the release manifest on HTTPS plus GitHub
#   repository write: `manifest.json` arrived over TLS, the image's SHA-256 was
#   read out of it, and the manifest's own signature — published beside it —
#   was never fetched. Every checksum below is only as trustworthy as the
#   document it was read from, so the chain started at "whatever GitHub served".
#
#   Now it starts at a fingerprint baked into this file:
#
#     1. the root CA is downloaded and its SHA-256 fingerprint must equal
#        RASPUTIN_ROOT_CA_SHA256 below — so the anchor comes from the script's
#        own bytes, not from the fetch;
#     2. `manifest.json.sig` must verify against that root;
#     3. the SIGNER must carry the release purpose OID — this is the check that
#        binds the signature to firmware, rather than to any leaf the same root
#        happens to have issued;
#     4. only then is a SHA-256 read out of the manifest and the image checked
#        against it (the existing check, further down).
#
#   THIS DOES NOT make a compromised control plane safe: it closes tampering
#   with the published release assets, which is the threat a laptop faces.
#
# TOOLING
#   `openssl` only — a laptop has no Rasputin binary. macOS ships LibreSSL
#   3.3.6, Linux ships OpenSSL 3.x; the commands below were measured on both
#   (geekdojo/geekdojo-brain#474). Two consequences worth not re-deriving:
#     - `x509 -ext` does not exist on LibreSSL, so the EKU is read from
#       `x509 -text`;
#     - `-purpose any` on the CMS verify, because the default purpose is
#       S/MIME: it passes today only because the release leaf happens to carry
#       emailProtection, which is incidental. The purpose gate is the OID check,
#       which is what the control plane and the node agent also enforce.
# ==============================================================================

# The Rasputin root CA, by fingerprint. This is the anchor: a root that does not
# hash to this is refused no matter where it came from. Published alongside the
# PEM at https://rasputin.geekdojo.com/docs/agents/.
RASPUTIN_ROOT_CA_URL="https://rasputin.geekdojo.com/rasputin-root-ca.pem"
RASPUTIN_ROOT_CA_SHA256="677e570613873e08a32cf5f4527610338d575ac4e9675ccd91c443febd27c1b9"

# The release purpose. A leaf carrying it may sign OS and firmware artifacts; a
# leaf without it may not, whatever else it chains to. Matched as a WHOLE TOKEN
# below — the raw string is a prefix of any future …1.1.1x OID, so a substring
# test would accept a purpose that has not been minted yet.
RASPUTIN_RELEASE_OID="1.3.6.1.4.1.66587.1.1.1"

# sha256_of <file> — print a file's SHA-256, on whichever tool the box has.
sha256_of() {
	if have shasum; then shasum -a 256 "$1" | awk '{print $1}'
	elif have sha256sum; then sha256sum "$1" | awk '{print $1}'
	else return 1
	fi
}

# rasputin_openssl — the openssl to use, or empty if there is none.
rasputin_openssl() { command -v openssl 2>/dev/null; }

# cert_fingerprint <pem> — the SHA-256 fingerprint of the first certificate in a
# PEM file, as bare lowercase hex.
#
# The fingerprint of the CERTIFICATE (its DER), not of the file. A PEM can gain
# a comment, a trailing newline or CRLF endings and still be the same
# certificate, so hashing the file would refuse a root that is in fact ours. It
# is also the form published for a human to compare against
# (`openssl x509 -noout -fingerprint -sha256`), so the value below is the value
# on the docs page rather than a second, differently-computed one.
cert_fingerprint() {
	local ssl
	ssl="$(rasputin_openssl || true)"
	[ -n "$ssl" ] || return 1
	"$ssl" x509 -in "$1" -noout -fingerprint -sha256 2>/dev/null \
		| sed 's/^.*=//; s/://g' | tr 'A-Z' 'a-z'
}

# rasputin_trusted_root <workdir> — put a FINGERPRINT-CHECKED root CA at
# <workdir>/root-ca.pem, or die. Set RASPUTIN_ROOT_CA_FILE to use a local copy
# instead of downloading; it is checked against the same fingerprint.
rasputin_trusted_root() {
	local work="$1" dest="$1/root-ca.pem" got
	if [ -n "${RASPUTIN_ROOT_CA_FILE:-}" ]; then
		[ -r "$RASPUTIN_ROOT_CA_FILE" ] || die "can't read RASPUTIN_ROOT_CA_FILE: $RASPUTIN_ROOT_CA_FILE"
		cp "$RASPUTIN_ROOT_CA_FILE" "$dest" || die "couldn't copy $RASPUTIN_ROOT_CA_FILE"
	else
		curl -fsSL --max-time 30 -o "$dest" "$RASPUTIN_ROOT_CA_URL" \
			|| die "couldn't fetch the Rasputin root CA from $RASPUTIN_ROOT_CA_URL — check your network."
	fi
	got="$(cert_fingerprint "$dest" || true)"
	[ -n "$got" ] \
		|| die "couldn't read a certificate out of the root CA at $dest — openssl is required (macOS ships it; on Linux install the 'openssl' package). Refusing to continue."
	[ "$got" = "$RASPUTIN_ROOT_CA_SHA256" ] || die \
"the Rasputin root CA does not match the fingerprint built into this script.
  expected  $RASPUTIN_ROOT_CA_SHA256
  got       $got
Nothing was written. Either this script is out of date, or what you downloaded
is not the Rasputin root CA. Re-download the script from
https://rasputin.geekdojo.com/bootstrap.sh and try again."
	printf '%s' "$dest"
}

# rasputin_verify_manifest <manifest> <sig> <root-ca> <workdir> <stale-advice>
#
# Verify the detached CMS signature over the manifest, then require the release
# purpose OID on the signer. Dies on any failure; prints nothing on success but
# a one-line confirmation. <stale-advice> is the sentence to print when the
# signature is fine but the signing certificate has EXPIRED — a caller that is
# adding a node to a running cluster and one that is flashing a first node need
# different advice for the same condition.
rasputin_verify_manifest() {
	local manifest="$1" sig="$2" root="$3" work="$4" stale_advice="$5"
	local ssl signer eku

	# `|| true`: under `set -e` a failing command substitution would exit before
	# the message below, and "openssl is missing" deserves a sentence.
	ssl="$(rasputin_openssl || true)"
	[ -n "$ssl" ] || die "openssl is required to verify the release signature (macOS ships it; on Linux install the 'openssl' package). Refusing to flash an unverified image."

	[ -s "$manifest" ] || die "the release manifest is empty or missing: $manifest"
	[ -s "$sig" ] || die \
"this release has no signature for its manifest (manifest.json.sig).
Releases published before 2026-09 are not signed, and this script will not flash
an unverified image. Use the current release — drop RASPUTIN_RELEASE to take the
latest stable."

	signer="$work/signer.pem"
	if ! "$ssl" cms -verify -purpose any -binary -inform DER \
		-in "$sig" -content "$manifest" -CAfile "$root" \
		-signer "$signer" -out /dev/null 2>"$work/verify.err"; then

		# Work out WHICH failure this is before reporting it. The signature can
		# be perfectly good and still not verify, because the signing
		# certificate has a lifetime — and "certificate has expired" on a
		# release you did not choose is not a tampering report, it is a stale
		# release. Extract the signer without chain validation purely to tell
		# the two apart. (geekdojo/geekdojo-brain#576)
		if "$ssl" cms -verify -noverify -binary -inform DER \
			-in "$sig" -content "$manifest" -signer "$signer" -out /dev/null 2>/dev/null \
			&& [ -s "$signer" ] \
			&& ! "$ssl" x509 -in "$signer" -noout -checkend 0 >/dev/null 2>&1; then
			die \
"this release's signing certificate expired on $("$ssl" x509 -in "$signer" -noout -enddate 2>/dev/null | sed 's/^notAfter=//').
The signature itself is intact — the release is simply too old to install.
$stale_advice
Nothing was written."
		fi

		die \
"the release manifest's signature did NOT verify against the Rasputin root CA.
Nothing was written. Do not flash this image. openssl said:
$(sed 's/^/  /' "$work/verify.err" 2>/dev/null | tail -3)"
	fi

	[ -s "$signer" ] || die "the signature verified but openssl produced no signer certificate — refusing to continue."

	# The purpose check. `x509 -text` (not -ext: LibreSSL has no -ext), the EKU
	# value on the line after the heading, and a WHOLE-TOKEN match so
	# 1.3.6.1.4.1.66587.1.1.1x cannot pass as 1.3.6.1.4.1.66587.1.1.1.
	#
	# `|| true` is load-bearing: a certificate with NO extendedKeyUsage at all
	# makes grep exit 1, and under `set -e` a failing command substitution in an
	# ASSIGNMENT kills the script — silently, with status 1 and not one word
	# about why. The oldest published release leaf is exactly that shape, so the
	# least authorized signer there is produced the least informative refusal.
	# An empty $eku simply fails the match below, which is the right answer
	# said out loud.
	eku="$("$ssl" x509 -in "$signer" -noout -text 2>/dev/null \
		| grep -A1 'X509v3 Extended Key Usage' | tr -d '\r' || true)"
	printf '%s\n' "$eku" | grep -Eq "(^|[ ,])$(printf '%s' "$RASPUTIN_RELEASE_OID" | sed 's/\./\\./g')([ ,]|\$)" \
		|| die \
"the release manifest is signed by a certificate that is NOT authorized to sign
Rasputin OS or firmware images (it does not carry $RASPUTIN_RELEASE_OID).
Nothing was written. Do not flash this image.
  signer: $("$ssl" x509 -in "$signer" -noout -subject 2>/dev/null)"

	info "Release signature verified (signed by $("$ssl" x509 -in "$signer" -noout -subject 2>/dev/null | sed 's/^subject= *//'))."
}
# ==============================================================================
# END shared release verifier
# ==============================================================================

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

# --- 2. cluster name ------------------------------------------------------------
# The cluster's name is its identity for the life of the installation: the mDNS
# name you browse (`https://<cluster>.local`), the WebAuthn RP ID every passkey
# binds to, the NATS URL each node dials, the Headscale server_url, and the
# `<cluster>.internal` zone the control plane serves DNS for. It is fixed at
# provision time and renaming a live cluster is unsupported (ADR-0003) — which is
# exactly why the question belongs here, while nothing has been committed yet.
# The `rasputin` default keeps the zero-config path intact for the common case of
# one cluster on a LAN.
CLUSTER_ID="${RASPUTIN_CLUSTER_ID:-}"
if [ -z "$CLUSTER_ID" ]; then
	say ""
	say "${BLD}What should this cluster be called?${RST}"
	say "  You'll browse it at https://<name>.local, and the name is fixed for the life"
	say "  of the installation — changing it later means re-provisioning every node."
	say "  Press Enter for ${BLD}rasputin${RST}; pick a name if a second Rasputin cluster"
	say "  might ever share this network."
	say ""
	CLUSTER_ID="$(ask "Cluster name [rasputin]: ")"
	[ -n "$CLUSTER_ID" ] || CLUSTER_ID="rasputin"
fi
valid_label "$CLUSTER_ID" \
	|| die "cluster name '$CLUSTER_ID' — use one DNS label: lowercase letters, digits and hyphens, starting and ending with a letter or digit, 63 characters or fewer (e.g. home1)."

# --- 3. node id -----------------------------------------------------------------
# This names the BOX, not the cluster: it is how this control plane appears in the
# node list and at `<node>.<cluster>.internal`. Most people never change it.
NODE_ID="${RASPUTIN_NODE_ID:-}"
if [ -z "$NODE_ID" ]; then
	NODE_ID="$(ask "Name this control-plane node, as it appears in the cluster [cp-1]: ")"
	[ -n "$NODE_ID" ] || NODE_ID="cp-1"
fi
valid_label "$NODE_ID" \
	|| die "node id '$NODE_ID' — use one DNS label: lowercase letters, digits and hyphens, starting and ending with a letter or digit, 63 characters or fewer (e.g. cp-1)."

# --- 4. SSH public key ------------------------------------------------------------
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

# --- 5. resolve the image from the latest public stable release -------------------
# releases/latest/download/<asset> follows GitHub's redirect to the newest
# STABLE release (prereleases excluded) — no API call, no token, no rate limit.
#
# The scratch directory is created HERE rather than at flash time: the signature
# check below needs somewhere to put the root CA and the signer certificate, and
# it runs BEFORE the disk picker so an unverifiable release stops the run while
# nothing has been chosen, let alone written.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/rasputin-bootstrap.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# A caller that has ALREADY fetched the manifest hands it over instead of having
# this script fetch a second copy (geekdojo/geekdojo-brain#528). That is what
# the rasputin-setup agent skill does: two copies fetched independently means
# the one that was verified and the one that was used need not be the same
# document. Whatever arrives here is verified below — being handed a file is not
# a reason to trust it.
if [ -n "${RASPUTIN_MANIFEST_FILE:-}" ]; then
	[ -r "$RASPUTIN_MANIFEST_FILE" ] || die "can't read RASPUTIN_MANIFEST_FILE: $RASPUTIN_MANIFEST_FILE"
	MANIFEST_SIG_FILE="${RASPUTIN_MANIFEST_SIG_FILE:-${RASPUTIN_MANIFEST_FILE}.sig}"
	[ -r "$MANIFEST_SIG_FILE" ] \
		|| die "RASPUTIN_MANIFEST_FILE was given but its signature is missing: $MANIFEST_SIG_FILE (set RASPUTIN_MANIFEST_SIG_FILE if it is elsewhere)."
	cp "$RASPUTIN_MANIFEST_FILE" "$TMP/manifest.json" || die "couldn't read $RASPUTIN_MANIFEST_FILE"
	cp "$MANIFEST_SIG_FILE" "$TMP/manifest.json.sig" || die "couldn't read $MANIFEST_SIG_FILE"
	info "Using the release manifest supplied by the caller ($RASPUTIN_MANIFEST_FILE)."
else
	if [ -n "${RASPUTIN_RELEASE:-}" ]; then
		MANIFEST_URL="$GH_DL/download/${RASPUTIN_RELEASE}/manifest.json"
	else
		MANIFEST_URL="$GH_DL/latest/download/manifest.json"
	fi
	info "Resolving the ${RASPUTIN_RELEASE:-latest stable} Rasputin OS release…"
	curl -fsSL --max-time 30 -o "$TMP/manifest.json" "$MANIFEST_URL" 2>/dev/null \
		|| die "couldn't fetch $MANIFEST_URL — check your network (or the release tag, if you pinned one)."
	# A missing .sig is not an error to route around: it is an unsigned release,
	# and the check below refuses one.
	curl -fsSL --max-time 30 -o "$TMP/manifest.json.sig" "${MANIFEST_URL}.sig" 2>/dev/null || true
fi

# Verify the manifest BEFORE reading a single checksum out of it.
info "Verifying the release signature…"
ROOT_CA="$(rasputin_trusted_root "$TMP")" || exit 1
rasputin_verify_manifest "$TMP/manifest.json" "$TMP/manifest.json.sig" "$ROOT_CA" "$TMP" \
	"Take the latest stable release instead: re-run without RASPUTIN_RELEASE set."

MANIFEST="$(cat "$TMP/manifest.json")"
[ -n "$MANIFEST" ] || die "the release manifest is empty."

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

info "Cluster ${BLD}${CLUSTER_ID}${RST} — first node ${BLD}${NODE_ID}${RST} (controlplane) → Rasputin OS ${BLD}${IMG_VERSION}${RST} (${ARCH})"

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

# --- confirm ------------------------------------------------------------------
DISK_DESC="$(list_disks | awk -F'\t' -v d="$DISK" '$1==d{print $2"  "$3}')"
say ""
warn "About to ${BLD}ERASE ALL DATA${RST}${YEL} on ${BLD}${DISK}${RST}${YEL}  ${DISK_DESC}${RST}"
say   "        and flash Rasputin OS ${IMG_VERSION}, seeded as ${NODE_ID} (controlplane)"
say   "        in cluster ${BLD}${CLUSTER_ID}${RST} — reachable at ${BLD}https://${CLUSTER_ID}.local${RST}."
if [ "${RASPUTIN_DRY_RUN:-}" = "1" ]; then info "DRY RUN — stopping before any write. Disk=$DISK Image=$IMG_URL"; exit 0; fi
if [ "${RASPUTIN_ASSUME_YES:-}" != "1" ]; then
	short="$(basename "$DISK")"
	ans="$(ask "Type ${BLD}${short}${RST} to confirm (anything else aborts): ")"
	[ "$ans" = "$short" ] || die "aborted — '$ans' did not match '$short'. Nothing was written."
fi

# --- download + verify --------------------------------------------------------
# $IMG_SHA came out of a manifest whose signature was verified above, so this
# check now chains the image to the root CA rather than to whatever the release
# page served.
IMG="$TMP/node.img.xz"
info "Downloading $IMG_URL"
curl -fL --progress-bar -o "$IMG" "$IMG_URL" || die "image download failed."
info "Verifying checksum against the signed manifest…"
got="$(sha256_of "$IMG")" || die "neither shasum nor sha256sum is available."
[ "$got" = "$IMG_SHA" ] || die "checksum MISMATCH — refusing to flash.\n  expected $IMG_SHA\n  got      $got"
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

# --- locate the seed FAT on the flashed disk — BY VOLUME LABEL, never by number
# The seed volume is the FAT labeled RASPUTIN-OS. Its partition NUMBER differs
# by board (rpi: p1 "selector"; n100: p2 — p1 is the hidden ESP), and the OS
# mounts it by label, so number-guessing strands the node: a seed written to
# the ESP verifies clean but firstboot only ever sees the real seed volume's
# baked blank template (bit the first two bootstrap bench runs, 2026-07-14).
seed_part_for() { # <disk> -> partition device carrying the RASPUTIN-OS FAT
	if [ "$OS" = "Darwin" ]; then
		local id vn
		for id in $(diskutil list "$1" 2>/dev/null | awk '{print $NF}' | grep "^${1#/dev/}s[0-9]*$"); do
			vn="$(diskutil info "/dev/$id" 2>/dev/null | awk -F': *' '/Volume Name/{print $2; exit}')"
			[ "$vn" = "RASPUTIN-OS" ] && { printf '/dev/%s\n' "$id"; return 0; }
		done
		return 1
	else
		lsblk -lnpo NAME,LABEL "$1" 2>/dev/null | awk '$2=="RASPUTIN-OS"{print $1; exit}' | grep . || return 1
	fi
}
PART=""
for attempt in 1 2 3 4 5; do
	PART="$(seed_part_for "$DISK" || true)"
	[ -n "$PART" ] && break
	sleep 1   # partition scan can lag the flash by a moment
done
[ -n "$PART" ] || die "no RASPUTIN-OS volume found on $DISK after flashing — can't place the seed. (Unexpected image layout? Re-run, and if it persists file a bug at github.com/${REPO_OWNER}/${OS_REPO}.)"
info "Seed volume: ${PART} (RASPUTIN-OS)"

# --- write the seed onto the seed FAT, then READ IT BACK ----------------------
SEED="RASPUTIN_NODE_ROLE=controlplane
RASPUTIN_CLUSTER_ID=$CLUSTER_ID
RASPUTIN_NODE_ID=$NODE_ID
RASPUTIN_SSH_AUTHORIZED_KEY=\"$SSH_KEY\"
"
SEED_FILE="$TMP/rasputin-seed.env"; printf '%s' "$SEED" > "$SEED_FILE"
READBACK="$TMP/readback.env"
write_and_verify_seed() {
	if [ "$OS" = "Darwin" ]; then
		# macOS: ALWAYS write through the kernel FS (mount-dance), never mcopy
		# against the raw device. macOS auto-mounts the freshly-flashed FAT
		# asynchronously seconds after dd; a raw-device write that races that
		# mount verifies clean on read-back and is then UN-WRITTEN at eject,
		# when the kernel flushes its stale cached FAT metadata over it (bit
		# the first bootstrap bench run, 2026-07-14 — node booted seedless).
		# Writing via diskutil mount keeps every byte cache-coherent; the
		# UNMOUNT + FRESH-MOUNT read-back still defeats the write cache.
		local mp="$TMP/mnt"; mkdir -p "$mp"
		diskutil unmount "$PART" >/dev/null 2>&1 || true   # clear any automount first
		diskutil mount -mountPoint "$mp" "$PART" >/dev/null 2>&1 || return 1
		cp "$SEED_FILE" "$mp/rasputin-seed.env" || return 1; sync
		diskutil unmount "$mp" >/dev/null 2>&1 || return 1
		diskutil mount -mountPoint "$mp" "$PART" >/dev/null 2>&1 || return 1
		cp "$mp/rasputin-seed.env" "$READBACK" 2>/dev/null || true
		diskutil unmount "$mp" >/dev/null 2>&1 || true
	elif have mcopy; then
		# Linux + mtools: block-level write (no FS cache between us and the
		# medium). Headless Linux doesn't automount, so the macOS race above
		# doesn't apply; a desktop automounter would reintroduce it, so make
		# sure nothing has grabbed the partition first.
		umount "$PART" 2>/dev/null || true
		mcopy -o -i "$PART" "$SEED_FILE" ::rasputin-seed.env || return 1
		rm -f "$READBACK"
		mcopy -n -i "$PART" ::rasputin-seed.env "$READBACK" || return 1
	else
		# Linux without mtools: same mount-dance — write, sync, UNMOUNT, then
		# MOUNT FRESH to read back from the medium.
		local mp="$TMP/mnt"; mkdir -p "$mp"
		mount "$PART" "$mp" || return 1
		cp "$SEED_FILE" "$mp/rasputin-seed.env" || return 1; sync
		umount "$mp" || return 1
		mount "$PART" "$mp" || return 1
		cp "$mp/rasputin-seed.env" "$READBACK" 2>/dev/null || true
		umount "$mp" || true
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
info "${GRN}${BLD}Done.${RST} Flashed Rasputin OS ${IMG_VERSION}, seeded as ${NODE_ID} (controlplane) in cluster ${BLD}${CLUSTER_ID}${RST}."
say   "      Seat the disk in the node and power it on. In a minute or two, open"
say   "      ${BLD}http://${CLUSTER_ID}.local${RST} — the first-run wizard takes it from there."
