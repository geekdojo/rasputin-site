---
lesson: firewalls.intermediate
---

## What you need

- **The beginner lesson,** [How a firewall decides](https://rasputin.geekdojo.com/learn/firewalls/beginner/).
  It covers zones, rules, default policies and why the first matching rule wins.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12 and BusyBox, a minimal Linux toolset,
  with the same output on all three. It was not tested on Windows.
- **`sh`, `printf`, `cat`, `cp`, `mv`, `grep` and `cksum`**, already part of macOS and Linux.
  Nothing to install, and no administrator rights.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. Changing a real
firewall needs administrator rights, so the lab builds one out of text files.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-openwrt-firewall/tree/2026.08.5) manages one
firewall running OpenWrt, an open-source operating system for routers. OpenWrt keeps its rules
in its own configuration files and ships its own admin web interface. So the same rules can be
changed from two places: from Rasputin, and on the box itself.

That raises two questions before any design. Where does the true copy of the rules live? And
when the box and that copy disagree, who decides which one is right?

## The decision, and what lost

You declare what you want, and Rasputin compares that with what the box runs. In the manual's
words, *"the tabs do not configure your firewall. They edit a list of intents on the control
plane."* An **intent** is one declared rule or port forward. `APPLY` compiles the list, pushes it
to the firewall and records a **fingerprint** of what it sent: a short value computed from the
content, which changes whenever the content does. `RECONCILE` fetches the fingerprint of what the
firewall is running and compares the two. When they differ, the state is `DRIFT`.

Reconcile reports drift; it does not repair it. The manual: *"Reconcile does not repair. In a
mode where Rasputin manages the firewall it is a read."* To keep a change made on the box, you
write it into an intent and apply. To discard it, you apply the intents you have.

| Alternative | Why it lost |
|---|---|
| Edit the firewall's own configuration directly | The firewall-integration design, an internal record, gives three reasons. The one this lesson is about: *"With direct UCI editing, drift would be 'the user changed it on purpose' 90% of the time and worth nothing as a signal."* UCI is OpenWrt's configuration system. The other two: intents survive a change of firewall software (*"the compiler changes, not the intents"*), and most people *"want a form"*, not a config file. |
| Let reconcile repair drift itself | The design keeps repair out of reconcile, which *"avoids the 'reconcile randomly mutated my config' surprise."* |
| Push each intent as soon as you save it | Not settled. The design lists it as an open question. |

## What it cost

**Keeping a change made on the box means typing it twice.** A rule or port forward changed in the
firewall's own interface shows as `DRIFT` at the next reconcile, which runs every five minutes by
default. Not every setting on the box is compared, so some changes never show as drift. The
manual: *"There is no 'adopt this change' button."* You recreate the change as an intent, then
apply.

**The list is not the firewall.** *"Delete does not un-push."* Deleting an intent removes it from
the list; the rule stays live on the box until the list is next applied. And an apply is not an
undo: *"nothing stores what the firewall held before."*

**Taking over costs the stock rules.** Rasputin owns the rule and port-forward sections outright,
and an apply replaces them wholesale, including the stock rules OpenWrt shipped with. Rasputin
re-creates three of them as ordinary intents, seeded at most once per cluster.

**Drift needed a precise definition.** On the first hardware bench, a firewall nobody had touched
showed as drifted, because its factory rules did not match the intents. The code's comment
records it: *"reconcile ran before any apply and the UI showed a drift banner on an untouched
firewall."* Drift now requires a prior apply, and a firewall Rasputin has never applied to reads
`PENDING`.

## What Rasputin does not do here

Rasputin never writes zones, default policies or the forwarding rules between zones. Rules run in
the order they were created, the first match wins, and the interface cannot reorder them. The
intrusion detection on the same box only detects; it never blocks, and no intent is enforced by
it. In *Join my existing network* mode, `APPLY` pushes nothing and reports success, and
`RECONCILE` is not a read: it idles the firewall node.

## Try it

You will build a firewall out of text files, change it by hand, and handle that change two ways:
repair it automatically, or flag it and decide.

**1. Make a sandbox.**

```
mkdir firewall-intents
cd firewall-intents
```

**2. Set up the box and your intents.**

```
printf '%s\n' 'Allow-DHCP-Renew wan fw 68 accept' 'Allow-Ping wan fw icmp accept' > firewall.txt
printf '%s\n' 'Allow-Ping wan fw icmp accept' 'block-mail lan wan 25 reject' > intents.txt
```

`firewall.txt` stands for what the firewall runs, starting with its stock rules. `intents.txt` is
your declared list. Each line is: name, from zone, to zone, port or protocol, action. `fw` means
the firewall itself.

**3. Write apply and status.** Paste the whole block at once:

