---
lesson: intrusion-detection.intermediate
---

## What you need

- **The beginner lesson,** [Detecting traffic is not stopping it](https://rasputin.geekdojo.com/learn/intrusion-detection/beginner/).
  It covers taps, inline prevention, and reading a Snort alert line.
- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. The lab was run on macOS 15, Debian 12, Ubuntu 24.04 and BusyBox, a minimal
  Linux toolset, with the same output on all four. It was not tested on Windows.
- **`sh`, `awk` and `printf`**, already part of macOS and Linux. Nothing to install, and no
  administrator rights.

You do not need Rasputin hardware, Rasputin code, Snort, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-openwrt-firewall)'s firewall is one small box
that routes a home network's traffic to the internet. Intrusion detection had to run on that same
box, though that is inference, not record. The **forwarding path** is the route a packet takes
through the box on its way somewhere else.

The engine could go in one of two places. **Inline**, every packet waits in the forwarding path
until it has been inspected, so the inspector can stop it. On a **tap**, the inspector reads a
copy, and the packet carries on without it.

Snort 3 arrived as a package in the OpenWrt release the firewall moved to, and tap mode is an
option of that package.

## The decision, and what lost

Rasputin runs Snort 3 on a tap, detection-only. The firewall's setup script keeps the package's
default `method=pcap`, which reads copies of packets, and sets `action=alert`, which makes Snort
only log even when a rule says drop. Its comment calls this "the belt-and-suspenders safety".

A published devlog, Devlog 9, states the trade. Inline, every packet waits on inspection, and the
inspector's capacity becomes a limit on everything passing through. A tap gives that up: *"it
cannot stop an attack, and it cannot get in the way of traffic either."* The reason is Bryce's,
in the same post: *"at this early, pre-alpha stage, I can't reliably back up prevention at useful
speeds."*

| Alternative | Why it lost |
|---|---|
| Inline prevention on the firewall | Prevention at useful speeds could not be backed up at this stage |
| Suricata, another engine, built with OpenWrt's own build kit | Named in the firewall image design, an internal record, with no reason given |
| An engine run in a container | Named in the same line, with no reason given |

The record does not weigh the last two. A plausible reason they lost, and this is inference, not
record: Snort 3 was already a package with tap mode built in, and both alternatives meant
building or running something extra on the firewall.

## What it cost

**It cannot stop anything.** In the manual's words, the intrusion detection *"watches traffic
and raises alerts, and it never blocks."* Devlog 9, on the detection test: *"a test that checks
for a dropped packet would be testing a claim we do not make."*

**Every alert is about traffic that already arrived.** In the devlog's words, *"the packets it
inspects have already been forwarded."*

**The rules arrive with the image.** The same decision built a rule set, Cisco Talos's Snort 3
Community Rules, into the firewall image at a pinned checksum. New Community Rules reach a
firewall only when an operator deploys a new firewall release. The public roadmap lists rules *"that
update independently of image releases"* as later work.

## What Rasputin does not do here

The intrusion detection never blocks. Nothing on the Firewall tabs turns it into a blocker, and no
rule you write there is enforced by it. Rasputin publishes no throughput figures for its
firewall.

## Try it

You will build a tiny model of both placements, feed them the same burst of traffic, and see
what each one gives up when inspection cannot keep up.

The model counts time in **ticks**. In each tick the inspector can check `cap` packets, and a
queue holds `room` packets waiting their turn. Inline, packets wait in that queue, and a packet
with no room is dropped. On a tap, packets are delivered as they arrive, and only the copies
queue; a copy with no room is never inspected. The numbers are invented. They say nothing about
how fast any real inspector is.

**1. Make a sandbox.**

```
mkdir ids-choice
cd ids-choice
```

**2. Write the traffic.** Each line is a tick, a kind of packet, and how many arrive:

```
printf '%s\n' '1 web 2' '2 web 2' '3 attack 1' '3 web 7' '4 web 2' '5 web 1' > traffic.txt
```

Tick 3 is a burst: one attack, then seven ordinary web packets.

**3. Write the model.** Paste the whole block at once:

```
cat > model.awk <<'EOF'
{ for (i = 0; i < $3; i++) { n++; tick[n] = $1; kind[n] = $2 } }
END {
  first = 1; last = 0; p = 0
  for (t = 1; t <= 6; t++) {
    while (p < n && tick[p + 1] == t) {
      p++
      if (mode == "tap" && kind[p] == "web") sent++
      if (mode == "tap" && kind[p] == "attack") print "tick " t ": attack delivered"
      if (last - first + 1 < room) q[++last] = p
      else if (mode == "tap") unseen++
      else if (kind[p] == "web") dropped++
      else print "tick " t ": attack dropped, queue full"
    }
    for (c = 0; c < cap && first <= last; c++) {
      k = q[first++]
      if (kind[k] == "attack") print "tick " t ": alert" (mode == "inline" ? " [drop]" : "")
      else if (mode == "inline") {
        sent++
        if (t - tick[k] > wait) wait = t - tick[k]
      }
    }
  }
  printf "%s: %d web delivered, %d dropped, longest wait %d, %d never inspected\n", mode, sent, dropped, wait, unseen
}
EOF
```

