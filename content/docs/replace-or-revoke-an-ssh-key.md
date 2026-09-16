---
title: "Replace or revoke an SSH key on a node"
description: "Change the SSH key a node that is already enrolled accepts: add the new key, prove it works, remove the old one, and the extra step a firewall needs so the old key does not come back."
weight: 33
applies-to: "2026.08.5"
---

The key under **Settings → Operator SSH key** is written into the enrollment file of each node you
add after you save it. A node that is already enrolled keeps the key it was enrolled with, and
nothing you change in Settings reaches it. To replace or remove that key you edit a file on the
node itself, over SSH. This page is that edit. Do it on each node, one node at a time.

## Before you start

**You need a way in that works now:** a key the node already accepts. If you have none, the only
ways in are the node's local console or enrolling it again — see
[Add a node](/docs/add-a-node/#seed-an-ssh-key-while-you-still-can).

**You need a terminal on macOS or Linux with `ssh`.** Run `ssh -V`; it prints a version if the
SSH client is installed. macOS ships with it. On Debian or Ubuntu, this installs it (`sudo` asks
for your administrator password):

```
sudo apt install openssh-client
```

**Each node keeps its keys in one file**, one key per line:

| Node | File |
| --- | --- |
| Control plane or compute node | `/var/lib/rasputin/dropbear/authorized_keys` |
| Firewall | `/etc/dropbear/authorized_keys` |

The commands below use the control plane and compute path. **On a firewall, use
`/etc/dropbear/authorized_keys` everywhere they say `/var/lib/rasputin/dropbear/authorized_keys`.**

**The placeholders.** Replace each one, angle brackets included:

- `<node-address>` — the node's address on your network right now. For a compute node,
  `ping -c 1 <node-id>.local` prints it in parentheses on its first line (`-c 1` sends one
  ping); for the control plane, ping `<cluster-id>.local`. If your computer is on the network
  behind a firewall node, that firewall's address is the gateway address your computer was given.
  If a name does not resolve, find the node in your router's DHCP lease list. **Look the address
  up again each time:** a node can come back from a reboot on a different address.
- `<new-public-key-file>` and `<new-private-key-file>` — the two halves of the key you are
  moving to, for example `~/.ssh/id_ed25519_new.pub` and `~/.ssh/id_ed25519_new`. The public
  half ends in `.pub`; the private half never leaves your computer. To make a new pair, see
  **You do not have a new key yet** under [Troubleshooting](#troubleshooting).
- `<old-key-comment>` — the text at the end of the old key's line, such as `you@old-laptop`.
  Step 3 shows you the lines to pick it from.
- `<old-private-key-file>` — the private half of the old key, used only to prove in step 6 that
  it no longer works. Skip that check if you no longer have it.

**Revoking a key without adding one?** If the node already accepts another key you are keeping,
skip steps 1 and 2 and use that key's private file wherever this page says
`<new-private-key-file>`.

## Do this

1. **Add the new key while the old one still works.**

   ```
   ssh root@<node-address> 'cat >> /var/lib/rasputin/dropbear/authorized_keys' < <new-public-key-file>
   ```

   It takes effect at once. Nothing needs restarting.

2. **Prove the new key logs in before you remove anything.** This prints nothing and returns you
   to your prompt when it works. **If it fails, stop here** — the old key still works, and the
   node is unchanged apart from the extra line.

   ```
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> true
   ```

3. **Find the old key's line and check its comment matches only that line.** The first command
   lists every key the node accepts. The second must print `1`.

   ```
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> 'cat /var/lib/rasputin/dropbear/authorized_keys'
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> 'grep -cF " <old-key-comment>" /var/lib/rasputin/dropbear/authorized_keys'
   ```

4. **Remove the old key's line, logged in with the new key.**

   ```
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> 'F=/var/lib/rasputin/dropbear/authorized_keys; grep -vF " <old-key-comment>" "$F" > "$F.new" && chmod 600 "$F.new" && mv "$F.new" "$F"'
   ```

5. **On a firewall only, stop the old key coming back.** Check whether the firewall's own seed
   still carries the key you just removed. If this prints `1`, run the second command, which
   blanks that line; if it prints `0`, skip it.

   ```
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> 'grep -cF " <old-key-comment>" /etc/rasputin/seed.env'
   ssh -o IdentitiesOnly=yes -i <new-private-key-file> root@<node-address> 'F=/etc/rasputin/seed.env; sed "s/^RASPUTIN_SSH_AUTHORIZED_KEY=.*/RASPUTIN_SSH_AUTHORIZED_KEY=/" "$F" > "$F.new" && chmod 600 "$F.new" && mv "$F.new" "$F"'
   ```

6. **Prove the old key is refused**, if you still have it.

   ```
   ssh -o IdentitiesOnly=yes -i <old-private-key-file> root@<node-address> true
   ```

   The login must fail with:

   ```
   root@<node-address>: Permission denied (publickey).
   ```

   Run the second command from step 3 again as well: it should now print `0`.

7. **Close every session that is still logged in with the old key.** Removing the line stops new
   logins only.

8. **Repeat for the next node.**

## What each part of the commands does

- `ssh root@<node-address>` logs in to the node as `root`, the account Rasputin's SSH keys are
  for. Text after the address, in single quotes, is a command that runs **on the node**, not on
  your computer.
- `< <new-public-key-file>` (step 1) feeds your public key file into that command, and
  `cat` with `>>` appends what it is fed to the end of the file. Two `>` characters append; one
  would replace the whole file.
- `-i <new-private-key-file>` tells `ssh` which private key to log in with.
- `-o IdentitiesOnly=yes` tells `ssh` to offer **only** that key. Without it, `ssh` also tries
  every other key your computer holds, so a login could succeed with the old key and prove
  nothing about the new one.
- `true` is a command that does nothing and succeeds, so the login is the whole test.
- `grep -cF " <old-key-comment>" <file>` counts the lines containing that text. `-c` prints a
  count instead of the lines, and `-F` treats the text as plain characters rather than a pattern.
  The space before the comment is deliberate: a comment is separated from the key by a space.
- `grep -vF " <old-key-comment>" "$F" > "$F.new"` (step 4) writes every line **except** the ones
  containing that text into a new file beside the original. `-v` means "lines that do not match".
  `F=...;` only saves typing the path three times.
- `chmod 600 "$F.new"` makes the new file readable and writable by `root` only, as the original
  was.
- `mv "$F.new" "$F"` puts the new file in place of the original in one step. Each `&&` runs the
  next command only if the one before it succeeded, so a failure leaves the original untouched.
- `sed "s/…/…/"` (step 5) finds the line that starts with `RASPUTIN_SSH_AUTHORIZED_KEY=` and
  writes it back with nothing after the `=`, so it carries no key. Every other line is copied
  as it was, into the new file that `chmod` and `mv` then put in place.

## Where a node's keys live, and what puts one back

**What it protects.** A Rasputin node's SSH server accepts keys only — no passwords — and the
file in the table above is the whole list of keys it accepts. The server reads that file on every
login attempt, so a key you add works at once and a key you remove is refused at the next login,
with no restart. The file is on the node's persistent storage, so the change survives a reboot.

**What it does not protect.**

- **A session that is already open stays open** after you remove its key. Removing the line
  refuses new logins; it ends nothing. Close your own sessions; any session you cannot close ends
  when the node reboots.
- **Settings does not reach this file.** Replacing or clearing the key under **Settings →
  Operator SSH key** changes what future enrollment files carry. It adds no key to, and removes no
  key from, a node that is already enrolled.
- **A firewall re-adds the key from its seed.** A firewall keeps its enrollment settings in
  `/etc/rasputin/seed.env`, and its seed step, `/usr/lib/rasputin/apply-seed`, adds the key
  written there to `/etc/dropbear/authorized_keys` whenever it runs, if that key is missing. Both
  files are on the list of files the firewall keeps across a `sysupgrade`. That is why step 5
  blanks the key in the seed: otherwise a key you removed can come back. A control plane or
  compute node reads the key from its enrollment file only during first boot, and never adds it
  again once the node has provisioned.

**The consequence of each choice.** The order of the steps is what keeps you able to log in:
the new key is added and proven before the old one is removed, and the old key is removed while
you are logged in with the new one. Removing a key before a replacement is proven can leave a
node with no key you hold, and then the only ways in are its local console or enrolling it again.
Checking that the comment matches exactly one line matters for the same reason: step 4 removes
**every** line containing that text.

**What you cannot take back.** A removed line is gone from the node. To undo it, add the key again
with step 1, logged in with a key that still works. If removing the text would leave the file with
no lines at all, step 4 changes nothing: `grep` reports failure when it has nothing to write, and
the `&&` stops there. It leaves an empty `authorized_keys.new` beside the file, which the SSH
server ignores.

## Troubleshooting

**Step 2 fails with a "Permission denied" error.**
The node does not accept the new key. Check that step 1 sent the file ending in `.pub`, and that
`-i` in step 2 names the private half of the same pair. List the node's keys with the first
command in step 3 to see what arrived. Do not go on to step 4 until step 2 works. If `ssh` asks
for a passphrase, that is the passphrase you set on your own key file, not a password for the
node.

**The count in step 3 is `0`, or more than `1`.**
`0`: the comment is not in the file as you typed it — copy it from the listing, including its
case. More than `1`: another line contains the same text, and step 4 would remove all of them. Use a
longer piece of the old line that no other line contains, such as the last dozen characters of
its long middle part, in place of `<old-key-comment>` in steps 3 to 5, and drop the leading
space.

**The old key has no comment.**
Use a piece of the long middle part of its line instead, as in the previous answer.

**`ssh` cannot resolve the name, or the connection times out.**
Look the address up again: the node may have come back from a reboot on a different one. If the
`.local` name does not resolve at all, use the address from your router's DHCP lease list.

**The old key logs in to a firewall again after you removed it.**
The firewall's seed still carried it and the seed step has run since. Do step 5, then steps 3
and 4 again.

**You do not have a new key yet.**
Make one on your own computer:

```
ssh-keygen -t ed25519 -C <comment> -f ~/.ssh/id_ed25519_new
```

`-t ed25519` chooses the key type. `-C <comment>` sets the text written at the end of the public
key's line — something that tells you later which computer it belongs to, such as
`you@new-laptop`. `-f` names the private key file; the public half is written beside it with
`.pub` added. It asks for a passphrase, which protects the private file on your computer. If a
file of that name already exists it asks `Overwrite (y/n)?` — answer `n` and pick another name,
or you lose the key in that file.
