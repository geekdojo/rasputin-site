---
lesson: passkeys.intermediate
---

## What you need

- **The beginner lesson,** [Why a passkey belongs to one name](https://rasputin.geekdojo.com/learn/passkeys/beginner/).
  It covers key pairs, authenticators, relying party IDs and why a browser refuses a passkey at
  the wrong name.

This lesson has no hands-on section. Every honest exercise here would mean creating an account
somewhere or pasting code into a browser, and neither is a habit worth practicing to learn a
tradeoff. You do not need a passkey, Rasputin hardware, Rasputin code, or an account anywhere.

## The situation

[Rasputin](https://github.com/geekdojo/rasputin-os) runs a small group of computers at home, a
cluster. Its web interface controls all of it. Any device on your home network can reach the
sign-in page, at the cluster's own name, and the cluster has no public domain and no email service
of its own.

The usual answer is a password. A password brings its own machinery: stored password hashes
(scrambled copies that are checked instead of the password itself), limits on how fast someone can
guess, and a way to reset a forgotten password. A reset needs a second way to prove who you are,
usually an email or a text message.

## The decision, and what lost

Sign-in is passkey only. The manual puts it flatly: *"There is no username field on the sign-in
form, no password, no password reset, no emailed code, and no fallback. Your passkey is the
account."*

The identity design, an internal record, gives three reasons *"the password screen never
exists"*. People running a home cluster have *"registered a passkey on something already"*.
Passwords are *"an attack surface we don't need"*: no reuse, no leaked hashes, no guessing, *"no
reset flow"*, and so *"Less code to write, less code to defend."* And a passkey needs the device
that holds it: *"A stolen session cookie buys an attacker until expiry; a stolen credential
requires physical possession of the authenticator."* A **session cookie** is the token a browser
keeps after sign-in, so you do not sign in on every page.

| Alternative | What the record says |
|---|---|
| Passwords | Rejected, for the reasons above. |
| Passkeys, with a password as a fallback | Not weighed on its own. The record does not discuss it. Here is why it plausibly lost: a fallback keeps every password cost above, and anyone who can use the fallback never needs the passkey, so the account is only as strong as the password. |
| A reset by email or text message | Rejected with passwords: *"No password reset. No email. No SMS."* |
| Printed one-time recovery codes | Not mentioned in the identity design. |

## What it cost

**Lose the passkeys, and the sign-in page cannot let you in.** The manual: *"Lose every device
that holds a passkey and there is no way back in from the sign-in page: no reset, no code, no
support override."* The record's *"Less code to defend"* and the manual's *"no support override"* describe
one fact from two sides. With no reset flow, there is nothing for anyone to reset, Geekdojo
included.

**Everyone has to bring an authenticator.** A computer with no fingerprint reader or similar
built in needs a security key, a phone, or a password manager that stores passkeys. In a
Mastodon poll run by Rasputin's developer, asking what people would reach for to create a
passkey, 4 of the 61 who answered chose *"None of these — I'd be stuck"*. The published write-up
treats that as a floor, not an estimate: *"People who are blocked by passkeys are the least likely
to answer a passkey poll."*

**A bug in the only door has no way around it.** The record does not call this a cost of
passkey-only; that link is this lesson's. A comment in Rasputin's sign-in code records a defect,
since fixed. Sign-in asked the authenticator for any passkey belonging to the cluster's
name, which finds only passkeys stored as **discoverable**: kept on the authenticator with enough
detail to be found without a username. Registration did not ask for that. Built-in authenticators
store discoverable passkeys anyway; a security key may not, unless asked. So, in the comment's
words, *"registration succeeds and login is then impossible, with nothing in the UI to explain
why."*

**The browser's rules become sign-in rules.** A passkey works only on a secure page at a name. The
manual notes that clicking through a certificate warning does not reliably give a secure page:
on Chromium-based browsers the passkey step has failed outright, and *"Rasputin can neither detect
that nor work around it."*

## What Rasputin does not do here

There is no account recovery, and no password anywhere in web sign-in. A passkey is the only way
to sign in to the web interface.

## What happens when the one way in fails

### The laptop is gone

Your only passkey for the cluster is held by your laptop, and nowhere else. The laptop is
stolen.

1. On another computer you browse to the cluster's name. The certificate checks out and the
   sign-in page loads.
2. There is no username field and nothing to type. You press the sign-in button.
3. The browser asks for a passkey belonging to the cluster's name. Nothing you still have holds
   one.
4. The browser finds no passkey you can use. The page offers no link to reset, no code to
   request, and no one to contact.

On a password system with email reset, step 4 is a "forgot password" link, and your email account
decides whether you get back in. That link is the recovery path, and it is also a way in for
anyone who controls your email. Rasputin removed both at once.

### The security key that never signed in

Before the fix, you register with a USB security key.

1. Registration asks the key for a passkey without asking for a discoverable one. The key stores
   the kind it stores by default. Registration reports success.
2. You sign out, and press the sign-in button.
3. Sign-in asks for any discoverable passkey for the cluster's name. The key holds a passkey for
   that name, but not one it can offer without being told which to use.
4. Nothing is offered. Nothing on the page says why.

The code comment adds why nobody saw it sooner: fingerprint readers and similar built-in
authenticators store discoverable passkeys whether or not they are asked. The record does not
discuss what a password fallback would have changed. A plausible answer: a user with a password
would have signed in with it and never learned the key did not work. Without a fallback, the
defect showed itself on the first sign-in.

### Making the same choice yourself

Before you ship passkey-only sign-in, answer these from your own record:

- **Who can reach the sign-in page?** A page open to your home network carries a different risk
  from one on the internet.
- **What would a reset trust?** If it is email, your sign-in is as strong as your users' email.
- **What happens when the one door is broken?** A defect in registration or sign-in is a lockout
  for every affected user, not an inconvenience.
- **Who is stuck?** Count the people with no authenticator, and remember they are the least likely
  to tell you.

## Check yourself

1. The manual says there is *"no support override"*. Why can the vendor not let you back in?
2. What breaks if a system accepts a passkey or a password, and someone learns the password?
3. A security key registers without error and then never appears at sign-in. What was missing at
   registration?
4. Why is a poll result of "4 in 61 would be stuck" a floor rather than an estimate?

### Answers

1. There is no reset flow for anyone to use. Removing it for attackers removed it for Geekdojo.
2. They sign in without the passkey, so the account is only as strong as the password.
3. A request for a discoverable passkey. Sign-in asked only for discoverable passkeys, and the key
   had stored the other kind.
4. People blocked by passkeys are the least likely to answer a poll about passkeys.

## Where to go next

- **The binding and what it does not protect:** [The passkey is bound to the cluster's name](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#the-passkey-is-bound-to-the-clusters-name),
  in Rasputin's manual.
- **Why sign-in needs the certificate:** [What installing the certificate actually establishes](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#what-installing-the-certificate-actually-establishes).
- **The code:** the registration request, and the comment about discoverable passkeys, in
  [`handlers.go`](https://github.com/geekdojo/rasputin-control-plane/blob/v2026.08.5/api/internal/auth/handlers.go).