The first line turns each line of traffic into single packets. Then, tick by tick, the `while`
loop takes that tick's arrivals: a tap delivers them at once, and every packet or copy joins the
queue `q` if there is room. The `for` loop inspects up to `cap` from the front of the queue. An
inspected attack raises an alert, which inline marks `[drop]`, the way Snort marks a packet it
stopped. `wait` is the most whole ticks any web packet spent queued.

**4. Run both on the burst.** Predict: which one delivers all 14 web packets?

```
awk -v mode=inline -v cap=3 -v room=4 -f model.awk traffic.txt
awk -v mode=tap -v cap=3 -v room=4 -f model.awk traffic.txt
```

`-v` hands a value to the model before it starts.

```
tick 3: alert [drop]
inline: 10 web delivered, 4 dropped, longest wait 1, 0 never inspected
tick 3: attack delivered
tick 3: alert
tap: 14 web delivered, 0 dropped, longest wait 0, 4 never inspected
```

Inline stopped the attack. The burst also cost four ordinary packets, and some others waited a
tick. The tap delivered everything, the attack included, and its alert describes a packet that
had already arrived. Four copies were never inspected.

**5. Put the attack at the end of the burst.** Same packets, different order. Predict: does the
tap still raise an alert?

```
printf '%s\n' '1 web 2' '2 web 2' '3 web 7' '3 attack 1' '4 web 2' '5 web 1' > traffic.txt
awk -v mode=inline -v cap=3 -v room=4 -f model.awk traffic.txt
awk -v mode=tap -v cap=3 -v room=4 -f model.awk traffic.txt
```

```
tick 3: attack dropped, queue full
inline: 11 web delivered, 3 dropped, longest wait 1, 0 never inspected
tick 3: attack delivered
tap: 14 web delivered, 0 dropped, longest wait 0, 4 never inspected
```

Inline never inspected the attack. It was dropped for the same reason as three ordinary packets:
there was no room. The tap delivered it and raised nothing. The attack's copy is one of the four
never inspected, and that count is the only sign. When inspection falls behind, this model's
inline pays in traffic and a tap pays in what it sees. This inline fails closed, the default for a
Linux packet queue; an inline engine can instead fail open, passing what it has no room for
uninspected.

**6. Give the inspector enough capacity.**

```
awk -v mode=inline -v cap=8 -v room=8 -f model.awk traffic.txt
awk -v mode=tap -v cap=8 -v room=8 -f model.awk traffic.txt
```

```
tick 3: alert [drop]
inline: 14 web delivered, 0 dropped, longest wait 0, 0 never inspected
tick 3: attack delivered
tick 3: alert
tap: 14 web delivered, 0 dropped, longest wait 0, 0 never inspected
```

With room to spare, inline wins on every line: nothing lost, and the attack stopped. The tap still
delivered the attack. So the choice turns on whether you can show the inspector keeps up with
everything passing through, which is the question Rasputin's decision says it cannot yet answer.

**7. Clean up.**

```
cd ..
rm -rf ids-choice
```

`rm -rf` deletes the folder and everything in it without asking. It cannot be undone, so check
you typed `ids-choice`.

## Check yourself

1. In step 4, what did the burst cost inline, and what did it cost the tap?
2. In step 5, inline reported the attack dropped. Did its rules stop it?
3. What breaks if you move an inspector inline on a link busier than it can inspect?
4. Rasputin shows an intrusion detection alert. Was that traffic stopped, and had it already
   arrived?
5. You have measured that your own firewall's inspector keeps up with your link. What does
   inline still cost you that a tap does not?

### Answers

1. Inline lost four ordinary packets and delayed others. The tap lost nothing in traffic, but
   four copies went uninspected, and its alert came after the attack was delivered.
2. No. It was never inspected; it was dropped because the queue was full, like ordinary packets.
3. Everything passing through waits. Failing closed, what does not fit is dropped, wanted traffic
   included; failing open, it passes uninspected.
4. It was not stopped, and it had already been forwarded. Rasputin's intrusion detection never
   blocks.
5. Its capacity stays a limit on everything passing through. If traffic grows past what you
   measured, you are back in steps 4 and 5.

## Where to go next

- **What decides traffic instead:** [How the Firewall section works](https://rasputin.geekdojo.com/docs/the-firewall-intent-model/),
  in Rasputin's manual.
- **Opening a port:** [Forward a port](https://rasputin.geekdojo.com/docs/forward-a-port/) says the
  intrusion detection will not stop anything that comes through a forward.
- **The code:** the firewall's
  [setup script](https://github.com/geekdojo/rasputin-openwrt-firewall/blob/2026.08.5/files/etc/uci-defaults/99-rasputin),
  which keeps the package's tap mode and sets `action=alert`, and the
  [rule fetcher](https://github.com/geekdojo/rasputin-openwrt-firewall/blob/2026.08.5/scripts/fetch-snort-rules.sh)
  with its pinned checksum.
