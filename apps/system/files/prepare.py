#!/usr/bin/env python3
"""Stage the pinned Chonky package for the app-specific build patch."""
import hashlib
import pathlib
import shutil

app = pathlib.Path(__file__).resolve().parent
source = app.parents[2] / 'active-system/tools/app-builder/node_modules/@samuelncui/chonky'
destination = app / 'node_modules/@samuelncui/chonky'
expected = 'ddc9e11830d1f87df2be80d6b339f90713b0b803e59b3a13a6f8edca5df2abe1'
if hashlib.sha256((source / 'dist/chonky.esm.js').read_bytes()).hexdigest() != expected:
    raise RuntimeError('Chonky source differs from the reviewed version; review the Files patch before building.')
if destination.exists():
    source_files = {p.relative_to(source): p.read_bytes() for p in source.rglob('*') if p.is_file()}
    staged_files = {p.relative_to(destination): p.read_bytes() for p in destination.rglob('*') if p.is_file()}
    if staged_files != source_files:
        raise RuntimeError('The staged Chonky package differs; inspect it before replacing it.')
else:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)
print('Staged reviewed Chonky 0.3.10 for the Files build patch.')
