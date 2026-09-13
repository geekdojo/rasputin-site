---
lesson: compatibility.intermediate
---

## What you need

- **The beginner lesson** [Why software has version numbers](https://rasputin.geekdojo.com/learn/version-numbers/beginner/).
  It covers release labels and how a program decides which one is newer. There is no beginner
  lesson on compatibility; this is where the topic starts.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset, with the same output on all four. It was not tested on Windows.
- **`sh`, `awk`, `cat`, `echo` and `printf`**, already part of macOS and Linux. Nothing to
  install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

A **format** is an agreed way to write data down, and its **schema** is the list of **fields**
it may contain. The program that produces the data is the **writer**; the program that consumes
it is the **reader**. **Compatibility** is what happens when the two were built at different
times, and one of them knows fields the other does not.

[Rasputin](https://github.com/geekdojo/rasputin-control-plane), a system for running a small
group of computers at home, offers apps from a catalog. Each app is a **tile**: a small file
describing it. The catalog used to be compiled into the control-plane software, so the schema and
its reader always shipped together. The decision record, ADR-0006, an internal document, names
what that bought: *"schema drift is structurally impossible."*

The catalog then moved to its own release stream, so a new app no longer waits for a software
release. The same record names the price: *"a bundle published on Tuesday is read by control
planes of many vintages."* Now the writer is often newer than the reader.

## The decision, and what lost

The catalog carries a `schemaVersion`, a number that changes only when the format changes
incompatibly. A reader that meets a higher number than it knows refuses the whole new catalog and
keeps the one it had. Otherwise, a reader ignores fields it does not know.

The record then says why that is not enough. If a new field *restricts* something, *"an older
control plane silently ignoring it installs the tile without the restriction."* So a tile may also
carry a **`requires`** list, naming **capabilities**: features a reader must understand to handle
the tile safely. *"A control plane that does not understand every entry refuses that tile"*, and
the rest of the catalog loads. The record names its model, the `crit` header in JSON Web
Signatures, and states the principle: ignoring what you do not understand *"is right for additive
metadata and catastrophic for constraints."*

| Alternative | Why it lost |
|---|---|
| Keep the catalog compiled into the software | No compatibility problem, but adding an app waits for a software release. The record calls *"Upgrade your firmware to get new apps"* *"a NAS-vendor experience."* |
| Ignore every unknown field, with no `requires` | A restriction becomes a no-op on older readers. |
| Refuse any tile with an unknown field | *"makes every additive change a breaking one, which in practice freezes the schema."* |
| Raise `schemaVersion` for every restriction | Not weighed in the record. It would refuse whole catalogs, and the record treats more than one such raise a year as a sign the `requires` mechanism *"is not doing its job"*. |

The first capability to ship was `privilege-tiers-v1`, named by any tile that takes more access to
its machine than an ordinary app. Rasputin's manual states the result: a tile *"that declares
something this build does not understand is refused rather than installed without the badge,
constraint or consent prompt that goes with it."*

## What it cost

**A contract with no end date.** The record: *"A compatibility contract now exists and must be
maintained forever. Every schema change is a compatibility question, and the answer is no longer
'recompile'."*

**Owners of older clusters do not see new apps that need something their build does not
understand.** The manual's advice for a missing tile is to check the list of refused tiles, then *"Update the cluster."*

**The writer has to judge every change.** A capability protects only when the writer names it,
and names it only where it is needed. The code records the second half: a tile with ordinary
access does not name `privilege-tiers-v1`, because requiring it everywhere *"would make every tile
already in the field refused by every cluster already in the field."* For the first half,
Rasputin does not rely on memory: its shared validator refuses a tile that takes more than
ordinary access without naming `privilege-tiers-v1`. A capability with no such check depends on
the writer remembering, as step 5 shows.

## What Rasputin does not do here

A catalog cannot be downgraded. In the manual's words, *"Catalog versions move forward only, and a
downgrade is refused"*, even for an older catalog Rasputin signed, because it pins older app
images. A bad catalog is fixed by publishing a newer one. A new catalog does not change apps
already installed.

## Try it

You will build one reader with three policies, then change the catalog the way a newer writer
would.

**1. Make a sandbox with a two-tile catalog.**

```
mkdir old-reader
cd old-reader
mkdir catalog
printf 'name Notes\nport 8080\n' > catalog/notes
printf 'name Photos\nport 8081\n' > catalog/photos
echo 1 > schema
```

`printf` writes its text with `\n` as a line break. Each tile is a file of lines, a field name then
a value. This reader knows two fields, `name` and `port`, and schema 1.

**2. Write the reader.** Paste the whole block:

```
cat > read.sh <<'EOF'
mode=$1
if [ "$(cat schema)" -gt 1 ]; then
  echo "$mode: refused the whole catalog, schema $(cat schema)"
  exit 1
fi
for tile in catalog/*; do
  awk -v mode="$mode" -v id="${tile#catalog/}" '
    $1 == "name" || $1 == "port" { next }
    $1 == "requires" && mode == "must" { bad = "does not understand " $2; next }
    mode == "strict" && bad == "" { bad = "unknown field " $1 }
    END { if (bad) print mode ": " id " refused, " bad; else print mode ": " id " offered" }
  ' "$tile"
done
EOF
echo 'for mode in tolerant strict must; do sh read.sh "$mode"; done' > all.sh
```

`$1` is the policy: `tolerant` ignores unknown fields, `strict` refuses a tile with any, and
`must` ignores them but refuses a tile that requires a capability. This reader knows none.
`${tile#catalog/}` strips the folder from the file name. `awk` skips known fields with `next`, and
at the `END` of each file prints the verdict. `-gt` means greater than. `all.sh` runs all three.

**3. Read the catalog.**

```
sh all.sh
```

```
tolerant: notes offered
tolerant: photos offered
strict: notes offered
strict: photos offered
must: notes offered
must: photos offered
```

**4. The writer adds a field that only informs.**

```
echo "screenshot notes.png" >> catalog/notes
sh all.sh
```

```
tolerant: notes offered
tolerant: photos offered
strict: notes refused, unknown field screenshot
strict: photos offered
must: notes offered
must: photos offered
```

The strict reader lost an app over a picture. Every new field would do the same until every reader
updated, which is why that policy freezes a schema.

**5. The writer adds a restriction.** `consent host-access` means: ask the owner before installing,
because this app reaches the machine itself. Predict what `must` says about `photos`:

```
echo "consent host-access" >> catalog/photos
sh all.sh
```

```
tolerant: notes offered
tolerant: photos offered
strict: notes refused, unknown field screenshot
strict: photos refused, unknown field consent
must: notes offered
must: photos offered
```

The `must` reader offered `photos` exactly as the tolerant one did, and would install it without
asking. A must-understand policy does nothing until the writer says what must be understood.

**6. The writer declares it.**

```
echo "requires consent" >> catalog/photos
sh all.sh
```

```
tolerant: notes offered
tolerant: photos offered
strict: notes refused, unknown field screenshot
strict: photos refused, unknown field consent
must: notes offered
must: photos refused, does not understand consent
```

Only `must` gets both right: the screenshot is ignored, the restriction is refused, and the rest
of the catalog loads. The tolerant reader still offers `photos`: `requires` protects only readers
built to read it.

**7. Declare it everywhere, to be safe.**

```
echo "requires consent" >> catalog/notes
sh read.sh must
```

```
must: notes refused, does not understand consent
must: photos refused, does not understand consent
```

`notes` needs no consent, and an old reader now refuses it anyway.

**8. Change the format incompatibly.**

```
echo 2 > schema
sh all.sh
```

```
tolerant: refused the whole catalog, schema 2
strict: refused the whole catalog, schema 2
must: refused the whole catalog, schema 2
```

A schema number cannot say which tiles are affected, so every policy refuses all of them,
including the two that did not change. Rasputin keeps the catalog it already had when this happens.

**9. Clean up.**

```
cd ..
rm -rf old-reader
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check you
typed `old-reader`.

## Check yourself

1. Why did the strict reader refuse `notes` in step 4, and what would that do to a format over a
   year of changes?
2. What breaks if a writer adds a restriction and forgets `requires`?
3. Why not put `requires` on every tile?
4. An owner's cluster is older than the catalog, and an app they expected is missing. What do they
   see, and what fixes it?
5. A catalog release has a bad tile. Can the publisher roll back to the previous catalog?

### Answers

1. It had a field the reader did not know. Every new field would remove apps from every older
   reader, so writers would stop adding fields.
2. Older must-understand readers ignore it and offer the app without the restriction, as in step
   5. A check at publish time that refuses the omission is what prevents it.
3. Older readers would refuse tiles that need nothing new, as in step 7.
4. The tile is listed as refused, with the reason. Updating the cluster brings it in.
5. No. Catalog versions move forward only, so the fix is a newer catalog.

## Where to go next

- **What an owner sees:** [Install an app](https://rasputin.geekdojo.com/docs/install-an-app/#what-the-catalog-is),
  in Rasputin's manual, including refused tiles and the forward-only rule.
- **The code:** the `requires` field and the list of known capabilities in
  [`tileschema/tile.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/tileschema/tile.go).
