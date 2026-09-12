---
lesson: firewalls.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu Linux 24.04. It was not
  tested on Windows.
- **`awk`**, a small tool for reading text one line at a time, and **`printf`**, which prints
  text. Both are already part of macOS and Linux; nothing to install. To check awk, type
  `awk 'BEGIN { print "awk works" }'` and press Return. You should see `awk works`. macOS and
  Linux ship different versions of awk; every command here gave the same output on both.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. Changing a real
firewall needs administrator rights, so this lab builds a model of one instead.

## The idea

Data crosses a network in small pieces called **packets**. Each packet is labeled with where it
came from and where it is going, including a **port**: a number that says which service it is
for. Port 443 is for secure web pages; port 25 is for sending email between mail servers.

A **firewall** decides whether traffic may pass. It reads a **rule list**. Each rule is a
condition and an action: **accept** (let it through), **reject** (block it and tell the sender)
or **drop** (block it and say nothing).

On many firewalls, rules are written between **zones**. A zone is a named group of networks the
firewall treats alike: `wan` is the internet side, `lan` is your own network, and a home might
add `iot` for smart plugs and cameras. A rule from `lan` to `wan` covers every device in `lan`.

Two things decide what happens to a packet:

- **The first matching rule wins.** The firewall reads from the top and stops at the first rule
  that fits. Rules below it are never consulted for that packet.
- **The default policy** decides any packet that no rule fits.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. It manages one firewall running OpenWrt, an open-source operating
system for routers, built in the public
[`rasputin-openwrt-firewall`](https://github.com/geekdojo/rasputin-openwrt-firewall/tree/2026.08.5)
repository.

Its [manual](https://rasputin.geekdojo.com/docs/write-a-firewall-rule/) says rules are
*"evaluated top to bottom, and the first one that matches a packet decides its fate."* Rasputin
orders them by when you created them, and they cannot be reordered in its interface. So a broad
`accept` created last month beats a narrow block created today for the same traffic. Rasputin
leaves the firewall's zones and default policies as they were; it never writes them.

## Try it

You will write a rule list, then a few lines of awk that check a packet against it the way a
firewall does: in order, stopping at the first match.

**1. Make a sandbox.**

```
mkdir firewall-lab
cd firewall-lab
```

`mkdir` makes a new, empty folder, and `cd` moves you into it.

**2. Write a rule list.**

```
printf '%s\n' '1 lan wan any accept' '2 iot wan 443 accept' '3 lan wan 25 reject' > rules.txt
```

`printf '%s\n'` prints each quoted piece on its own line, and `>` saves them in `rules.txt`. Each
line is a rule: number, from zone, to zone, port (`any` matches every port), action. Rule 3 is
meant to stop your network sending email straight out on port 25.

**3. Write the checker.** Paste all eight lines at once:

```
cat > match.awk <<'EOF'
$2 == from && $3 == to && ($4 == "any" || $4 == port) {
  print "rule " $1 ": " $5
  found = 1
  exit
}
END { if (!found) print "no rule matched: default " policy }
EOF
```

This saves everything up to the line `EOF` in `match.awk`. awk reads `rules.txt` a line at a
time and calls its columns `$1` to `$5`. The first line is the condition: zones and port fit.
When they do, it prints the rule's number and action, and `exit` stops reading. That one word is
first-match-wins. `END` runs last and, if nothing matched, prints the default policy.

**4. Check a packet.**

```
awk -v from=lan -v to=wan -v port=443 -v policy=drop -f match.awk rules.txt
```

```
rule 1: accept
```

Each `-v` gives the checker a value: from `lan`, to `wan`, port 443, default policy `drop`.
`-f match.awk` names the checker. A laptop loading a web page is let through by rule 1.

**5. Predict, then check.** A laptop on `lan` sends email out on port 25. Rule 3 says reject.
Write down what you expect, then run:

```
awk -v from=lan -v to=wan -v port=25 -v policy=drop -f match.awk rules.txt
```

```
rule 1: accept
```

Accepted. Rule 1 covers every port from `lan` to `wan` and comes first, so the checker never
reaches rule 3. Rule 3 is in the list, looks correct, and decides nothing.

**6. Send a packet no rule covers.** A camera on `iot` tries to reach port 80 on `lan`:

```
awk -v from=iot -v to=lan -v port=80 -v policy=drop -f match.awk rules.txt
awk -v from=iot -v to=lan -v port=80 -v policy=accept -f match.awk rules.txt
```

```
no rule matched: default drop
no rule matched: default accept
```

Same packet, same rules, opposite results. No rule mentions `iot` to `lan`, so the default
policy alone decides.

**7. Fix the order.** Rewrite the list with the narrow rule first, and check both packets again:

```
printf '%s\n' '1 lan wan 25 reject' '2 lan wan any accept' '3 iot wan 443 accept' > rules.txt
awk -v from=lan -v to=wan -v port=25 -v policy=drop -f match.awk rules.txt
awk -v from=lan -v to=wan -v port=443 -v policy=drop -f match.awk rules.txt
```

```
rule 1: reject
rule 2: accept
```

Email is now rejected, and web traffic still reaches rule 2. Only the order changed.

**8. Clean up.**

```
cd ..
rm -rf firewall-lab
```

`rm -rf` deletes the folder and everything in it, without asking. It cannot be undone, so check
you typed `firewall-lab`.

## Check yourself

1. In step 5, rule 3 matched the packet too. Why did it decide nothing?
2. With the list from step 2 and a default of `drop`, what happens to a packet from `iot` to
   `wan` on port 80?
3. In Rasputin, you created a broad `accept` from `lan` to `wan` last month. Today you add a
   block from `lan` to `wan` for one port. Which rule decides that traffic?

### Answers

1. Rule 1 matched first, and the first match wins.
2. It is dropped. Rule 2 covers only port 443, so no rule matches and the default decides.
3. The `accept`. Rasputin orders rules by when they were created, and its interface cannot move
   them, so the older rule comes first. The manual's workaround is to delete the older rule and
   recreate it after the new one.

## Where to go next

- **Writing a real rule:** [Write a firewall rule](https://rasputin.geekdojo.com/docs/write-a-firewall-rule/),
  in Rasputin's manual, covers rule order, `reject` against `drop`, and why a new block does not
  stop a connection already running.
- **What Rasputin leaves alone:** [How the Firewall section works](https://rasputin.geekdojo.com/docs/the-firewall-intent-model/)
  lists the parts of the firewall Rasputin writes and the parts it never touches.
- **The code:** the public
  [`rasputin-openwrt-firewall`](https://github.com/geekdojo/rasputin-openwrt-firewall/tree/2026.08.5)
  repository.
