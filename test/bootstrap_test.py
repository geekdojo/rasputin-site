#!/usr/bin/env python3
"""Functional tests for static/bootstrap.sh — the seed it writes and the prompts
that fill it in.

Why this file exists. bootstrap.sh is the THIRD renderer of the same
`rasputin-seed.env` contract, after `rasputin-provision` and the control plane's
Add-Node wizard. When the wizard's renderer silently dropped
`RASPUTIN_CLUSTER_ID` (control-plane #71) the node booted, joined, and looked
healthy — it just answered to the wrong cluster name, which is invisible until
someone tries to resolve it. A missing seed field is not a crash, so only a test
that pins the field SET catches it. That is case B/C below.

The tests drive the real `static/bootstrap.sh`: the prompt block is executed
under a pseudo-terminal (the script reads answers from /dev/tty so it works under
`curl | sudo bash`, and nothing but a pty exercises that path), and the seed
template is evaluated as shell. Nothing here is a copy of the script, so the
tests cannot drift away from what ships.

Cases F-H cover the shared release verifier (geekdojo/geekdojo-brain#528): the
block between the BEGIN/END markers is extracted from the shipped script and
driven against a throwaway PKI built here. Its failures are the point — a
verifier that accepts a manifest it should have refused is invisible until
someone flashes a tampered image, so every refusal is pinned: a root CA that
does not match the baked fingerprint, an absent signature, a tampered manifest,
a signer without the release purpose OID, a signer with no extended key usage at
all, a near-miss OID a prefix test would have accepted, and an expired signing
certificate (which must be reported as a stale release, not as tampering).

No network: the fixtures are generated with the local openssl.

Run:  python3 test/bootstrap_test.py
"""

import os
import pty
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "static", "bootstrap.sh")
EXAMPLE = os.path.join(ROOT, "static", "rasputin-seed.env.example")

# The canonical control-plane seed field set, in the order the script writes it.
# Adding a field here without adding it to bootstrap.sh (or the reverse) fails.
CANONICAL_SEED_FIELDS = [
    "RASPUTIN_NODE_ROLE",
    "RASPUTIN_CLUSTER_ID",
    "RASPUTIN_NODE_ID",
    "RASPUTIN_SSH_AUTHORIZED_KEY",
]

failures = []


def check(label, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + label + (("  — " + detail) if detail and not ok else ""))
    if not ok:
        failures.append(label)


