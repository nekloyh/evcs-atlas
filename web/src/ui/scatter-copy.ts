/**
 * CR 4.2 — chữ, vạch và nhãn của scatter bằng chứng Cầu × Tiếp cận.
 *
 * Vì sao tách khỏi `ui/Scatter.tsx`: file kia là `.tsx`, và `node --test` không nạp được
 * JSX. Mọi câu mà §C/§F bắt phải in ra — dòng đếm, bốn trạng thái, nhãn hai trục — nằm ở
 * đây, nên chúng được kiểm bằng GIÁ TRỊ THẬT chứ không bằng một phép grep trên mã nguồn.
 *
 * Module thuần: không React, không store, không DOM, không SQL.
 */

import {
  populationPlotFrac,
  type DemandAccessScatterModel,
  type PopulationDisplayDomain,
} from "../viz/chart-models";
import { formatSeries, scaleUnit, unitPhrase, withDigits, type ScaledUnit, type UnitSpec } from "../units";
import { formatPop } from "./format";

const vi = (n: number) => n.toLocaleString("vi-VN");

/**
 * Số NGƯỜI in ra chữ — làm tròn trước khi in.
 *
 * `GridCell.pop` là số thực (dân số phân bổ theo diện tích), nên `toLocaleString` trần in ra
 * `9.571,231 người`. Ba chữ số lẻ của một con số dân là độ chính xác GIẢ: nguồn không biết
 * tới phần nghìn người, và câu ấy khiến cả dòng đọc như một phép đo chính xác hơn thực tế.
 */
const people = (n: number) => vi(Math.round(n));

/** Tiêu đề trục X — nguyên văn §1.2, để cột histogram và chấm scatter gọi cùng một tên. */
export const SCATTER_X_AXIS_TITLE = "Dân số trên ô H3 · người";

/**
 * Nhãn đường 2 km. Nói *ngưỡng quy định*, KHÔNG nói *break* — §1.4: đây là một con số của
 * chính sách, không phải một ngưỡng rút ra từ phân bố.
 */
export const SCATTER_RULE_LABEL = "2 km · ngưỡng quy định";

export const SCATTER_HOVER_HINT = "rê hoặc dùng phím mũi tên để đọc mốc hai trục";
export const SCATTER_EMPTY_LATTICE = "chưa có ô nào ở đây";

/**
 * Bốn trạng thái, bốn câu KHÁC NHAU. Không câu nào là một khung trục rỗng — §6.1 mục 4: một
 * phụ thuộc thiếu phải nói ra lý do, vì một khung trống đọc thành "đo rồi, và không có gì".
 *
 * `unavailable` bám vào CỘT chứ không vào "không có hàng nào vẽ được", và sự khác nhau ấy là
 * cả vấn đề: khi cột vắng, `fetchField` phát `NULL AS dist` cho mọi hàng, nên biểu đồ sẽ rơi
 * vào nhánh `empty` và in "không ô nào có đủ hai giá trị" — một khẳng định về một phép đo
 * chưa từng được thực hiện.
 */
export const SCATTER_STATE_COPY = {
  loading: "Đang nạp lưới ô H3…",
  unavailable:
    "Gói dữ liệu này không có cột cự ly mạng đường, nên không dựng được bằng chứng cầu × tiếp cận.",
  empty: "Không ô nào có đủ cả dân số lẫn cự ly mạng đường.",
  /** Hỏng thì thừa kế đường hỏng của controller: khối này KHÔNG sở hữu request nào, nên nó không được sở hữu nút thử lại. */
  failed: "Không dựng được bằng chứng vì snapshot lưới ô H3 hỏng.",
} as const;

/**
 * Dòng đếm dưới khung vẽ — §C.
 *
 * Dòng 2 in dân số bằng SỐ NGƯỜI chứ không chỉ số ô, và đó là quyết định: "3 ô" nghe như một
 * sai số làm tròn, "9.571 người" thì không. Trên gói lớn nhất con số ấy là 8.805 ô và 62.178
 * người — một hợp đồng null coi phần này là chú thích cuối trang sẽ sai ở đúng chỗ nó cần đúng.
 */
