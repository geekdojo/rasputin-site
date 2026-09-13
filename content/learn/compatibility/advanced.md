---
lesson: compatibility.advanced
---

## What you need

- **The intermediate lesson,** [What an old reader does with a new field](https://rasputin.geekdojo.com/learn/compatibility/intermediate/).
  It covers why a catalog reader ignores unknown fields but refuses unknown `requires` capabilities
  and a higher `schemaVersion`. This lesson does not repeat that argument.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. Every step was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset, with the same output on all four. Nothing was tested on Windows.
- **`sh`, `awk`, `cat`, `cp`, `cksum` and `mkdir`**, already part of macOS and Linux. Nothing to
  install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## How it is built

Rasputin's app catalog is one JSON document, a **bundle**, holding every **tile** (one app's
description). The code that reads it lives in one Go module,
[`tileschema`](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5/tileschema). Two
programs import it: the catalog's publisher, before it releases a bundle, and the control plane,
before it adopts one. The decision record, ADR-0006, an internal document,
insists on one copy: two hand-maintained lists *"drift, and the drift is silent because each side
stays internally green."* It also records the limit: a cluster runs the validator it shipped
with, so *"a newer publish-time rule is not retroactively enforced on old clusters."*

When the control plane fetches a bundle,
[`catalogsync/store.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/catalogsync/store.go)
applies it in this order:

1. **Verify the signature over the bytes, before parsing anything.** A bundle that fails leaves
   the current catalog in place.
2. **Decode tolerantly.** Unknown fields are accepted; in
   [`bundle.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/tileschema/bundle.go),
   *"The must-understand escape hatch is Tile.Requires, not strict decoding."*
3. **Check the envelope, all or nothing:** `schemaVersion` no higher than this build knows, a
   positive `version`, at least one tile. *"A reader that cannot trust the schemaVersion, the monotonic version, or the JSON itself
   cannot be selective about the contents."*
4. **Judge each tile, and drop only the ones that fail.** In
   [`validate.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/tileschema/validate.go)
   the `requires` check runs first, against a fixed set of known capabilities. If every tile
   fails, the bundle is refused: *"Adopting nothing would replace a working catalog with a blank
   one and record it as success."*
5. **Refuse any version not strictly greater than the one in effect.** The version is a plain
   integer. In the code's words, the decision needs only *"a strict total order"*, and *"every
   additional bit of structure is a comparison bug waiting to happen."* The bundle's `publishedAt`
   time is displayed and never compared.
6. **Store the bytes exactly as published,** and report each refused tile with its reason.

There are two parse paths over one per-tile check. The strict path, for the publisher's own output
and the catalog built into the software image, fails on the first bad tile, because a bad tile
there is a build defect. The tolerant path, for fetched bundles, drops it. The code keeps a single
check so that *"Only the DISPOSITION differs."*

The set of known capabilities shipped empty. The code records why: *"the mechanism shipped before
its first user precisely so that an older control plane already knew to refuse a future tile it
could not reason about."* In the linked code it holds `privilege-tiers-v1` and `tile.web-port`.

**The other direction.** This is an old reader facing a new writer. A new reader facing an old
writer is the mirror case, and Rasputin handles it elsewhere with the opposite rule: when an older
agent cannot report something an update check needs, the verdict is *degraded* and labeled, not
failed ([Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#the-verify-contract)).
A missing field can be reported as unknown; an unknown restriction cannot be obeyed.

## Where it breaks

Each of these is in the linked public code or in a closed issue.

**One bad tile cost the whole catalog.** The first bundle reader validated strictly and returned on
the first bad tile. The fix, for an issue now closed, records the consequence: *"one malformed entry
cost a cluster its entire catalog and pinned it to whatever it already held."* No published bundle
could trigger it yet, because the publisher and the reader then compiled the same validator. It
had to be fixed before the first capability was added, because a current publisher would then
legitimately write tiles every older cluster must refuse. Per-tile refusal landed two days after
the bundle format, before any stable release carried either.

**The must-understand check was skipped for preview tiles.** It lived in the safety validator,
which runs only for tiles that can be installed. A preview tile, listed before it can be installed,
never reached it. The comment in `validate.go`: *"Coupling it to installability made a
must-understand rule quietly optional"*, for *"the one class of tile where the reader is most
likely to be older than the publisher."* It was moved to run first, for every tile, in the same fix.

**Filtering and signing disagree.** The signature covers the bytes as published. A reader that
drops tiles and then stores what it kept stores bytes the signature does not cover. The fix records
it as found while building: that *"would produce a pair that fails its own re-verification on the
next boot and drop the cluster to the floor"*, the catalog built into the image. A test,
`TestApply_PersistsThePublishedBytesNotTheFilteredCorpus`, guards it.

**A rename is not an addition.** Tiles marked their web interface with a `primary` port. The
contract renamed it `web`, in an issue now closed. Under tolerance, an older reader ignores `web`, sees
no primary port, and judges the tile by rules it no longer matches. The record notes that the old
reader's refusal would then read `exactly one port must be primary (found 0)`, which *"describes a
schema it no longer understands rather than saying so."* The code comment adds a worse case: a
reader that allowed a tile with no primary port, without knowing `web`, would load a web app with
*"no way to open it."* The fix was the `tile.web-port` capability, so an older reader refuses those
tiles and says why. Every tile in the catalog names it, so in practice such a reader refuses all of
them, refuses the bundle as a whole, and keeps the catalog it had.

**The download check was written backwards once.** Before fetching a bundle at all, the control
plane compares the version on offer with the one in effect. The comment in
[`catalogsync/sync.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/catalogsync/sync.go):
its first draft *"inverted the comparison, and skipped every genuine update"*, and the tests
caught it.

