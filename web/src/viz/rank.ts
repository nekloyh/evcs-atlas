/**
 * Xếp hạng ĐẦU và CUỐI của một measure theo xã — DESIGN.md §3d-4, §13d-B.
 *
 * §13d-B đòi app phải **gọi được tên**: một bản đồ tô màu và một histogram đếm cột đều nói
 * "có chỗ lệch", không cái nào nói *chỗ nào*. Cảnh CÂU CHUYỆN gọi tên đúng hai phường vì
 * chúng được viết cứng vào kịch bản; ở chế độ BẢN ĐỒ, với measure nào cũng đổi được, danh
 * sách phải dựng từ dữ liệu.
 *
 * Trả về CẢ HAI đầu chứ không chỉ đầu cao: với `polarity: "high-good"` thì đầu đáng lo là
 * đầu THẤP, với `high-bad` thì ngược lại — và hàm này không biết cực tính, nên nó không
 * được thay người đọc chọn đầu nào đáng nhìn.
 */

export interface RankRow {
  code: string;
  name: string;
  value: number;
}

export interface Ranked {
  /** `n` xã có giá trị lớn nhất, giảm dần. */
  top: RankRow[];
  /** `n` xã có giá trị nhỏ nhất, TĂNG dần — đọc từ đáy đi lên, cùng chiều với `top`. */
  bottom: RankRow[];
  /** Cạnh dưới/trên của thang chung cho cả hai đầu (kể cả xã không lọt bảng). */
  lo: number;
  hi: number;
  /**
   * Số xã BẰNG ĐÚNG `lo` / `hi`.
   *
   * Cần vì một lý do trung thực, không phải để trang trí: `ports_per_10k_pop` có hàng chục
   * xã bằng đúng 0, nên "8 xã thấp nhất" là **8 cái tên rút ngẫu nhiên** trong một nhóm
   * đông hơn nhiều — thứ tự giữa chúng do `sort` quyết định, không do dữ liệu. Bảng phải
   * nói ra điều đó, nếu không nó vu cho 8 xã một vị trí mà 40 xã cùng giữ.
   */
  nAtLo: number;
  nAtHi: number;
  nWithValue: number;
  /** Xã có mặt nhưng KHÔNG có giá trị ở measure này — phải nói ra, không được lặng lẽ bỏ. */
  nNull: number;
}

const EMPTY: Ranked = { top: [], bottom: [], lo: 0, hi: 0, nAtLo: 0, nAtHi: 0, nWithValue: 0, nNull: 0 };

/**
 * Thang dùng chung cho hai đầu là **cố ý**: chia thang riêng cho mỗi nhóm sẽ vẽ cột dài
 * bằng nhau ở cả hai bảng, tức nhóm thấp nhất trông ngang ngửa nhóm cao nhất — đúng cái mà
 * hai bảng này tồn tại để phủ định.
 */
export function rankCommunes(
  rows: readonly { code: string; name: string; value: number | null }[],
  n = 8,
): Ranked {
  const ok: RankRow[] = [];
  let nNull = 0;
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) {
      nNull++;
      continue;
    }
    ok.push({ code: r.code, name: r.name, value: r.value });
  }
  if (ok.length === 0) return { ...EMPTY, nNull };

  const sorted = [...ok].sort((a, b) => b.value - a.value);
  const hi = sorted[0]!.value;
  const lo = sorted[sorted.length - 1]!.value;

  // Hai đầu KHÔNG được trùng nhau: với ít hơn `2n` xã, `slice` từ hai phía sẽ kể cùng một
  // xã hai lần và người đọc thấy "Ba Đình" nằm trong cả nhóm cao nhất lẫn thấp nhất.
  const k = Math.min(n, Math.floor(sorted.length / 2));
  return {
    top: sorted.slice(0, k),
    // TĂNG dần: xã thấp nhất đứng ĐẦU nhóm "THẤP NHẤT". Mỗi nhóm mở đầu bằng cái cực đoan
    // nhất của nó; xếp ngược lại thì hàng mắt chạm trước là hàng ít đáng nhìn nhất.
    bottom: sorted.slice(sorted.length - k).reverse(),
    lo,
    hi,
    nAtLo: ok.reduce((s, r) => s + (r.value === lo ? 1 : 0), 0),
    nAtHi: ok.reduce((s, r) => s + (r.value === hi ? 1 : 0), 0),
    nWithValue: ok.length,
    nNull,
  };
}
