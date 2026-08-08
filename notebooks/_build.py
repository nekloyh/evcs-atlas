"""Chuyển file nguồn dạng `# %%` thành .ipynb.

Notebook được GIỮ Ở DẠNG .py trong repo (đọc được, diff được, review được); .ipynb là
sản phẩm dựng ra. Chạy: uv run --group notebook python notebooks/_build.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import nbformat as nbf

HERE = Path(__file__).resolve().parent


def convert(src: Path) -> Path:
    nb = nbf.v4.new_notebook()
    cells, kind, buf = [], "code", []

    def flush():
        text = "\n".join(buf).strip("\n")
        if not text:
            return
        if kind == "md":
            cells.append(nbf.v4.new_markdown_cell(text))
        else:
            cells.append(nbf.v4.new_code_cell(text))

    for line in src.read_text("utf-8").splitlines():
        if line.startswith("# %% [markdown]"):
            flush()
            kind, buf = "md", []
        elif line.startswith("# %%"):
            flush()
            kind, buf = "code", []
        else:
            buf.append(line[2:] if (kind == "md" and line.startswith("# ")) else
                       ("" if (kind == "md" and line.strip() == "#") else line))
    flush()

    nb["cells"] = cells
    nb["metadata"] = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
    }
    out = src.with_suffix(".ipynb")
    nbf.write(nb, out)
    return out


if __name__ == "__main__":
    srcs = [Path(a) for a in sys.argv[1:]] or sorted(HERE.glob("[a-z]*.py"))
    for s in srcs:
        print("→", convert(s))
