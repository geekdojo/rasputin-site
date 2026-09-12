---
lesson: passkeys.beginner
---

## What you need

Nothing beyond reading. This lesson has no hands-on section: nothing to install or run, and no
passkey, account, Rasputin hardware or Rasputin code needed.

## The idea

A **password** is a secret that you and a website both know. You type it, and the site compares.
Because you type it, you can type it into the wrong place, such as a page at a different name that
looks like the real one.

A **passkey** replaces the password with a **key pair**: two linked keys. The **private key**
stays in your **authenticator**, the part of your device, or a separate security key, that asks
for your fingerprint, face or PIN before using it. Some authenticators copy it, encrypted, to
your other devices. The site keeps only the **public key**.
To sign you in, the site sends a random value. Your authenticator signs it, and the site checks
the signature with the public key. No secret crosses the network.

Every passkey also belongs to one name. Sites are reached by a **domain name**, a readable name
such as `example.com` that the internet's naming system turns into an **IP address**, the numeric
address of a computer, such as `192.0.2.10`. The
standard behind passkeys, **WebAuthn**, calls the site a **relying party**, and the name a passkey
belongs to its **relying party ID**.

The **browser** enforces that name, not the page. A page may ask for passkeys belonging to its own
name, or to a parent name it sits under: a page at `login.example.com` may ask for `example.com`'s
passkeys. For any other name the browser refuses, unless the site that owns that name has
published a list of other names allowed to use its passkeys. Passkeys also work only on secure
(HTTPS) pages: encrypted, with a **certificate**, a digital document proving which name or address
the page belongs to.

## A real example: Rasputin

[Rasputin](https://github.com/geekdojo/rasputin-os) is an open-source system for running a small
group of computers at home, called a cluster. Its sign-in is passkey-only.
[Its manual](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#the-passkey-is-bound-to-the-clusters-name)
says: *"There is no username field on the sign-in form, no password, no password reset, no
emailed code, and no fallback."* Each cluster is reached at its own name, `<cluster-id>.local`,
where `<cluster-id>` is the identifier fixed when the cluster was provisioned, and a name ending
in `.local` works only inside your own network. Its decision record chose *"One name, one
identity"*: the name you browse to is also the passkey's relying party ID. That is why you reach
the cluster by its name and never by its IP address.

## What happens when a page asks for a passkey

### A look-alike name

You have a passkey for `example.com`. A link takes you to a page at `examp1e.com`, with the digit
1 in place of the letter l. It looks identical and has a sign-in button. You press it.

1. The page asks the browser for a passkey belonging to `example.com`.
2. The browser compares that with the name of the page it loaded, `examp1e.com`. Not the same,
   and not a parent name.
3. The browser looks for a list published by `example.com` that names `examp1e.com` as allowed.
   There is none, or the browser does not check such lists.
4. The browser refuses and hands the page an error.

Your authenticator was never asked. No fingerprint prompt appeared for your `example.com` passkey,
so there was no moment at which you could approve the wrong thing. A password protects you only
if you notice the wrong name. A passkey does not depend on noticing: the browser reads the page's
real name, not how the page looks.

### An address instead of a name

Now you browse to `https://192.0.2.10`, a page reached by IP address (one reserved for examples).
The connection is encrypted, its certificate is valid for that address, and the browser shows no
warning. It is a secure page. It asks for a passkey.

1. The browser takes the page's own name, to compare with the relying party ID.
2. The page has no name, only an address. The standard accepts only domain names here.
3. The browser refuses with an error before looking at any passkey.

Creating a passkey there is refused the same way. A page reached by IP address cannot use
passkeys at all, however secure it is. Being secure is required, but not enough: the page must
also have a name.

## Check yourself

1. You have a passkey for `example.com`. A page at `examp1e.com` asks for it. What stops the
   request, and when?
2. A page at `login.example.com` asks for your `example.com` passkey. Does the browser refuse?
3. You reach a Rasputin cluster by its IP address, over HTTPS with no warning. Why is your passkey
   not offered?

### Answers

1. The browser, by comparing the requested name with the page's real name, before your
   authenticator is asked. Only a list published by `example.com` naming `examp1e.com` could
   change that.
2. No. `example.com` is a parent name of `login.example.com`, so the request is allowed.
3. A passkey is offered only at the name it belongs to, and a page reached by IP address cannot
   use passkeys at all, however secure it is.

## Where to go next

- **Passkeys on a cluster:** [The passkey is bound to the cluster's name](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#the-passkey-is-bound-to-the-clusters-name),
  in Rasputin's manual, covers what the binding protects and what it does not.
- **When a passkey is not offered:** the same page's [troubleshooting](https://rasputin.geekdojo.com/docs/get-in-the-first-time/#troubleshooting)
  section lists the usual causes.
- **The code:** the sign-in service in
  [`api/internal/auth`](https://github.com/geekdojo/rasputin-control-plane/tree/v2026.08.5/api/internal/auth)
  in the public `rasputin-control-plane` repository.
