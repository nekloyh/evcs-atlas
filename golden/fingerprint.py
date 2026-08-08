"""Vân tay của một bảng — bất biến theo thứ tự dòng, nhạy với mọi thay đổi giá trị.

Đây là lưới an toàn của cả đợt refactor. Nó trả lời đúng MỘT câu hỏi:

    cây mã mới có cho ra đúng những con số mà cây mã cũ đã cho ra không?

Ba quy tắc làm nó dùng được:

1. **Bất biến theo thứ tự.** Mọi thống kê tính trên giá trị đã sắp xếp. Đổi thứ tự merge,
   đổi kiểu groupby, đổi số phân mảnh — vân tay không đổi. Chỉ GIÁ TRỊ đổi mới đổi vân tay.
2. **Tổng cộng dồn theo thứ tự đã sắp xếp.** ``np.sort(v).sum()`` cho cùng một bit pattern
   bất kể dữ liệu vào theo thứ tự nào. Không có bước này thì nhiễu dấu phẩy động của phép
   cộng sẽ báo động giả ở mọi lần chạy.
3. **Làm tròn 12 chữ số có nghĩa.** Đủ chặt để bắt mọi thay đổi thật (thay đổi nhỏ nhất
   đáng quan tâm là một ô đổi nhóm, tức ~1e-4 tương đối), đủ lỏng để bỏ qua bit cuối.

Cột chuỗi thì băm tập giá trị duy nhất đã sắp xếp: đổi nhãn ``HANOI`` → ``IN`` bị bắt,
đổi thứ tự dòng thì không.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

SIGDIGITS = 12


def _round(x: float) -> float | None:
    """Làm tròn về 12 chữ số có nghĩa; NaN/inf thành None để JSON không hỏng."""
    if x is None:
        return None
    x = float(x)
    if not math.isfinite(x):
        return None
    return float(f"{x:.{SIGDIGITS}g}")


def _hash_strings(values) -> str:
    """Băm tập giá trị duy nhất ĐÃ SẮP XẾP của một cột phân loại."""
    uniq = sorted(
        {"" if v is None or (isinstance(v, float) and math.isnan(v)) else str(v) for v in values}
    )
    h = hashlib.sha256()
    for u in uniq:
        h.update(u.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


def column_fingerprint(s: pd.Series) -> dict[str, Any]:
    """Vân tay một cột. Số thì thống kê, chuỗi/bool thì băm tập giá trị."""
    n_null = int(s.isna().sum())
    out: dict[str, Any] = {"n_null": n_null}

    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        v = pd.to_numeric(s, errors="coerce").to_numpy(dtype="float64")
        v = v[np.isfinite(v)]
        out["dtype"] = "num"
        out["n_finite"] = int(v.size)
        if v.size:
            v = np.sort(v)  # cộng dồn theo thứ tự cố định ⇒ bit pattern ổn định
            out["sum"] = _round(v.sum())
            out["min"] = _round(v[0])
            out["max"] = _round(v[-1])
            out["p50"] = _round(float(np.median(v)))
            # Tổng bình phương bắt được hoán vị giá trị GIỮA các dòng mà tổng không bắt được.
            out["sumsq"] = _round(float((v * v).sum()))
        return out

    out["dtype"] = "cat"
    vals = s.dropna().tolist()
    out["n_unique"] = int(len(set(map(str, vals))))
    out["hash"] = _hash_strings(vals)
    return out


def table_fingerprint(path: Path, key: str | None = None) -> dict[str, Any]:
    """Vân tay một file parquet: hình dạng, danh sách cột, và vân tay từng cột."""
    t = pq.read_table(path)
    df = t.to_pandas()
    doc: dict[str, Any] = {
        "n_rows": int(len(df)),
        "n_cols": int(len(df.columns)),
        "columns": sorted(map(str, df.columns)),
        "col": {},
    }
    for c in sorted(df.columns, key=str):
        # Cột hình học (WKB/list toạ độ) không fingerprint theo giá trị — chỉ đếm.
        if (
            df[c].dtype == object
            and len(df)
            and isinstance(df[c].dropna().iloc[:1].tolist() or [None], list)
        ):
            first = df[c].dropna()
            sample = first.iloc[0] if len(first) else None
            if isinstance(sample, (bytes, bytearray, np.ndarray)):
                doc["col"][str(c)] = {"dtype": "opaque", "n_null": int(df[c].isna().sum())}
                continue
        doc["col"][str(c)] = column_fingerprint(df[c])
    if key and key in df.columns:
        doc["key_hash"] = _hash_strings(df[key].tolist())
    return doc


def compare(base: dict, cur: dict, where: str) -> list[str]:
    """Danh sách chênh lệch giữa hai vân tay, mô tả bằng câu người đọc được."""
    d: list[str] = []
    if base == cur:
        return d

    for k in ("n_rows", "n_cols", "key_hash"):
        if base.get(k) != cur.get(k):
            d.append(f"{where}: {k} {base.get(k)!r} → {cur.get(k)!r}")

    bc, cc = set(base.get("columns", [])), set(cur.get("columns", []))
    if bc - cc:
        d.append(f"{where}: MẤT cột {sorted(bc - cc)}")
    if cc - bc:
        d.append(f"{where}: THÊM cột {sorted(cc - bc)}")

    for col in sorted(bc & cc):
        b, c = base["col"].get(col, {}), cur["col"].get(col, {})
        for k in sorted(set(b) | set(c)):
            if b.get(k) != c.get(k):
                d.append(f"{where}.{col}: {k} {b.get(k)!r} → {c.get(k)!r}")
    return d


def write_json(doc: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True), "utf-8")
