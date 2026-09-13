---
lesson: system-shape.intermediate
---

## What you need

- **The beginner lesson,** [The parts of a small distributed system](https://rasputin.geekdojo.com/learn/system-shape/beginner/).
  It covers the control plane, the nodes and the agent.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Ubuntu 24.04 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `mkdir`, `echo`, `cat`, `cp`, `ls`, `touch`, `grep` and `rm`**, already part of macOS
  and Linux. Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-os/blob/2026.08.5/README.md) runs two kinds of
ordinary machine: a control plane, which also runs the web interface and the API behind it, and
compute nodes, which run apps. Both run Rasputin's own operating system, built for two processor
families: arm64 for the Raspberry Pi, and amd64 for Intel and AMD machines.

An **image** is a complete, ready-to-write copy of an operating system and its software. A
**role** is the job a machine does in the cluster. Every image has to be built, tested and
published, and a change to software that every machine runs, such as the agent, reaches them
only through a new build of every image that carries it.

## The decision, and what lost

Rasputin builds one image per architecture, and a machine learns its role when it first starts.
The OS images design, an internal record, begins from the obvious alternative: *"The instinct is
'one image per role'"*. Its table of settled decisions answers it in one row: *"No — one image
per arch, role at runtime"*, because it *"Halves the build matrix; same rootfs everywhere."* A
**build matrix** is every combination a pipeline has to build. The **rootfs**, or root file
system, is the set of files the system runs from. That row, and a short framing line, *"role is
runtime config, not a separate image"*, are the whole recorded argument.

