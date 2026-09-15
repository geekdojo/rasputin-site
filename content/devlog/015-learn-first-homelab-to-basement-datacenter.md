---
title: "Learn: from a first homelab to a basement datacenter"
date: 2026-09-15
description: "The site has a new Learn section: 40 lessons on the technologies and decisions behind Rasputin, each written for a beginner, intermediate or advanced reader, with labs that run in an ordinary terminal and need no Rasputin hardware, code or account."
summary: "The site has a new Learn section: 40 lessons on the technologies and decisions behind Rasputin, each written for a beginner, intermediate or advanced reader, with labs that run in an ordinary terminal and need no Rasputin hardware, code or account."
---

There's a new section on the site: [Learn](/learn/). It teaches the technologies and
decisions behind Rasputin across 18 topics, from DNS and firewalls to signing, updates and
backups, with Rasputin as the worked example.

The goal is to serve everyone from the hobbyist just starting their homelab up to the
self-hosted technocrat running a datacenter in their basement. Those two readers want very
different things from a page about DNS, so I wrote different lessons for the different experience levels.
Hopefully there's something for everyone.

## One topic, up to three lessons

Each topic is taught at up to three levels, and each level is its own page:

| Level | Written for | What it teaches |
|---|---|---|
| Beginner | someone new to the field | the concept, with one Rasputin example |
| Intermediate | someone who knows the basics | a tradeoff — what was chosen, what was given up and what it cost — drawn from a recorded decision |
| Advanced | a practitioner | how it's built, and where it breaks |

Not every topic has every rung. Monitoring has a beginner lesson
only, and compatibility starts at intermediate. Today that adds up to 40 lessons: 17
beginner, 17 intermediate and 6 advanced.

The intermediate lessons draw on Rasputin's real engineering decisions, quoted from its
decision records, and they say plainly where a record is silent. When a record doesn't
state a cost, the lesson says that too.

## Four tracks

If forty lessons is a lot to pick through, there are four role tracks. Each runs in
reading order, beginner lessons first, then intermediate, then advanced, and all four
start with the same two: the parts of a small distributed system, and how to read a
decision record.

| Track | Lessons |
|---|---|
| Network engineer | 18 |
| Software developer | 17 |
| DevOps | 15 |
| Operations | 16 |

## The labs

38 of the 40 lessons have a hands-on lab, and every one runs in an ordinary terminal. In
most you build a small pretend system in a folder you make for the lesson: a rule list, a
signed file, a toy DNS responder. One has you ask public servers a question and read the
reply. None of them needs Rasputin hardware, Rasputin code or an account, and none of them
runs against a Rasputin cluster.

The two passkey lessons are reading only. The only lab that could show a passkey at work
would have a beginner pasting code into a browser console, and I'd rather not teach that
habit.

Every lab was run before it was published. Each lesson's "What you need" section lists
what it was run on — macOS for all of them, and for most, Linux too: Debian, Ubuntu, or
BusyBox where the lesson says so — and says where something wasn't tested.

## Names, at all three levels

The Names topic shows the ladder best.

**Beginner — [How a name becomes an address](/learn/names/beginner/).** About 25 minutes
with `dig`, which every Mac already has. You ask Cloudflare's public resolver, a root
server and `example.com`'s own nameserver the same question and compare what comes back:
an answer passed along, a referral, an authoritative answer, and a flat `REFUSED` for a
name that server doesn't hold. Then two public resolvers look up the same name, get
different addresses, and both are correct. `dig` only asks questions, so there's nothing
to clean up. The Rasputin example is the two app names from
[devlog 13](/devlog/013-how-rasputin-apps-work/).

**Intermediate — [Two names instead of one name with two answers](/learn/names/intermediate/).**
ADR-0004 first chose split-horizon DNS, then replaced it the same day with one name per
network, so that *"every name has exactly one answer everywhere."* The lesson walks the
four alternatives and why each lost, then what the choice cost: a name only works on its
own network, and people have to pick the right one. The manual carries a troubleshooting
entry for exactly that. The lab models both designs with two text files and a little
`awk`, and shows where each one fails.

**Advanced — [How an authoritative nameserver answers, and where it breaks](/learn/names/advanced/).**
About 45 minutes, for the basement-datacenter crowd. You build a small authoritative
responder in standard-library Python, question it with `dig`, and change its zone without
a restart. Then you list it as a backup behind a public resolver and watch it never get
asked, because "no such name" is an answer. Make it the only resolver and the rest of the
internet goes dark, which is the black hole from
[devlog 10](/devlog/010-control-plane-dns-per-mode/). Last, you put a real bug from an
earlier version back on purpose: a `REFUSED` where NODATA belonged, which kept mesh nodes
from rejoining.

## How the lessons were made

As usual, Claude did the drafting and ran the labs. A separate review pass then checked
each lesson claim by claim against the Rasputin source at the 2026.08.5 stable release,
and I merged them after that. Every lesson page says which release it was written for and
when it was reviewed.

The [user manual](/docs/) was rebuilt alongside Learn, and most lessons end by pointing at
the matching manual page. The labs never touch a cluster, so when it's time to run one, the
manual is the place.

## Feedback welcome

I did, of course, use AI to generate the lessons (leveraging knowledge in the geekdojo
brain to support it). You will see some of the normal traits of AI generated content including
voice, some dramatic flair (although I think I found most of those), and some 'oddities'.
I'm slowly going through each lesson and polishing them but I'd rather release them now
than make folks wait the two months it will take me to hit all 40.

Each lesson has a "Tell us" link at the bottom. If a lesson is wrong, unclear, or pitched
at the wrong level, that's the place for it.

Right now Learn is 40 lessons, all written for 2026.08.5. A weekly check files an issue
for any lesson or manual page stamped two or more minor releases behind the latest stable,
so it gets re-read against the new release.

{{< devlog-footer >}}
