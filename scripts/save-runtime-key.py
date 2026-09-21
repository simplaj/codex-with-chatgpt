#!/usr/bin/env python3
"""Run directly in the user's terminal, never through an agent-captured prompt."""
import argparse
import getpass
import os
import sys
from pathlib import Path
import tempfile

parser = argparse.ArgumentParser(description="Save a runtime key without echoing or logging it")
parser.add_argument("--file", type=Path, default=Path.home() / ".config/c2c-private/runtime.key")
parser.add_argument("--replace", action="store_true", help="Explicitly replace an existing key")
args = parser.parse_args()
if not sys.stdin.isatty():
    parser.error("Run this helper directly in your own interactive terminal")
target = args.file.expanduser().absolute()
if target.is_symlink():
    parser.error("Refusing a symbolic-link credential path")
if target.exists() and not args.replace:
    parser.error("File already exists; use --replace only when intentionally rotating the key")
target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
if os.name == "nt":
    parser.error("Use an OS credential editor with an owner-only Windows ACL; this helper currently supports Unix")
if target.parent.stat().st_mode & 0o077:
    parser.error("Credential directory must be private (chmod 700)")
key = getpass.getpass("Paste runtime key (hidden), then Enter: ").strip()
if not key or any(c.isspace() for c in key):
    parser.error("Empty key or embedded whitespace. Copy only the secret value; nothing was saved")
fd, tmp = tempfile.mkstemp(prefix=".runtime-key-", dir=target.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(key + "\n")
    if args.replace:
        os.replace(tmp, target)
    else:
        os.link(tmp, target)  # Exclusive creation: never overwrite a raced file.
    print("Saved privately. Clear the clipboard. Do not share the key in chat.")
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