The role arrives in a **seed file** written onto the machine's storage before its first boot,
and [the manual](https://rasputin.geekdojo.com/docs/provisioning/) says it is read once, on first
boot. The API ships on every image. What keeps it off a compute node is a **gate**, a condition
checked before a service starts: first boot leaves a marker file on a control plane, and the
API starts only where that file exists.

One alternative lost: **one image per role** needs twice the builds for the same software, which
is the record's reason. A second, **one image for every machine, firewall included**, was never
weighed: a separate decision chose OpenWrt, a different operating system with its own build
tools, for the firewall. The design calls the firewall *"the genuine exception to 'one OS.'"*

## What it cost

The design lists no costs for this choice. The two below are incidents recorded in other internal
notes. Connecting them to the single image is this lesson's reading, not the record's.

**Every machine carries every service, so the gate does the work, and only a real boot tests
it.** The API's first gate checked an environment variable. The service manager checks that kind
of condition against its own environment, which never holds the values from the seed, so, in the
provisioning design's words, *"the api could not have started on any role"*. The automated boot
test in the OS build checked only that the system reached its normal running state. The first
boot on real hardware found it. The corrected service file keeps a comment explaining the mistake.

**A build-time default reaches every role at once.** The design meant first boot to switch the
API on, on the control plane only. That could not work on a read-only system, and the failure
changed nothing, because a build step that enables services by default had already switched the
API on for every role. The image-build design now warns against that step: *"it once silently
enabled the api on every role"*. At the release this lesson describes, that default still enables
the API on every image, and the marker gate alone keeps it from starting on a compute node, as
the [build script](https://github.com/geekdojo/rasputin-os/blob/2026.08.5/board/rasputin/common/post-build.sh)
says.

## What Rasputin does not do here

The seed is read once, on first boot, and a seed with no role stops first boot rather than
guessing one. A node image never becomes a firewall: that role has its own image. The storage
role is not available in this release.

## Try it

You will build both options, boot two machines from each, then break the gate twice.

**1. Make a sandbox.**

```
mkdir image-lab
cd image-lab
```

**2. Write two services.** Each service file holds one line: its gate.

```
mkdir services
echo 'always' > services/agent
echo 'marker role.controlplane' > services/api
```

`always` means start on every machine. `marker role.controlplane` means start only where a file
of that name is on the machine's disk.

**3. Build both options.** Paste the whole block at once:

```
cat > build-per-role.sh <<'EOF'
for arch in arm64 amd64; do
  for role in controlplane compute; do
    mkdir -p "per-role/$arch-$role"
    cp services/agent "per-role/$arch-$role/"
    if [ "$role" = controlplane ]; then
      cp services/api "per-role/$arch-$role/"
    fi
  done
done
EOF
cat > build-single.sh <<'EOF'
for arch in arm64 amd64; do
  mkdir -p "single/$arch"
  cp services/* "single/$arch/"
done
EOF
```

`cat > file <<'EOF'` writes every line up to `EOF` into the file. `for arch in arm64 amd64`
repeats its body once per architecture. `mkdir -p` makes a folder, and its parents, without
complaining if it already exists. Now build:

```
sh build-per-role.sh
sh build-single.sh
ls -1 per-role single
```

```
per-role:
amd64-compute
amd64-controlplane
arm64-compute
arm64-controlplane

single:
amd64
arm64
```

`ls -1` lists one name per line; without `-1`, a terminal shows them in columns. Four images
against two, for the same two services.

**4. Write the boot program.** It reads each service's gate and decides:

```
cat > boot.sh <<'EOF'
for svc in "$1"/*; do
  read -r gate value < "$svc"
  result=skipped
  [ "$gate" = always ] && result=started
  [ "$gate" = marker ] && [ -e "$2/$value" ] && result=started
  [ "$gate" = env ] && [ "$ROLE" = "$value" ] && result=started
  echo "$2: $result ${svc##*/}"
done
EOF
```

`$1` is the image and `$2` is the disk. `read -r gate value` puts a line's first word in `gate`
and the rest in `value`. Each `[ … ] && result=started` line changes the result only if its test
passes; `-e` tests that a file exists. `${svc##*/}` is the file's name without its folder.

**5. Make two disks, and boot them from each option.**

```
mkdir disk-1 disk-2
echo 'ROLE=controlplane' > disk-1/node.env
echo 'ROLE=compute' > disk-2/node.env
touch disk-1/role.controlplane
```

`node.env` holds the role each seed gave. `touch` makes the empty marker file, as first boot does
on a control plane.

```
sh boot.sh per-role/arm64-controlplane disk-1
sh boot.sh per-role/arm64-compute disk-2
sh boot.sh single/arm64 disk-1
sh boot.sh single/arm64 disk-2
```

```
disk-1: started agent
disk-1: started api
disk-2: started agent
disk-1: started agent
disk-1: started api
disk-2: started agent
disk-2: skipped api
```

The compute image has no API to start. The single image carries it to both disks, and the marker
decides. With one image per role, listing an image tells you what a machine will run. With one
image, you also have to read the disk.

**6. Gate on the environment instead.** Disk 1's `node.env` says `controlplane`. Predict: does
the API start there?

```
echo 'env controlplane' > services/api
sh build-single.sh
sh boot.sh single/arm64 disk-1
sh boot.sh single/arm64 disk-2
```

```
disk-1: started agent
disk-1: skipped api
disk-2: started agent
disk-2: skipped api
```

Skipped on both. The gate read `$ROLE` from the boot program's own environment, and nothing ever
loaded `node.env` into it. The value is right, and in the wrong place. That is the shape of the
API's first gate.

**7. Drop the gate, and test one role.**

```
echo 'always' > services/api
sh build-single.sh
sh boot.sh single/arm64 disk-1 | grep -c 'started api'
```

`|` sends the output to `grep`, and `-c` counts the matching lines.

```
1
```

A test that boots only a control plane passes. Now the other disk:

```
sh boot.sh single/arm64 disk-2
```

```
disk-2: started agent
disk-2: started api
```

The compute node runs the API. Both disks booted the same image, so a test of one role proves
nothing about the other.

**8. Clean up.**

```
cd ..
rm -rf image-lab
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `image-lab`.

## Check yourself

1. Add a third architecture. How many images does each option build?
2. In step 6, why did disk 1 skip the API when its `node.env` said `controlplane`?
3. What breaks if the API's gate is lost from the single image and the automated test boots only
   a control plane?
4. A new service must run only on compute nodes. What does the single image need that one image
   per role does not?

### Answers

1. Six per role, three for the single image. The per-role count grows with every role you add;
   the single image's does not.
2. The gate looked in the boot program's environment, and `node.env` was never loaded there. The
   service manager's environment and the seed's values are two different places.
3. The API starts on every compute node, and the test still passes, because the image is the same
   on every role and the test looked at only one.
4. A gate on the service, and something at first boot that leaves the marker the gate checks, on
   compute nodes only. A per-role image would simply leave the service out of the control-plane
   image.

## Where to go next

- **The seed file, key by key:** [Provisioning](https://rasputin.geekdojo.com/docs/provisioning/),
  in Rasputin's manual.
- **Choosing a role and an architecture:** [Add a node](https://rasputin.geekdojo.com/docs/add-a-node/).
- **The code:** the build step that enables services, and the comment naming the API's gate, in
  [`post-build.sh`](https://github.com/geekdojo/rasputin-os/blob/2026.08.5/board/rasputin/common/post-build.sh).