## What Rasputin does not do here

The catalog in effect is the most recently verified fetched bundle, or the built-in one if no
fetch has succeeded, *"Not a union, not a merge."* A refused tile stays refused until the cluster
runs software that understands it. An older cluster checks tiles with the rules it shipped with,
not the publisher's newer ones.

## Try it

You will build the reader's pipeline, then reintroduce three of the breaks above with a switch
named `BREAK`, and watch each one fail.

**1. Make a sandbox.**

```
mkdir catalog-reader
cd catalog-reader
```

**2. Write the loader.** Paste the whole block:

```
cat > load.sh <<'EOF'
b=$1
[ "$(cksum < "$b")" = "$(cat "$b.sig")" ] || { echo "refused: signature does not match"; exit 1; }
schema=$(awk '$1 == "schema" { print $2 }' "$b")
version=$(awk '$1 == "version" { print $2 }' "$b")
have=$(cat state/version 2>/dev/null || echo 0)
[ "$schema" -le 1 ] || { echo "refused whole bundle: schema $schema, this reader knows 1"; exit 1; }
awk -v known=" consent " -v brk="$BREAK" '
  function finish() {
    if (id == "") return
    if (unknown != "" && !(brk == "preview" && status == "preview"))
      { print "refused " id ": requires " unknown; refused++ }
    else
      { print "kept " id; kept++; out = out block }
  }
  $1 == "tile" { finish(); id = $2; status = "available"; unknown = ""; block = "" }
  id != "" { block = block $0 "\n" }
  $1 == "status" { status = $2 }
  $1 == "requires" && index(known, " " $2 " ") == 0 { unknown = $2 }
  END {
    finish()
    if (kept == 0) { print "refused whole bundle: every tile refused"; exit 1 }
    if (brk == "whole" && refused > 0) { print "refused whole bundle: a tile was refused"; exit 1 }
    printf "%s", out > "survivors"
  }
' "$b" || exit 1
[ "$version" -gt "$have" ] || { echo "refused: v$version does not supersede v$have"; exit 1; }
mkdir -p state
if [ "$BREAK" = "survivors" ]; then cp survivors state/current; else cp "$b" state/current; fi
cp "$b.sig" state/current.sig
echo "$version" > state/version
echo "adopted v$version"
EOF
```

It follows the order above. `cksum` prints a checksum, standing in for the signature: it proves
the bytes are unchanged, not who wrote them. `-le` is less than or equal, `-gt` greater than, and
`||` runs the refusal when a test fails. In `awk`, each `tile` line starts a tile, and `finish()`
judges the one before it, copying its lines into `out` if kept. `index` checks a `requires` entry
against the one capability this reader knows, `consent`. The last lines store the result in
`state`.

`BREAK` does nothing unless you set it: `whole` refuses the bundle when any tile fails, `preview`
skips the check for preview tiles, and `survivors` stores the kept tiles instead of the published
bytes.

**3. Write the boot check.** A restart verifies the stored catalog again:

```
cat > boot.sh <<'EOF'
if [ "$(cksum < state/current)" = "$(cat state/current.sig)" ]; then
  echo "boot: catalog v$(cat state/version) verified"
else
  echo "boot: stored catalog fails its check, using the built-in catalog"
fi
EOF
```

