---
title: "61 Linux users on where their passkey actually comes from"
date: 2026-08-06
description: "A Mastodon poll asked what people reach for when a self-hosted service on their LAN asks them to create a passkey. 61 voters: 74% a password manager, 43% a hardware security key, 39% their phone by QR, and 6.6% who'd be stuck. The bench matrix gets a second axis, and the password-manager cell gets tested first."
summary: "A Mastodon poll asked what people reach for when a self-hosted service on their LAN asks them to create a passkey. 61 voters: 74% a password manager, 43% a hardware security key, 39% their phone by QR, and 6.6% who'd be stuck. The bench matrix gets a second axis, and the password-manager cell gets tested first."
---

I had a line on the public roadmap that said a Linux desktop can't hold a
passkey, so you sign in with your phone or a security key. That is right about
the OS and wrong about the browser, and I only noticed after it shipped.
Password-manager extensions implement WebAuthn themselves and hand out passkeys
on Linux with no phone and no hardware key involved. I corrected the roadmap on
July 31st, then ran a poll instead of guessing at the rest.

The question, on Mastodon, was deliberately narrow: a self-hosted service on
your LAN asks you to create a passkey — what do you actually reach for today?
Multi-select, four options, three days.

## The numbers

61 voters, 99 votes, 4 boosts, 4 written replies. Percentages are of **voters**,
not votes, and they add to more than 100 because most people ticked more than
one box (1.6 options each).

| What they'd reach for | Voters | Share |
|---|---|---|
| Password manager (Bitwarden, 1Password, Proton) | 45 | 74% |
| Hardware security key (YubiKey, Nitrokey) | 26 | 43% |
| Phone, by scanning a QR code | 24 | 39% |
| None of these — I'd be stuck | 4 | 6.6% |

## Two caveats I wrote down before the votes came in

**The hardware-key number is an upper bound.** The poll ran on hachyderm.io, an
instance full of security-conscious sysadmins — 43% with a YubiKey in a drawer
is what that population looks like. The intermediate homelabber Rasputin targets
sits somewhere below it, and nothing in this poll says how far.

**The 6.6% who'd be stuck is a floor.** People who are blocked by passkeys are
the least likely to answer a passkey poll — the sampling error runs in the
direction that keeps them out of the sample. A small number there is worth more
than its size.

Both of those were written into the notes before the poll closed, which is the
only way that claim is worth anything.

## What the replies added

Two of them pushed on the hardware-key end, in opposite directions. One operator
has a FIDO2 second-factor-only security key — the SK class — and would use a
real passkey if they had a key that could store one. That distinction matters
for a percentage: "I own a hardware key" and "I can create a passkey with it"
are different claims, and a resident (discoverable) credential is what the
second one needs. Rasputin's own login is discoverable-only, and registration
wasn't requesting a discoverable credential until [control-plane
PR #57](https://github.com/geekdojo/rasputin-control-plane/pull/57) landed on
July 31st — a key would enroll cleanly and then never sign in.

The other went the opposite way: if a self-hosted app can't work behind forward
auth or a password, it's a fork candidate, because writing a passkey
implementation is not what they signed up for.

## What it changes for Rasputin

The bench matrix had one axis — platform and browser. Every row is a place a
*platform* authenticator lives (Touch ID, Windows Hello, Android). The thing 74%
of respondents said they'd use is cross-platform and appears in no row at all, so
the matrix gets a second axis: platform authenticator, security key,
phone/hybrid, browser-based credential provider.

The matrix stopped gating launch on August 5th. macOS Firefox, Safari and Chrome
all pass the full `.local` + mesh-CA + Touch ID chain, which is enough confidence
that the chain generalizes; the remaining cells get dug into when somebody
reports a failure, rather than proven exhaustively up front. What that buys is a
second axis I can actually work through instead of a grid I have to finish.

The credential-provider cell goes first, which is what I said on the poll thread:
password managers now, the other options a few months behind. The reason that
cell is the interesting one is specific — Rasputin's WebAuthn RP ID is
`rasputin.local`, and `.local` is a special-use name that isn't in the Public
Suffix List, so a password manager's URI matching has no well-defined base domain
there. Passkey selection keys off the RP ID, so it should work. That's an
inference about somebody else's implementation, and it gets a bench result before
I believe it.

What doesn't change: onboarding won't tell anyone which authenticator to use. A
machine with no platform authenticator needs the operator to bring something —
a security key, a phone, or a browser-based credential provider — and Rasputin's
job is to list those three and break none of them. The poll decides what to stay
compatible with and in what order I test it. It doesn't get a vote on what to
recommend.

The 6.6% and the fork-button reply argue for the same thing from different
ends: a way in that doesn't assume the operator is holding a working
authenticator. That work is queued and hasn't shipped. It's the
opinionated-but-open line the whole product runs on — strong defaults, escape
hatches everywhere.

**Takeaway:** the poll confirmed some decisions I'd already made, and surfaced a
couple of angles I hadn't considered — which is exactly why I joined Hachyderm
in the first place. Huge thanks to the folks at Hachyderm.

*Rasputin is an open-source (AGPL) homelab cluster system — a control plane,
node OS, and firewall image that make a few Raspberry Pis or N100 boxes behave
like one appliance. It's pre-alpha, on
[GitHub](https://github.com/geekdojo/rasputin-control-plane), and I'm looking for a
handful of [design partners](/#partners) to run it and tell me what's broken.*
