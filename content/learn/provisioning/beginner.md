---
lesson: provisioning.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Debian 12 Linux. It was not tested
  on Windows.
- **`sh`, `mkdir`, `cat`, `printf`, `cp`, `ls` and `rm`**, commands that are already part of
  macOS and Linux. Nothing to install, and no administrator rights needed. `sh`, which runs a
  script, is bash on macOS and dash on Debian; this lesson's script printed the same with both.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

A **control plane** is the computer that manages a group of other machines: it keeps the list
of members and tells each one what to do. Each machine it manages is a **node**.

A new node starts out knowing none of that. Many systems **flash** the same **image**, a
ready-made copy of the operating system, onto every machine's drive; to flash is to write an
image onto a drive. One image is easier to build and test than one per job, so two new machines
start out identical.

**Provisioning** is the step that makes one of them specific. It gives a new machine three
things:

- **An identity:** a name that is unique in the group, such as `node-1`, so the control plane
  can tell this machine from every other.
- **A role:** the job it will do, such as serving web pages or holding a database.
- **A way to reach the control plane:** its address, and usually a **credential**, a secret
  that proves the machine is allowed to join.

Often all three arrive in a small file put on the drive before the machine first starts. It is
called a **seed file**, because the machine grows the rest of its setup from it.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. Its control plane and the machines that run apps start from the
same system image. Rasputin's provisioning design, which is not public, puts the consequence
plainly: *"A freshly-flashed node has no idea whether it's a controlplane or a compute node."*

What tells it is a short text file on its drive, the **enrollment file**, read on first boot.
It carries the machine's role, its node id, the cluster's name, the address the machine reports
to, a key that lets you log in to it, and a **join token**: the credential that lets the
machine become a member. Rasputin's [manual](https://rasputin.geekdojo.com/docs/add-a-node/) is
direct about that file: you are shown it once, and you should treat it the way you would treat
a password.

## Try it

You will make a pretend control plane and two pretend machines out of folders, write one boot
script that both machines share, and provision them by hand.

**1. Make a sandbox.** Run these one at a time:

```
mkdir provision-lab
cd provision-lab
mkdir controlplane machine-a machine-b
```

`mkdir` makes new, empty folders, and `cd` moves you into one. The `controlplane` folder stands
in for the control plane: a machine reports in by writing a file there. The two `machine-`
folders stand in for two new drives.

**2. Write the image.** Copy all nine lines at once, from `cat` down to the last `END`:

```
cat > boot.sh <<'END'
if [ ! -f "$1/seed.env" ]; then
  echo "$1: no seed file, so no identity. Stopping."
  exit 1
fi
. "./$1/seed.env"
echo "$1 is $NODE_ID, role $ROLE, reporting to $CONTROL_PLANE"
echo "$ROLE, running on $1" > "$CONTROL_PLANE/$NODE_ID"
END
```

`cat > boot.sh <<'END'` saves the lines that follow into a file named `boot.sh`, up to the line
that says only `END`. This script is your image: every machine runs the same one. `$1` is the
machine's folder name, which you give when you run it. The script stops if that folder has no
`seed.env`. Otherwise `.` reads the seed's settings, and `$NODE_ID`, `$ROLE` and
`$CONTROL_PLANE` become the values the seed set. The last line writes the report, in a file
named after the machine's identity.

**3. Start a machine nobody provisioned.**

```
sh boot.sh machine-a
ls -1 controlplane
```

```
machine-a: no seed file, so no identity. Stopping.
```

`sh boot.sh machine-a` runs the script for `machine-a`. `ls -1 controlplane` lists what has
reported in, one name per line (`-1` is the digit one), and prints nothing. The image is on the drive, and the control plane does not know
the machine exists.

**4. Provision it.**

```
printf 'NODE_ID=node-1\nROLE=web\nCONTROL_PLANE=controlplane\n' > machine-a/seed.env
cat machine-a/seed.env
```

```
NODE_ID=node-1
ROLE=web
CONTROL_PLANE=controlplane
```

`printf` prints the text, turning each `\n` into a new line, and `>` saves it as
`machine-a/seed.env`. The three lines are an identity, a role, and where to report. Here the
control plane is reached by a folder name; a real seed holds a network address and a credential.
Start the machine again:

```
sh boot.sh machine-a
ls -1 controlplane
```

```
machine-a is node-1, role web, reporting to controlplane
node-1
```

One machine, one node.

**5. Provision the second machine the quick way.** Copy the seed that worked:

```
cp machine-a/seed.env machine-b/
```

`cp` copies a file into a folder. Predict: once `machine-b` starts, how many nodes will the
control plane list?

```
sh boot.sh machine-b
ls -1 controlplane
cat controlplane/node-1
```

```
machine-b is node-1, role web, reporting to controlplane
node-1
web, running on machine-b
```

Still one. Both machines are running, and both are `node-1`. `machine-b` wrote its report over
`machine-a`'s, so the control plane's record now describes `machine-b` alone, and nothing
printed an error. This pretend control plane took the
second report without complaint. A name is unique only if the file carrying it, and any
credential in it, is used once.

**6. Give the second machine its own identity, and a different role.**

```
printf 'NODE_ID=node-2\nROLE=database\nCONTROL_PLANE=controlplane\n' > machine-b/seed.env
sh boot.sh machine-b
sh boot.sh machine-a
ls -1 controlplane
cat controlplane/node-1 controlplane/node-2
```

```
machine-b is node-2, role database, reporting to controlplane
machine-a is node-1, role web, reporting to controlplane
node-1
node-2
web, running on machine-a
database, running on machine-b
```

`>` replaces the old seed. Until `machine-a` reported again, `node-1` still said `machine-b`.

**7. Clean up.**

```
cd ..
rm -rf provision-lab
```

`rm` deletes; `-r` includes everything inside the folder, and `-f` skips the questions. It cannot
be undone, so check you typed `provision-lab`.

## Check yourself

1. In steps 3 and 4, `machine-a` ran the same script. What changed between them?
2. In step 5, which of the three things provisioning gives did the copy break?
3. You have just added a machine to a Rasputin cluster, and a copy of its enrollment file is
   still on your laptop. What should you do with it?

### Answers

1. Only the seed file. The image never changed; the seed gave it an identity, a role and a place
   to report.
2. The identity. The role and the way to reach the control plane both worked, which is why
   nothing looked wrong.
3. Delete it once the machine is up, as the manual says. The file holds a join token, a
   credential, so treat it like a password.

## Where to go next

- **Adding a machine:** [Add a node](https://rasputin.geekdojo.com/docs/add-a-node/), in
  Rasputin's manual, walks through making an enrollment file and flashing it onto a drive.
- **Every line of a seed file:** [Provisioning & the seed file](https://rasputin.geekdojo.com/docs/provisioning/)
  lists each setting a Rasputin machine reads on first boot.
