/**
 * Bảng xếp hạng ĐẦU/CUỐI theo xã — DESIGN.md §3d-4, §13d-B.
 *
 * ── Vì sao đây là HTML chứ không phải Plot ────────────────────────────────────────────
 *
 * Hình này thực chất là một **bảng có cột cột**: khoá là TÊN (chuỗi tiếng Việt dài, cần
 * cắt đuôi và cần `title` để đọc đủ), và mỗi hàng phải **bấm được** để chọn xã đó. Plot
 * dựng nhãn trục băng bằng SVG — không cắt đuôi được, không có `title`, và bắt sự kiện trên
 * từng băng là việc phải làm tay. Dựng thẳng bằng HTML thì cả ba thứ là mặc định.
 *
 * ── Hai luật của thang ────────────────────────────────────────────────────────────────
 *
 * 1. **Một thang cho cả hai đầu** (xem `rankCommunes`): chia thang riêng sẽ vẽ cột dài bằng
 *    nhau ở cả hai bảng, tức nhóm thấp nhất trông ngang ngửa nhóm cao nhất.
 * 2. **Neo ở 0**, không neo ở `min`: cột đo độ dài, và một cột bắt đầu từ `min` biến hiệu
 *    số giữa hai xã thành toàn bộ chiều dài của nó — phóng đại đúng thứ hình này định đo.
 *
 * Màu: một chuỗi ⇒ `c5`; xã ĐANG CHỌN nhấn bằng `c7` — đậm hơn trong CÙNG ramp, không phải
 * một hue thứ hai (§4d-2). Chữ không bao giờ mang màu dữ liệu.
 */

import type { FieldMeta } from "../fields";
import type { Ranked, RankRow } from "../viz/rank";
import { HAIRLINE_HEX, RAMP_HEX } from "../viz/palette";
import { formatValue } from "./format";

const SERIES = RAMP_HEX[4];
const CALLOUT = RAMP_HEX[6];

const BAR_W = 96;

function Group({
  title,
  note,
  rows,
  field,
  lo,
  hi,
  selected,
  onSelect,
}: {
  title: string;
  note: string | null;
  rows: RankRow[];
  field: FieldMeta;
  lo: number;
  hi: number;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  // Neo 0: miền vẽ luôn chứa 0, nên độ dài cột đọc được là "bao nhiêu", không phải "hơn xã
  // bét bao nhiêu". `span` không bao giờ là 0 — một measure hằng số vẫn phải vẽ ra được.
  const dLo = Math.min(0, lo);
  const dHi = Math.max(0, hi);
  const span = dHi - dLo || 1;
  const zero = ((0 - dLo) / span) * BAR_W;

  return (
    <div>
      <h4 className="flex items-baseline gap-2 border-b border-hairline px-2 py-1 text-note tracking-[0.1em] text-ink-2">
        {title}
        {note && <span className="tracking-normal text-ink-muted">{note}</span>}
      </h4>
      {rows.map((r) => {
        const on = r.code === selected;
        const len = (Math.abs(r.value) / span) * BAR_W;
        const left = r.value >= 0 ? zero : zero - len;
        return (
          <button
            key={r.code}
            onClick={() => onSelect(r.code)}
            title={`${r.name} — bấm để mở bằng chứng của xã này`}
            className={`flex w-full cursor-pointer items-center gap-2 border-b border-hairline px-2 py-1 text-left ${
              on ? "bg-basemap" : "hover:bg-basemap/50"
            }`}
          >
            <span className={`min-w-0 flex-1 truncate text-body ${on ? "text-ink" : "text-ink-2"}`}>
              {r.name}
            </span>
            {/* Rãnh + cột. Rãnh là hairline nền, không phải một chuỗi thứ hai. */}
            <span
              aria-hidden
              className="relative h-2 shrink-0 rounded-xs"
              style={{ width: BAR_W, background: HAIRLINE_HEX }}
            >
              <span
                className="absolute inset-y-0 rounded-xs"
                style={{ left, width: Math.max(1, len), background: on ? CALLOUT : SERIES }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-body tabular-nums text-ink-2">
              {formatValue(r.value, field)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * "N xã cùng bằng X" — chỉ hiện khi nhóm hoà nhiều hơn số hàng đang hiện.
 *
 * Không có dòng này thì bảng vu cho mấy cái tên đang hiện một vị trí mà cả một nhóm cùng
 * giữ, và thứ tự giữa chúng là do `sort` chứ không do dữ liệu. Cùng luật §3f-4: nói ra cái
 * bị loại, không chỉ cái được giữ.
 */
function Tie({ n, shown, value }: { n: number; shown: number; value: string }) {
  if (n <= shown) return null;
  return (
    <p className="border-b border-hairline px-2 py-1 text-note leading-snug text-ink-muted">
      {n.toLocaleString("vi-VN")} xã cùng bằng <span className="tabular-nums text-ink-2">{value}</span>{" "}
      — bảng chỉ hiện {shown} trong số đó, và thứ tự giữa chúng không mang nghĩa.
    </p>
  );
}

export function RankBars({
  data,
  field,
  selected,
  onSelect,
}: {
  data: Ranked;
  field: FieldMeta;
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  if (data.top.length === 0) {
    return (
      <p className="py-3 text-body text-ink-muted">
        Không xã nào có giá trị ở measure này, nên không có gì để xếp hạng.
      </p>
    );
  }

  // Đầu nào đáng lo là do CỰC TÍNH đã khai của trường quyết định, không do tôi đoán. Trường
  // không khai cực tính thì không dán nhãn nào — im lặng đúng hơn là đoán.
  const worryHigh = field.polarity === "high-bad";
  const worryLow = field.polarity === "high-good";

  return (
    <div>
      <Group
        title="CAO NHẤT"
        note={worryHigh ? "đầu đáng lo" : null}
        rows={data.top}
        field={field}
        lo={data.lo}
        hi={data.hi}
        selected={selected}
        onSelect={onSelect}
      />
      <Tie n={data.nAtHi} shown={data.top.length} value={formatValue(data.hi, field)} />
      <Group
        title="THẤP NHẤT"
        note={worryLow ? "đầu đáng lo" : null}
        rows={data.bottom}
        field={field}
        lo={data.lo}
        hi={data.hi}
        selected={selected}
        onSelect={onSelect}
      />
      <Tie n={data.nAtLo} shown={data.bottom.length} value={formatValue(data.lo, field)} />
      {data.nNull > 0 && (
        <p className="px-2 pt-1 text-note leading-snug text-ink-muted">
          {data.nNull.toLocaleString("vi-VN")}/{(data.nWithValue + data.nNull).toLocaleString("vi-VN")}{" "}
          xã không có giá trị ở measure này — chúng không lọt vào cả hai đầu, và không được
          xếp ở 0.
        </p>
      )}
    </div>
  );
}
