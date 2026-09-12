---
lesson: monitoring.beginner
---

## What you need

- **A terminal on macOS or Linux.** On Windows, WSL (Windows Subsystem for Linux) gives you a
  Linux terminal. This lesson was tested on macOS 15 in zsh, and on Debian 12 Linux in bash. It
  was not tested on Windows.
- **`sh`, `date`, `sleep`, `mv`, `tail`, `grep`, `kill`, `cat`, `mkdir` and `rm`**, commands
  that are already part of macOS and Linux. Nothing to install, and no administrator rights needed.

You do not need Rasputin hardware, Rasputin code, or an account anywhere.

## The idea

**Monitoring** means having machines report on themselves. Three kinds of report are common,
and each answers a different question.

- A **heartbeat** is a short "still here" message a program sends on a fixed schedule, such as
  every 10 seconds. What matters is that it arrives. It answers: *is it still running?*
- A **metric** is a number measured again and again: how busy the processor is, how many jobs
  are waiting. It answers: *how much, right now?*
- A **log line** is a sentence a program writes when something happens: "finished batch 2",
  "could not open file". It answers: *what happened, and when?*

A heartbeat is judged by how long it has been missing. One late report is noise; many in a row
is a signal. So a monitor usually has an in-between state, **stale**, before it calls something
**offline**.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home. On each machine a small program, its **agent**, sends a heartbeat
to the **control plane**, the computer that manages the others, every 10 seconds. The control
plane shows a machine as `ONLINE` if it heard one in the last 30 seconds, `STALE` after that,
and `OFFLINE` once two minutes pass. The heartbeat travels over the **bus**, the connection each
agent keeps to the control plane for its reports and commands.

Then it checks a second, separate source: the mesh, a private network every machine joins. If
the mesh can still see the machine, the state reads `OFF BUS` instead of `OFFLINE`. The [code](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/inventory/presence.go)
says it in one sentence: *"The machine is reachable; its agent is not on the bus."*

## Try it

You will run a program that writes all three kinds of report, stop it, and see which one
notices.

**1. Make a sandbox.**

```
mkdir monitor-lab
cd monitor-lab
```

`mkdir` makes a new, empty folder, and `cd` moves you into it.

**2. Write the program.** Copy all thirteen lines at once, from `cat` down to the last `END`:

```
cat > worker.sh <<'END'
n=0
while [ "$n" -lt 600 ]; do
  n=$((n + 1))
  date +%s > heartbeat.new
  mv heartbeat.new heartbeat
  echo "$(date +%H:%M:%S) jobs_waiting=$((n % 7))" >> metrics.txt
  if [ $((n % 5)) -eq 0 ]; then
    echo "$(date +%H:%M:%S) INFO finished batch $((n / 5))" >> log.txt
  fi
  sleep 1
done
END
```

`cat > worker.sh <<'END'` saves the lines that follow into `worker.sh`, up to the line that
says only `END`. The loop runs while `n` is less than (`-lt`) 600, pausing a second each pass
(`sleep 1`), so it ends after ten minutes. Each pass writes a heartbeat and a metric line.
`$(( ))` does arithmetic, and `%` gives a remainder, so on every fifth pass, when `n % 5`
equals (`-eq`) 0, it also writes a log line. `$( )` puts a command's output in its place.
`date +%s` prints the time as seconds since January 1, 1970, and `date +%H:%M:%S` as hours,
minutes and seconds. `>` replaces a file, `>>` adds to its end, and `mv` swaps the new heartbeat
in, so `heartbeat` is never left empty.

**3. Write the monitor.** Copy all ten lines:

```
cat > check.sh <<'END'
age=$(( $(date +%s) - $(cat heartbeat) ))
if [ "$age" -lt 3 ]; then
  echo "ONLINE: last heartbeat ${age}s ago"
elif [ "$age" -lt 12 ]; then
  echo "STALE: last heartbeat ${age}s ago"
else
  echo "OFFLINE: last heartbeat ${age}s ago"
fi
END
```

It subtracts the heartbeat's time from the current time and says `ONLINE` under 3 seconds,
`STALE` under 12, and `OFFLINE` after that.

**4. Start the program in the background.**

```
sh worker.sh &
```

`&` runs it in the background, so you keep your prompt. Your shell prints a job number and a
process number, such as `[1] 48213`; yours will differ. Wait about ten seconds.

**5. Read all three reports.**

```
cat heartbeat
tail -n 3 metrics.txt
tail -n 3 log.txt
sh check.sh
```

`tail -n 3` shows a file's last three lines. On 2026-09-12 this printed:

```
1789244579
13:22:57 jobs_waiting=3
13:22:58 jobs_waiting=4
13:22:59 jobs_waiting=5
13:22:52 INFO finished batch 1
13:22:57 INFO finished batch 2
ONLINE: last heartbeat 1s ago
```

Your times and numbers will differ.

**6. Stop it.** Predict first: once the program has stopped, which of the three files will say
so?

```
kill %1
```

`kill %1` asks job 1 to stop. This program has no code for being stopped, so it writes nothing,
just as after a crash, a freeze or a power cut. Your shell may print a line saying the job was
terminated.

**7. Look again**, about five seconds later. The output from here on is from the same run; your
times, and the state if you wait longer, will differ.

```
tail -n 2 log.txt
grep ERROR log.txt
tail -n 1 metrics.txt
sh check.sh
```

```
13:22:52 INFO finished batch 1
13:22:57 INFO finished batch 2
13:22:59 jobs_waiting=5
STALE: last heartbeat 6s ago
```

`grep ERROR log.txt` prints any log line containing `ERROR`, and there is none. The log
ends on a routine `INFO` line, and the metric on a normal number. Their times are there, but
nothing compares them with the clock, and a quiet log can just mean nothing happened. Wait ten
more seconds, then:

```
sh check.sh
```

```
OFFLINE: last heartbeat 16s ago
```

None of the three files says the program stopped. Only the check noticed, by comparing the
heartbeat's time with the clock. Silence means something only when a report is expected on a
schedule, and that is a heartbeat's whole job.

It cannot say *why*: a power cut would print the same. Telling those apart takes a second,
separate view of the machine.

**8. Clean up.**

```
cd ..
rm -rf monitor-lab
```

If you skipped step 6, run `kill %1` before this. `rm` deletes; `-r` includes everything inside
the folder, and `-f` skips the questions. It cannot be undone, so check you typed `monitor-lab`.

## Check yourself

1. In step 7 the log held no errors. Why is that not evidence the program was healthy?
2. What does a heartbeat tell you that a metric's last value does not?
3. A Rasputin machine reads `OFF BUS`. Should you go and check its power cable first?

### Answers

1. A stopped program writes no error line, and neither does a healthy, quiet one.
2. How long ago you last heard from it, against a schedule you expect. A metric's last value
   still looks normal after the program stops.
3. No. The mesh can still see the machine, so it is up. Its agent has stopped reporting; start
   there.

## Where to go next

- **What each state sends you to check:** [Check on a node](https://rasputin.geekdojo.com/docs/check-a-node/),
  in Rasputin's manual, explains `ONLINE`, `STALE`, `OFF BUS` and `OFFLINE`.
- **Metrics and logs in a running cluster:** [See how a node is behaving](https://rasputin.geekdojo.com/docs/see-how-a-node-is-behaving/)
  shows a machine's history and its programs' logs.
- **The code:** the heartbeat-and-mesh rule in
  [`presence.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/inventory/presence.go)
  in the public repository.
