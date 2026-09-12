---
lesson: intrusion-detection.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 and on Ubuntu Linux 24.04. It was not
  tested on Windows.
- **`printf`, `tee`, `grep`, `awk` and `wc`**, small commands that are already part of macOS
  and Linux. Nothing to install. To check, type `printf '%s\n' 'grep works' | grep works` and
  press Return. You should see `grep works`. The only difference between the two systems is
  that macOS's `wc` puts spaces before its number.

You do not need Rasputin hardware, Rasputin code, or an account anywhere. A real intrusion
detection engine needs administrator rights to watch network traffic, so this lab builds a
model of one instead.

## The idea

Network traffic is made of **connections**: one machine reaching a **port**, a number that says
which service on another machine it wants. Port 443 is secure web pages. Port 23 is Telnet, an
old remote-login service that sends passwords unencrypted, so a connection to it is worth a
person's attention.

An **intrusion detection system (IDS)** watches traffic and compares it with **rules**:
descriptions of traffic worth attention. When traffic matches, it writes an **alert**, a line
saying what matched, when, and between which addresses. An IDS usually watches a **copy** of the
traffic, taken from a **tap**, a point that copies packets to it. The traffic itself carries on,
matched or not.

An **intrusion prevention system (IPS)** sits **inline**: traffic passes through it, so it can
stop what matches.

The difference is where the system sits, not how clever its rules are. An IDS is not in the
traffic's path, so what matches still arrives, and a wrong rule costs you extra alerts to read.
An IPS can stop traffic, and a wrong rule stops traffic you wanted. An alert does not, by
itself, tell you anything was stopped.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. Its firewall runs Snort 3, an open-source intrusion detection engine,
on a tap. The firewall's
[setup script](https://github.com/geekdojo/rasputin-openwrt-firewall/blob/2026.08.5/files/etc/uci-defaults/99-rasputin)
sets Snort's action to `alert`, noting that even when a rule says `drop` or `block`, *"snort
only logs."* The [manual](https://rasputin.geekdojo.com/docs/the-firewall-intent-model/) says
it flatly: it *"watches traffic and raises alerts, and it never blocks."*

Snort writes each alert as one line, in the same shape as the alert you will build in step 3.
A small [parser](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/agent/internal/ids/parser.go)
reads those lines and passes them to Rasputin's interface.

## Try it

You will write some traffic, run it past a detector, then past a preventer, and compare what
arrives.

**1. Make a sandbox.**

```
mkdir ids-lab
cd ids-lab
```

`mkdir` makes a new, empty folder, and `cd` moves you into it.

**2. Write some traffic.**

```
printf '%s\n' '198.51.100.7:50514 -> 203.0.113.10:443' '198.51.100.8:52300 -> 203.0.113.10:443' '198.51.100.9:50611 -> 203.0.113.10:23' '198.51.100.23:50712 -> 203.0.113.10:80' > traffic.txt
```

`printf '%s\n'` prints each quoted piece on its own line, and `>` saves them in `traffic.txt`.
Each line is one connection: source address and port, then destination address and port. The
addresses are reserved for examples, so they belong to no real machine. One connection goes to
port 23.

**3. Write the alert.** Paste all three lines at once:

```
cat > alert.awk <<'EOF'
{ print "09/12-10:15:02.000000 [**] [1:1000001:1] \"LAB Telnet connection\" [**] [Priority: 2] {TCP} " $0 }
EOF
```

This saves everything up to `EOF` in `alert.awk`: a line of awk that prints Snort 3's alert
shape with the matched connection, `$0`, on the end. The time is fixed so your output matches.

**4. Detect.** Predict: the Telnet connection matches. Does it still arrive?

```
tee delivered.txt < traffic.txt | grep ':23$' | awk -f alert.awk > alerts.txt
cat alerts.txt
wc -l delivered.txt
```

```
09/12-10:15:02.000000 [**] [1:1000001:1] "LAB Telnet connection" [**] [Priority: 2] {TCP} 198.51.100.9:50611 -> 203.0.113.10:23
4 delivered.txt
```

`< traffic.txt` feeds the traffic in. `tee delivered.txt` writes every line to `delivered.txt`,
standing in for the destination, and passes a copy along the `|`. That copy is the tap. `grep
':23$'` keeps lines ending in `:23` (`$` means end of line), and awk turns each into an alert.
`wc -l` counts lines. On macOS, `wc` puts spaces before the number. One alert, and all four
connections arrived, the Telnet one included.

**5. Prevent.**

```
grep -v ':23$' traffic.txt > delivered.txt
wc -l delivered.txt
```

```
3 delivered.txt
```

`-v` keeps the lines that do *not* match. The rule now sits in the path, and the Telnet
connection never arrives.

**6. Make a careless rule.** Someone writes the rule as just `23`. Predict how many connections
arrive:

```
grep -v '23' traffic.txt > delivered.txt
wc -l delivered.txt
grep '23' traffic.txt | wc -l
```

```
1 delivered.txt
3
```

`23` also appears in port `52300` and in address `198.51.100.23`. As a preventer, the mistake
stopped two ordinary web connections. As a detector, the same mistake gives three alerts to read,
and nothing is lost.

**7. Read the alert** from step 4, left to right:

- `09/12-10:15:02.000000`: month/day, then the time to the millionth of a second. By default
  there is no year.
- `[1:1000001:1]`: generator (the part of Snort that raised it), rule number, and rule revision.
  The rule number is how you look a rule up.
- `"LAB Telnet connection"`: the rule's message.
- `[Priority: 2]`: Snort's [own description](https://github.com/snort3/snort3/blob/3.12.2.0/src/ips_options/ips_priority.cc)
  says 1 is the highest priority. Many alerts also show `[Classification: ...]` just before it.
- `{TCP}`, then source `->` destination.

Nothing in this line says the connection was stopped. A Snort set to block adds a word such as
`[drop]` after the time when it stopped the traffic. Rasputin's Snort only alerts, so its lines
never say that.

**8. Clean up.**

```
cd ..
rm -rf ids-lab
```

`rm -rf` deletes the folder and everything in it, without asking. It cannot be undone, so check
you typed `ids-lab`.

## Check yourself

1. In step 4, `alerts.txt` held an alert for the Telnet connection. Did that connection arrive?
2. In step 6, what did the careless rule cost as a preventer, and what as a detector?
3. Rasputin shows an intrusion detection alert for a connection. Did its intrusion detection
   stop that connection?

### Answers

1. Yes. `delivered.txt` held all four lines. A detector writes alerts; the traffic carries on.
2. As a preventer, two ordinary connections. As a detector, two extra alerts to read.
3. No. It is detection-only and never blocks. Whether traffic passes is decided by the
   firewall's rules.

## Where to go next

- **What decides traffic instead:** [How the Firewall section works](https://rasputin.geekdojo.com/docs/the-firewall-intent-model/),
  in Rasputin's manual, covers the firewall rules and states the intrusion detection's limit.
- **Opening a port:** [Forward a port](https://rasputin.geekdojo.com/docs/forward-a-port/) says a
  port forward protects nothing, and that the intrusion detection will not stop anything that
  comes through it.
- **The code:** the alert
  [parser](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/agent/internal/ids/parser.go)
  in the public `rasputin-control-plane` repository.
