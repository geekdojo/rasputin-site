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

Run:  python3 test/bootstrap_test.py
"""

import os
import pty
import re
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


if __name__ == "__main__":
    test_valid_label()
    test_seed_render()
    test_example_parity()
    test_prompts()
    test_prompt_rejects_bad_names()
    print()
    if failures:
        print("FAILED (%d): %s" % (len(failures), ", ".join(failures)))
        sys.exit(1)
    print("all bootstrap.sh seed/prompt tests passed")