def sh(script):
    """Run a bash snippet, return (rc, stdout+stderr)."""
    p = subprocess.run(["bash", "-c", script], capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def script_text():
    with open(SCRIPT, encoding="utf-8") as f:
        return f.read()


# --------------------------------------------------------------------------
# A. valid_label — the shipped regex, not a restatement of it
# --------------------------------------------------------------------------
def extract_valid_label():
    m = re.search(r"^valid_label\(\).*$", script_text(), re.M)
    assert m, "valid_label() not found in bootstrap.sh"
    return m.group(0)


def test_valid_label():
    print("A. valid_label accepts and rejects the right names")
    fn = extract_valid_label()
    good = ["rasputin", "home1", "e12bench", "cp-1", "a", "a-b-c", "x" * 63]
    bad = ["", "Home1", "foo-", "-foo", "a.b", "x" * 64, "my_cluster", "foo bar", "café"]
    for v in good:
        rc, _ = sh("%s\nvalid_label %s" % (fn, quote(v)))
        check("accepts %r" % v, rc == 0)
    for v in bad:
        rc, _ = sh("%s\nvalid_label %s" % (fn, quote(v)))
        check("rejects %r" % v, rc != 0)


def quote(s):
    return "'" + s.replace("'", "'\\''") + "'"


# --------------------------------------------------------------------------
# B. the seed template renders the canonical field set
# --------------------------------------------------------------------------
def extract_seed_assignment():
    m = re.search(r'^SEED="RASPUTIN_NODE_ROLE=controlplane\n.*?\n"$', script_text(), re.M | re.S)
    assert m, "SEED= assignment not found in bootstrap.sh"
    return m.group(0)


def test_seed_render():
    print("B. the seed carries every canonical field, in order, with the chosen values")
    assign = extract_seed_assignment()
    prog = (
        'CLUSTER_ID=e12bench; NODE_ID=cp-1; SSH_KEY="ssh-ed25519 AAAAC3Nz you@laptop"\n'
        + assign
        + '\nprintf "%s" "$SEED"'
    )
    rc, out = sh(prog)
    check("seed renders without error", rc == 0, out)
    lines = [l for l in out.split("\n") if l.strip()]
    keys = [l.split("=", 1)[0] for l in lines]
    check("field set and order match the canonical contract",
          keys == CANONICAL_SEED_FIELDS,
          "got %r" % (keys,))
    check("cluster id is the value the operator chose",
          "RASPUTIN_CLUSTER_ID=e12bench" in lines,
          "got %r" % (lines,))
    check("node id is separate from the cluster id",
          "RASPUTIN_NODE_ID=cp-1" in lines)
    check("ssh key stays double-quoted (the seed is sourced by sh)",
          'RASPUTIN_SSH_AUTHORIZED_KEY="ssh-ed25519 AAAAC3Nz you@laptop"' in lines,
          "got %r" % (lines,))


# --------------------------------------------------------------------------
# C. the hand-edit template documents the same fields the script writes
# --------------------------------------------------------------------------
def test_example_parity():
    print("C. the copy-exact template matches the script's field set")
    with open(EXAMPLE, encoding="utf-8") as f:
        keys = [l.split("=", 1)[0] for l in f if l.strip() and not l.startswith("#")]
    check("rasputin-seed.env.example carries the canonical fields",
          keys == CANONICAL_SEED_FIELDS,
          "got %r" % (keys,))


# --------------------------------------------------------------------------
# D + E. the prompts, driven through a real pty
# --------------------------------------------------------------------------
def prompt_harness():
    """Everything up to (not including) the SSH-key step, with the two preflight
    guards that need root/curl removed. Generated from the real script."""
    text = script_text()
    cut = text.index("# --- 4. SSH public key")
    head = text[:cut]
    head = "\n".join(
        l for l in head.split("\n")
        if "must run as root" not in l and "have curl || die" not in l
    )
    return head + '\nprintf "CLUSTER=%s NODE=%s\\n" "$CLUSTER_ID" "$NODE_ID"\n'


def run_prompts(answers, env=None):
    """Run the prompt block under a pty, typing `answers` in order. Returns output."""
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8") as f:
        f.write(prompt_harness())
        path = f.name
    e = dict(os.environ)
    e.pop("RASPUTIN_ARCH", None)
    e.pop("RASPUTIN_CLUSTER_ID", None)
    e.pop("RASPUTIN_NODE_ID", None)
    if env:
        e.update(env)
    pid, fd = pty.fork()
    if pid == 0:                                   # child: the script, on the pty
        try:
            os.execvpe("bash", ["bash", path], e)
        finally:
            os._exit(127)
    out = b""
    try:
        for a in answers:
            deadline_read(fd, out)
            os.write(fd, (a + "\r").encode())
        while True:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            out += chunk
    finally:
        os.close(fd)
        os.waitpid(pid, 0)
        os.unlink(path)
    return out.decode(errors="replace")


def deadline_read(fd, _out):
    """Give the child a moment to print its prompt before we type."""
    import select
    select.select([fd], [], [], 5)


def test_prompts():
    print("D. the prompts collect a cluster name distinct from the node id")
    out = run_prompts(["2", "e12bench", "cp-1"])
    check("asks for the cluster name", "Cluster name [rasputin]:" in out, out)
    check("asks for the node name separately",
          "Name this control-plane node" in out, out)
    check("keeps the two answers apart",
          "CLUSTER=e12bench NODE=cp-1" in out, out)

    out = run_prompts(["2", "", ""])
    check("empty answers take the documented defaults",
          "CLUSTER=rasputin NODE=cp-1" in out, out)

    out = run_prompts([], env={"RASPUTIN_ARCH": "amd64",
                               "RASPUTIN_CLUSTER_ID": "home1",
                               "RASPUTIN_NODE_ID": "cp-1"})
    check("env overrides skip the prompts entirely",
          "CLUSTER=home1 NODE=cp-1" in out, out)
    check("no cluster prompt when the env supplies it",
          "Cluster name [rasputin]:" not in out, out)


def test_prompt_rejects_bad_names():
    print("E. an unusable cluster name is refused at the prompt, not at first boot")
    for bad in ["Home1", "foo-", "my_cluster"]:
        out = run_prompts(["2", bad, "cp-1"])
        check("rejects %r" % bad,
              "cluster name '%s'" % bad in out and "CLUSTER=" not in out,
              out)



# --------------------------------------------------------------------------
# F + G + H. the shared release verifier
# --------------------------------------------------------------------------
BEGIN = "# BEGIN shared release verifier"
END = "# END shared release verifier"

# The helpers the block leans on. Taken from the script itself so a rename in
# bootstrap.sh cannot leave the tests exercising a stale prelude.
def extract_verifier():
    text = script_text()
    i = text.index(BEGIN)
    j = text.index(END) + len(END)
    block = text[i:j]
    prelude = "\n".join(
        m.group(0) for m in re.finditer(r"^(say|info|warn|die|have)\(\).*$", text, re.M)
    )
    return prelude + "\n" + block + "\n"


def openssl_bin():
    return shutil.which("openssl") or "/usr/bin/openssl"


class PKI:
    """A throwaway root -> intermediate -> leaf chain, with the leaf variants the
    verifier is supposed to tell apart."""

    EXT = """
[ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
[leaf_release]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning,emailProtection,1.3.6.1.4.1.66587.1.1.1
[leaf_catalog]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning,emailProtection,1.3.6.1.4.1.66587.1.1.2
[leaf_nearmiss]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning,emailProtection,1.3.6.1.4.1.66587.1.1.11
[leaf_noeku]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
"""

    def __init__(self, d):
        self.d = d
        self.ssl = openssl_bin()
        self.ext = os.path.join(d, "ext.cnf")
        with open(self.ext, "w", encoding="utf-8") as f:
            f.write(self.EXT)
        self._run("req -x509 -newkey rsa:2048 -nodes -keyout %s -out %s -days 3650 "
                  "-subj /CN=Test-Root -extensions ca -config %s"
                  % (self.p("root.key"), self.p("root.pem"), self._reqcnf()))
        self._leafcsr("int")
        self._run("x509 -req -in %s -CA %s -CAkey %s -CAcreateserial -out %s -days 1825 "
                  "-extfile %s -extensions ca"
                  % (self.p("int.csr"), self.p("root.pem"), self.p("root.key"),
                     self.p("int.pem"), self.ext))
        for kind in ("release", "catalog", "nearmiss", "noeku"):
            self._leafcsr(kind)
            self._run("x509 -req -in %s -CA %s -CAkey %s -CAcreateserial -out %s -days 730 "
                      "-extfile %s -extensions leaf_%s"
                      % (self.p(kind + ".csr"), self.p("int.pem"), self.p("int.key"),
                         self.p(kind + ".pem"), self.ext, kind))

    def _reqcnf(self):
        path = self.p("req.cnf")
        with open(path, "w", encoding="utf-8") as f:
            f.write("[req]\ndistinguished_name=dn\n[dn]\n" + self.EXT)
        return path

    def p(self, name):
        return os.path.join(self.d, name)

    def _run(self, args, check=True):
        r = subprocess.run([self.ssl] + args.split(), capture_output=True, text=True)
        if check and r.returncode != 0:
            raise RuntimeError("openssl %s failed: %s" % (args, r.stderr))
        return r

    def _leafcsr(self, name):
        self._run("req -new -newkey rsa:2048 -nodes -keyout %s -out %s -subj /CN=Test-%s"
                  % (self.p(name + ".key"), self.p(name + ".csr"), name))

    def expired_leaf(self):
        """A release leaf whose validity is in the past. Minting one needs
        `x509 -req -not_before/-not_after` (OpenSSL 3.5+), which LibreSSL does
        not have — so try every openssl on the box, not just the one the
        verifier will run under. The certificate is an ordinary PEM whichever
        tool made it, so this does not weaken the case: what is under test is
        how the SHIPPED verifier reports it. Returns None when nothing on the
        box can mint one, so the case skips rather than failing for the wrong
        reason."""
        self._leafcsr("expired")
        args = ("x509 -req -in %s -CA %s -CAkey %s -CAcreateserial -out %s "
                "-not_before 20240101000000Z -not_after 20250101000000Z "
                "-extfile %s -extensions leaf_release"
                % (self.p("expired.csr"), self.p("int.pem"), self.p("int.key"),
                   self.p("expired.pem"), self.ext))
        for cand in [self.ssl, shutil.which("openssl"), "/usr/local/bin/openssl",
                     "/opt/homebrew/bin/openssl", "/usr/bin/openssl"]:
            if not cand or not os.path.exists(cand):
                continue
            r = subprocess.run([cand] + args.split(), capture_output=True, text=True)
            if r.returncode == 0:
                return self.p("expired.pem")
        return None

    def sign(self, leaf, content, out):
        self._run("cms -sign -binary -in %s -signer %s -certfile %s -inkey %s "
                  "-outform DER -out %s"
                  % (content, leaf, self.p("int.pem"),
                     leaf.replace(".pem", ".key"), out))

    def fingerprint(self, pem):
        r = self._run("x509 -in %s -noout -fingerprint -sha256" % pem)
        return r.stdout.split("=", 1)[1].strip().replace(":", "").lower()


def run_verifier(pki, manifest, sig, root, advice="Update the cluster first."):
    """Drive rasputin_verify_manifest from the shipped block. Returns (rc, output)."""
    work = os.path.join(pki.d, "work")
    os.makedirs(work, exist_ok=True)
    prog = (
        extract_verifier()
        + '\nrasputin_verify_manifest %s %s %s %s %s\n'
        % (quote(manifest), quote(sig), quote(root), quote(work), quote(advice))
    )
    return sh(prog)


def run_trusted_root(pki, ca_file):
    work = os.path.join(pki.d, "rootwork")
    os.makedirs(work, exist_ok=True)
    prog = (
        extract_verifier()
        + '\nRASPUTIN_ROOT_CA_FILE=%s\nrasputin_trusted_root %s\n'
        % (quote(ca_file), quote(work))
    )
    return sh(prog)


def test_verifier():
    print("F. the verifier accepts exactly one thing: a release-purpose signature")
    with tempfile.TemporaryDirectory() as d:
        try:
            pki = PKI(d)
        except RuntimeError as e:
            check("openssl can build the fixture PKI", False, str(e))
            return
        manifest = os.path.join(d, "manifest.json")
        with open(manifest, "w", encoding="utf-8") as f:
            f.write('{"version":"2026.09.9","channel":"stable","artifacts":[]}\n')

        good = os.path.join(d, "good.sig")
        pki.sign(pki.p("release.pem"), manifest, good)
        rc, out = run_verifier(pki, manifest, good, pki.p("root.pem"))
        check("a release-purpose signature verifies", rc == 0, out)
        check("…and it says who signed it", "Test-release" in out, out)

        print("G. every refusal the verifier exists for")
        # An artifact signed by the CATALOG leaf. It chains to the same root, so
        # only the purpose OID tells it apart — this is the whole reason the OID
        # check exists rather than relying on the chain.
        cat = os.path.join(d, "catalog.sig")
        pki.sign(pki.p("catalog.pem"), manifest, cat)
        rc, out = run_verifier(pki, manifest, cat, pki.p("root.pem"))
        check("a catalog-purpose signer is refused", rc != 0, out)
        # It must be refused for the RIGHT reason: `-purpose any` on the CMS
        # verify means the chain check passes for a catalog leaf, so this
        # message appearing proves the OID check is what turned it away.
        check("…and the message names the missing authorization",
              "NOT authorized" in out and "1.3.6.1.4.1.66587.1.1.1" in out, out)

        # …1.1.11 — a valid future OID that a prefix/substring test would accept.
        nm = os.path.join(d, "nearmiss.sig")
        pki.sign(pki.p("nearmiss.pem"), manifest, nm)
        rc, out = run_verifier(pki, manifest, nm, pki.p("root.pem"))
        check("an OID that merely starts with the release OID is refused",
              rc != 0, out)

        # A leaf with NO extendedKeyUsage extension at all. This is the shape
        # of the oldest published release leaf, and it is the case that caught
        # a silent `set -e` abort: the EKU grep found nothing, the assignment
        # failed, and the script exited 1 without printing a word. The least
        # authorized signer must produce the clearest refusal, not the quietest.
        noeku = os.path.join(d, "noeku.sig")
        pki.sign(pki.p("noeku.pem"), manifest, noeku)
        rc, out = run_verifier(pki, manifest, noeku, pki.p("root.pem"))
        check("a signer with no EKU at all is refused", rc != 0, out)
        check("…and says why, rather than dying silently",
              "NOT authorized" in out, "output was: %r" % out)

        # A tampered manifest against a good signature.
        tampered = os.path.join(d, "tampered.json")
        with open(tampered, "w", encoding="utf-8") as f:
            f.write('{"version":"2026.09.8","channel":"stable","artifacts":[]}\n')
        rc, out = run_verifier(pki, tampered, good, pki.p("root.pem"))
        check("a tampered manifest is refused", rc != 0, out)
        check("…and is reported as a verification failure, not a stale release",
              "did NOT verify" in out, out)

        # A signature from a root we do not trust.
        with tempfile.TemporaryDirectory() as d2:
            other = PKI(d2)
            rogue = os.path.join(d, "rogue.sig")
            other.sign(other.p("release.pem"), manifest, rogue)
            rc, out = run_verifier(pki, manifest, rogue, pki.p("root.pem"))
            check("a signature from another root is refused", rc != 0, out)

        # No signature at all — an unsigned (pre-2026-09) release.
        missing = os.path.join(d, "absent.sig")
        rc, out = run_verifier(pki, manifest, missing, pki.p("root.pem"))
        check("an unsigned release is refused, not waved through", rc != 0, out)
        check("…and says the release is unsigned", "no signature" in out, out)

        print("H. an expired signing certificate reads as a stale release (dec 24)")
        exp = pki.expired_leaf()
        if exp is None:
            print("  skip  this openssl cannot mint a back-dated certificate")
        else:
            esig = os.path.join(d, "expired.sig")
            pki.sign(exp, manifest, esig)
            rc, out = run_verifier(pki, manifest, esig, pki.p("root.pem"),
                                   advice="Update the cluster before adding a node.")
            check("an expired signer is refused", rc != 0, out)
            check("…reported as expiry, not as tampering", "expired on" in out, out)
            check("…and it says the signature itself is intact",
                  "signature itself is intact" in out, out)
            check("…and it carries the caller's remedy",
                  "Update the cluster before adding a node." in out, out)


def test_root_fingerprint():
    print("I. the root CA is pinned by the fingerprint baked into the script")
    with tempfile.TemporaryDirectory() as d:
        try:
            pki = PKI(d)
        except RuntimeError as e:
            check("openssl can build the fixture PKI", False, str(e))
            return
        # A perfectly valid CA that is simply not ours.
        rc, out = run_trusted_root(pki, pki.p("root.pem"))
        check("a root that does not match the baked fingerprint is refused",
              rc != 0, out)
        check("…and the message shows both fingerprints",
              "expected" in out and "got" in out, out)

    # The check that matters: the shipped verifier must ACCEPT the root CA this
    # site actually serves, computed the way the script computes it. Comparing
    # two numbers that were both derived here would agree with itself while the
    # script disagreed with both — which is exactly how an early version of this
    # pinned the hash of the PEM file while comparing it to the fingerprint of
    # the certificate, and passed.
    served = os.path.join(ROOT, "static", "rasputin-root-ca.pem")
    with tempfile.TemporaryDirectory() as d:
        pki = type("Shim", (), {"d": d})()
        rc, out = run_trusted_root(pki, served)
        check("the verifier accepts the root CA this site serves", rc == 0, out)
        check("…and hands back a path to it", out.strip().endswith("root-ca.pem"), out)

    # And the number in the script is the published one, so the fingerprint a
    # human compares by eye is the same fingerprint the script enforces.
    r = subprocess.run([openssl_bin(), "x509", "-in", served, "-noout",
                        "-fingerprint", "-sha256"], capture_output=True, text=True)
    got = r.stdout.split("=", 1)[1].strip().replace(":", "").lower() if r.returncode == 0 else ""
    m = re.search(r'^RASPUTIN_ROOT_CA_SHA256="([0-9a-f]{64})"', script_text(), re.M)
    check("bootstrap.sh pins a fingerprint", m is not None)
    if m:
        check("…and it is the fingerprint of static/rasputin-root-ca.pem",
              m.group(1) == got, "script=%s served=%s" % (m.group(1), got))


if __name__ == "__main__":
    test_valid_label()
    test_seed_render()
    test_example_parity()
    test_prompts()
    test_prompt_rejects_bad_names()
    test_verifier()
    test_root_fingerprint()
    print()
    if failures:
        print("FAILED (%d): %s" % (len(failures), ", ".join(failures)))
        sys.exit(1)
    print("all bootstrap.sh seed/prompt/verifier tests passed")
