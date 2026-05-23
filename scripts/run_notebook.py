#!/usr/bin/env python3
"""Execute docs/afterglow-hands-on.ipynb headlessly to verify every cell runs,
then write the executed copy back (outputs embedded). Exits non-zero on error.
"""
import os
import sys
import nbformat
from nbclient import NotebookClient

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(repo, "docs", "afterglow-hands-on.ipynb")
nb = nbformat.read(path, as_version=4)

# Run with cwd = docs/ so the notebook's find_server() walks up to the repo.
client = NotebookClient(nb, timeout=120, kernel_name="python3",
                        resources={"metadata": {"path": os.path.join(repo, "docs")}})
client.execute()
nbformat.write(nb, path)

errors = []
for i, cell in enumerate(nb.cells):
    if cell.get("cell_type") != "code":
        continue
    for out in cell.get("outputs", []):
        if out.get("output_type") == "error":
            errors.append((i, out.get("ename"), out.get("evalue")))

if errors:
    print("NOTEBOOK ERRORS:")
    for i, en, ev in errors:
        print(f"  cell {i}: {en}: {ev}")
    sys.exit(1)
print("notebook executed cleanly:", len([c for c in nb.cells if c.cell_type == 'code']), "code cells, 0 errors")