export function scatterCountsLines(model: DemandAccessScatterModel): string[] {
  const lines: string[] = [
    `${vi(model.nPlotted)} ô đang vẽ · ${vi(model.nZeroPopulationPlotted)} ô không người (khe =0)`,
  ];

  if (model.nExcludedDistance > 0) {
    const share =
      model.populationKnownTotal > 0
        ? (model.popExcludedDistance / model.populationKnownTotal).toLocaleString("vi-VN", {
            style: "percent",
            maximumFractionDigits: 2,
          })
        : "—";
    lines.push(
      `${vi(model.nExcludedDistance)} ô chưa rõ cự ly mạng đường — nơi ${people(model.popExcludedDistance)} người ` +
        `(${share} dân đã biết) sinh sống — không có chỗ trên mặt phẳng hai trục nên KHÔNG được vẽ. ` +
        `Trên bản đồ chúng vẫn là vân xám.`,
    );
  }

  // Dòng 3 chỉ hiện khi có gì để nói, nhưng nó ĐƯỢC VIẾT dù mọi gói đang xuất đều cho 0 —
  // một nhánh không bao giờ in ra là một nhánh chưa từng được kiểm.
  if (model.nNullPopulation > 0 || model.nInvalid > 0) {
    const parts: string[] = [];
    if (model.nNullPopulation > 0) parts.push(`${vi(model.nNullPopulation)} ô khuyết dân số`);
    if (model.nInvalid > 0) parts.push(`${vi(model.nInvalid)} ô có giá trị hỏng (âm hoặc không hữu hạn)`);
    lines.push(`${parts.join(" · ")} — cũng không nằm trên mặt phẳng hai trục.`);
  }

  return lines;
}

export interface ScatterYTicks {
  values: number[];
  labels: string[];
  scaled: ScaledUnit;
  axisTitle: string;
}

const N_Y_TICKS = 4;

/**
 * Bốn vạch cách đều trên thang `sqrt`, giá trị NGHỊCH BIẾN ĐỔI về mét rồi in qua bộ máy
 * `scaleUnit` sẵn có — ở trục này điều kiện tiên quyết của nó ĐÚNG (một dải độ lớn duy nhất).
 *
 * `unit` phải là chính `FIELD_BY_ID.get("dist_station_network_m").unit`, truyền từ controller
 * xuống. Presenter không được gõ một `UnitSpec` nào: gõ tay là nhân bản registry ra chỗ thứ hai.
 */
export function scatterYTicks(maxDistanceM: number, unit: UnitSpec): ScatterYTicks {
  const scaledBase = scaleUnit(unit, maxDistanceM);
  const values: number[] = [];
  for (let i = 0; i <= N_Y_TICKS; i++) {
    const frac = i / N_Y_TICKS;
    values.push(frac * frac * maxDistanceM);
  }
  const scaled = withDigits(scaledBase, values);
  return {
    values,
    labels: formatSeries(values, scaled),
    scaled,
    axisTitle: scatterYAxisTitle(unit, scaled),
  };
}

/** `↑ cự ly tới trạm · km, theo mạng đường` — vế đơn vị đến từ `UnitSpec` đã đăng ký. */
export function scatterYAxisTitle(unit: UnitSpec, scaled: ScaledUnit): string {
  const phrase = unitPhrase(unit, scaled);
  return phrase ? `↑ cự ly tới trạm · ${phrase}` : "↑ cự ly tới trạm";
}

export interface ScatterXTick {
  value: number;
  /** Vị trí trong `[0, 1]` của bề ngang khung vẽ. */
  frac: number;
  label: string;
}

/** Bề rộng dành cho nhãn `maxPop` ở mép phải, tính bằng px — vạch nào chạm vào thì bị bỏ. */
const X_END_LABEL_PX = 18;

/**
 * Vạch thập phân `1 · 10 · 100 · 1k · 10k` nằm trong `[minPositivePop, maxPop]`.
 *
 * Đặt chỗ bằng ĐÚNG `populationPlotFrac` mà cột histogram dùng, nên vạch và cột không thể
 * trôi khỏi nhau. Nhãn là dân số THẬT — không giá trị `log1p` nào tới được màn hình.
 */
export function scatterXDecadeTicks(
  domain: PopulationDisplayDomain,
  plotW: number,
): ScatterXTick[] {
  if (!domain.hasPositive) return [];
  const minLog = Math.log1p(domain.minPositivePop);
  const maxLog = Math.log1p(domain.maxPop);
  if (!(maxLog > minLog)) return [];
  const out: ScatterXTick[] = [];
  for (let exp = 0; exp <= 7; exp++) {
    const value = 10 ** exp;
    if (value < domain.minPositivePop || value > domain.maxPop) continue;
    const frac = populationPlotFrac(value, domain);
    // Cùng luật bỏ vạch cuối như `PopulationHistogram`: hai chữ số chồng lên nhau ở mép phải
    // là hai ngưỡng thật đọc thành một.
    if (frac * plotW > plotW - X_END_LABEL_PX) continue;
    out.push({ value, frac, label: formatPop(value) });
  }
  return out;
}