**4. Publish a bundle.** Three tiles: one ordinary, one needing a capability this reader knows,
and one preview tile needing a capability it does not:

```
cat > v1 <<'EOF'
schema 1
version 1
tile notes
tile photos
requires consent
tile radio
status preview
requires radio-v1
EOF
cksum < v1 > v1.sig
```

**5. Load it, restart, and load it again.**

```
sh load.sh v1
sh boot.sh
sh load.sh v1
```

```
kept notes
kept photos
refused radio: requires radio-v1
adopted v1
boot: catalog v1 verified
kept notes
kept photos
refused radio: requires radio-v1
refused: v1 does not supersede v1
```

The reader kept what it understood, judged the tiles again, and then refused the same version. In
the next steps, `rm -rf state` wipes the stored catalog so each break starts fresh.

**6. Break it: judge the bundle, not the tile.**

```
rm -rf state
BREAK=whole sh load.sh v1
```

```
kept notes
kept photos
refused radio: requires radio-v1
refused whole bundle: a tile was refused
```

Nothing was adopted, though `notes` and `photos` were fine. A cluster would keep whatever catalog
it had before, however old.

**7. Break it: check only what can be installed.** Predict what happens to `radio`:

```
rm -rf state
BREAK=preview sh load.sh v1
```

```
kept notes
kept photos
kept radio
adopted v1
```

A tile the reader cannot understand was kept, with no message. It is the tile most likely to be
newer than the reader.

**8. Break it: store what you kept.** Predict what the restart says:

```
rm -rf state
BREAK=survivors sh load.sh v1
sh boot.sh
```

```
kept notes
kept photos
refused radio: requires radio-v1
adopted v1
boot: stored catalog fails its check, using the built-in catalog
```

The load looked perfect. The failure appears only on restart, when the bytes no longer match the
signature, and the cluster falls back to the built-in catalog.

**9. Start again from a good catalog, then publish a bundle where every tile fails.**

```
rm -rf state
sh load.sh v1
cat > v2 <<'EOF'
schema 1
version 2
tile radio
requires radio-v1
EOF
cksum < v2 > v2.sig
sh load.sh v2
```

```
kept notes
kept photos
refused radio: requires radio-v1
adopted v1
refused radio: requires radio-v1
refused whole bundle: every tile refused
```

**10. Publish a bundle with a newer schema.**

```
cat > v3 <<'EOF'
schema 2
version 3
tile notes
EOF
cksum < v3 > v3.sig
sh load.sh v3
cat state/version
```

```
refused whole bundle: schema 2, this reader knows 1
1
```

Neither bundle replaced the catalog in effect, still version 1.

**11. Clean up.**

```
cd ..
rm -rf catalog-reader
```

`rm -rf` deletes the folder and everything in it without asking. It cannot
be undone, so check you typed `catalog-reader`.

## Check yourself

1. Why is the envelope all or nothing, while tiles are judged one at a time?
2. What breaks if the must-understand check runs only for tiles that can be installed?
3. What breaks if the reader stores the tiles it kept instead of the bytes it verified?
4. Why is the version compared as an integer, and never by `publishedAt`?
5. A new reader meets a bundle from an older writer that lacks a field the reader now uses. Should
   it refuse, or degrade and say so?

### Answers

1. If the reader cannot trust the schema, the version or the document itself, it has no basis for
   trusting its judgment of any tile. A bad tile says nothing about the others.
2. Preview tiles naming an unknown capability load without comment, as in step 7.
3. The stored bytes no longer match the signature, so the next restart falls back to the built-in
   catalog, as in step 8.
4. The gate needs one strict order, and an integer has exactly one. The code records that
   ordering by timestamp *"would reintroduce the rollback the Version gate closes."*
5. Degrade and say so, if the reader can act safely without the field. A missing field can be
   reported as unknown. Refusal is for fields that restrict what the reader may do.

## Where to go next

- **What an owner sees:** refused tiles and the forward-only rule in
  [Install an app](https://rasputin.geekdojo.com/docs/install-an-app/#what-the-catalog-is).
- **The mirror case:** [Know whether an update worked](https://rasputin.geekdojo.com/docs/know-whether-an-update-worked/#the-verify-contract).
- **The code:** [`tileschema/bundle.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/tileschema/bundle.go)
  and [`catalogsync/store.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/catalogsync/store.go),
  with their tests beside them.