```
cat > apply.sh <<'EOF'
cp intents.txt firewall.txt
cksum < firewall.txt > pushed.txt
echo "applied"
EOF
cat > status.sh <<'EOF'
if [ ! -f pushed.txt ]; then
  echo "PENDING: never applied"
elif [ "$(cksum < firewall.txt)" != "$(cat pushed.txt)" ]; then
  echo "DRIFT: the firewall changed since the last apply"
elif [ "$(cksum < intents.txt)" != "$(cat pushed.txt)" ]; then
  echo "PENDING: intents not applied yet"
else
  echo "IN SYNC"
fi
EOF
```

`cat > apply.sh <<'EOF'` writes every line up to `EOF` into the file. `cp` replaces the whole
file, as an apply replaces whole sections. `cksum < firewall.txt` prints a checksum and a size:
the fingerprint. `pushed.txt` keeps the fingerprint of what was last pushed. `status.sh` asks
three questions in order: was anything ever applied; does the firewall still match what was
pushed; do the intents? Drift is checked before pending, as in Rasputin.

**4. Check a firewall you have never applied to.** The two files differ. Predict the status:

```
sh status.sh
```

```
PENDING: never applied
```

The files disagree, but nothing was pushed, so there is nothing to have drifted from. Without the
first check, this script would repeat the bench's mistake.

**5. Apply.**

```
sh apply.sh
sh status.sh
cat firewall.txt
```

```
applied
IN SYNC
Allow-Ping wan fw icmp accept
block-mail lan wan 25 reject
```

`Allow-DHCP-Renew` is gone. Nobody deleted it: the apply replaced the whole file.

**6. Change the box by hand.** Suppose you open the firewall's own interface and add a rule on
purpose, to fix something tonight:

```
echo 'guest-dns guest fw 53 accept' >> firewall.txt
sh status.sh
```

```
DRIFT: the firewall changed since the last apply
```

`>>` adds a line to the end of a file.

**7. Option one: repair drift automatically.**

```
cat > autofix.sh <<'EOF'
case "$(sh status.sh)" in
  DRIFT*) sh apply.sh ;;
esac
sh status.sh
EOF
sh autofix.sh
grep -c guest firewall.txt
```

```
applied
IN SYNC
0
```

`case … DRIFT*)` runs the apply only when the status starts with `DRIFT`. `grep -c` counts
matching lines. The status is green, your fix is gone, and nothing records that it existed.

**8. Option two: flag it and decide.** Make the change again, then keep it by adding it to the
intents:

```
echo 'guest-dns guest fw 53 accept' >> firewall.txt
sh status.sh
echo 'guest-dns guest fw 53 accept' >> intents.txt
sh status.sh
sh apply.sh
sh status.sh
```

```
DRIFT: the firewall changed since the last apply
DRIFT: the firewall changed since the last apply
applied
IN SYNC
```

Look at the second line. The firewall and the intents now hold the same lines, yet the status
still says drift. It compares the firewall with what was pushed, and nobody pushed that rule.
Discarding the change instead would be `sh apply.sh` alone.

**9. Delete an intent.**

```
grep -v block-mail intents.txt > edited.txt
mv edited.txt intents.txt
sh status.sh
grep -c block-mail firewall.txt
sh apply.sh
grep -c block-mail firewall.txt
```

```
PENDING: intents not applied yet
1
applied
0
```

`grep -v` keeps every line that does not match, and `mv` puts the result back. The rule left your
list at once and left the firewall only at the apply.

**10. Clean up.**

```
cd ..
rm -rf firewall-intents
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `firewall-intents`.

## Check yourself

1. In step 5, what removed `Allow-DHCP-Renew`?
2. What breaks if `status.sh` checks pending before drift, and someone changes the box while you
   have edits you have not applied?
3. In step 8, once the rule was in `intents.txt` too, both files matched. Why is `DRIFT` still
   the right answer?
4. In Rasputin, you delete a port forward to close a port. Is the port closed?
5. A teammate proposes a nightly job that re-applies every firewall's intents "to keep them
   honest". What does it cost, and what would you run instead?

### Answers

1. The apply. It replaces the whole rule set, stock rules included.
2. The status reads `PENDING`, you apply, and the hand-made change is overwritten without ever
   having been shown to you.
3. Matching files are not the same as a pushed state. The rule reached the box by hand, and only
   an apply makes it part of what Rasputin pushed.
4. Not yet. The intent is gone, but the forward stays live until the intent list is next
   applied.
5. It is step 7 on a timer: every change made on a box is erased overnight, deliberate or not,
   with nothing recorded. Run the comparison on the timer and leave the apply to a person.

## Where to go next

- **The whole model, with its states:** [How the Firewall section works](https://rasputin.geekdojo.com/docs/the-firewall-intent-model/),
  in Rasputin's manual.
- **Writing a rule that fires:** [Write a firewall rule](https://rasputin.geekdojo.com/docs/write-a-firewall-rule/)
  covers rule order and the three seeded rules.
- **The code:** drift's definition in
  [`store.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/firewall/store.go),
  and the apply and reconcile steps in
  [`jobs.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/firewall/jobs.go).
