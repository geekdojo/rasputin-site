---
title: "How much RAM does monitoring 24 Pis take? A week of numbers from the Pi 5 that does it"
date: 2026-11-03
description: "A week of memory numbers from the Pi 5 that manages my 24-Pi rack with Rasputin, my homelab cluster system, and runs its whole monitoring stack, with the query to check your own."
summary: "A week of memory numbers from the Pi 5 that manages my 24-Pi rack with Rasputin, my homelab cluster system, and runs its whole monitoring stack, with the query to check your own."
---

Just how much RAM does a Raspberry Pi 5 need to run a full observability stack, backups, a job 
bus, a certificate authority, and more? Let me tell you, when I started Rasputin, I had absolutely 
no idea! 

TL;DR: Surprisingly little; just over a gigabyte.

More specifically, the Pi 5 peaked at 1,040 MiB of its 8 GB during a full rack update. I was honestly 
expecting it to be much higher.

## The setup

The rack is a BitScope blade rack. One Pi 5 with 8 GB manages the other 23 Pis and hosts the
whole monitoring stack: Grafana, Loki and VictoriaMetrics, plus vmalert for alerts and Grafana
Alloy, which collects the metrics and logs. Headscale runs there too, for remote access. The
smallest candidate for that job on my bench was a 1 GB Pi 4. I should also mention that the Pi 5 
uses a NVMe hat with an OS disk and a backup disk.

Fortunately, I didn't need to install anything to measure it. The stack already records the memory of every
node, including its own, every 10 to 15 seconds, so I pulled seven days of that history
(24 September to 1 October) out of VictoriaMetrics at a five-minute step.

## Update day

Most of the week the Pi used about 900 MiB and never touched swap. On 27 September I updated
the rack, and the high point of the week came while the update was swapping out the Alloy
container, the heaviest one on the Pi all week at about 370 MiB.

## Which number to read

cAdvisor, the usual container-metrics exporter, also reports a plain memory-usage figure for
the whole host that can be a little misleading. That one peaked above 4 GiB, more than four times the used figure below,
because it counts page cache. Linux fills spare RAM with cached file
pages and hands them back as soon as a program asks, so for sizing that cache is free. I counted
used memory as total RAM minus what the kernel reports as available (MemTotal minus
MemAvailable), which already treats the cache that way.

## What I decided

At about 1 GB used, the 1 GB Pi 4 was out. Since we have future plans to expand Rasputin's current 24-node 
soft limit to 48 nodes or higher, I felt that 2 GB was probably still insufficient. Given that, I set
Rasputin's minimum for the control plane at 4 GB, on Pi or x86, so the stack has room to grow.

## Run it on your own stack

The per-container numbers come from cAdvisor, and the query works on either of the usual
metrics databases, Prometheus or VictoriaMetrics. Run it as a range query over your week at a
five-minute step and take the highest value for each container:

```promql
# Peak memory per container (working set: in use, minus inactive file cache)
max by (name) (max_over_time(container_memory_working_set_bytes{name!=""}[5m]))
```

For the host itself, the Rasputin agent on each node reports MemTotal minus MemAvailable directly. With
node_exporter, the standard Linux host-metrics exporter, the equivalent is below. I checked it on a test box running node_exporter and
Prometheus, not on the rack:

```promql
max_over_time((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)[5m:])
```

Two details changed my results. Without the `max_over_time(...[5m])` wrapper, a query at a
five-minute step reads one sample per step, and my peak read 1,000 MiB instead of 1,040. And use
`max by (name)`, not `sum by (name)`: while the update was replacing the collector, two
cAdvisor instances reported at once, and a sum doubled every container for that step.

All of this is one rack on one Pi 5, your mileage and experience may vary depending on the boxes you cobble together to 
make the cluster.

{{< devlog-footer >}}
