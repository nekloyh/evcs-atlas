/**
 * Bảy cảnh của chế độ CÂU CHUYỆN — PHASE7_STORY_MODE.md §2.
 *
 * **Không một con số nào trong file này.** Mỗi con số là một `MetricRef` trỏ vào một
 * builder dùng chung; mỗi mã xã là một `SubjectSpec` phân giải trên gói đang mở; mỗi mức
 * phóng là một `CameraSpec` đi qua `zoomForFeatureBounds`. Đó không phải sự khắt khe cho
 * vui: một câu chuyện là chỗ dễ nhất để một con số cũ sống sót qua ba lần đổi dữ liệu mà
 * không ai thấy, **vì không ai đọc lại nó**.
 *
 * File này KHÔNG import `queries.ts`: file đó kéo theo `duckdb.ts`, và `duckdb.ts` import
 * `.wasm?url` của Vite — thứ `node --test` không giải được. Nhờ vậy toàn bộ luật "cảnh nào
 * chốt state gì" assert được chứ không phải chụp ảnh được.
 */

import { INITIAL_VIEW, zoomForBbox, zoomForFeatureBounds } from "../state/view-config";
import { SCENE_CONTEXT_ZOOM_OUT } from "../domain-thresholds";
import type { Manifest } from "../data/manifest";
import type { RoadSeg } from "../data/queries";
import type { View } from "../state/types";
import type { CellValue } from "../viz/palette";
import type { ScaleControlModel } from "../fields";
import {
  ASSUMPTIONS,
  resolveSubject,
  type ResolveContext,
  type StoryModels,
  type StoryPackage,
} from "./resolve";
import { majorBridges } from "./bridges";
import type { BeatSpec, CameraSpec, SceneId, SceneSpec, SceneState } from "./spec";
import { SCENE_IDS } from "./spec";

export { SCENE_IDS } from "./spec";
export type { SceneId, SceneMark, SceneSpec, SceneState, BeatSpec } from "./spec";

// ── Bảy cảnh ────────────────────────────────────────────────────────────────

export const SCENES: readonly SceneSpec[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    id: "von-cuc",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM A",
    title: "Cầu không trải đều",
    lens: "demand",
    claim: {
      parts: [
        "Người ở ",
        { provinceName: true },
        " dồn lại chứ không trải đều: ",
        { slot: { src: "model", model: "lorenz-area-pop", select: "areaForHalfPop" }, fmt: "percent1" },
        " diện tích chứa một nửa dân số. Và số “vùng dày” tách rời nhau là ",
        { em: "thuộc tính của lát cắt ta chọn, không phải của địa bàn" },
        " — ",
        { slot: { src: "model", model: "spatial-structure", select: "steps.0.nComponents" }, fmt: "count" },
        " vùng ở phân vị ",
        { slot: { src: "model", model: "spatial-structure", select: "steps.0.q" }, fmt: "quantile" },
        ", đúng ",
        { slot: { src: "model", model: "spatial-structure", select: "steps.3.nComponents" }, fmt: "count" },
        " ở phân vị ",
        { slot: { src: "model", model: "spatial-structure", select: "steps.3.q" }, fmt: "quantile" },
        ".",
      ],
    },
    camera: { kind: "fit-province" },
    layers: [],
    subjects: [{ kind: "province" }],
    select: { kind: "none" },
    chart: { kind: "primary", id: "demand-population-histogram" },
    requires: { gridColumns: ["population", "pop_density_ppkm2"] },
    beats: [
      {
        id: "mat-do",
        label: "mặt độ cầu",
        field: "population",
        marks: [],
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "lorenz-area-pop", select: "areaForHalfPop" },
            fmt: "percent1",
            unit: "diện tích",
            caption: {
              parts: [
                "là tất cả những gì cần để chứa ",
                { em: "một nửa" },
                " dân số ",
                { provinceName: true },
                ". ",
                { slot: { src: "model", model: "lorenz-area-pop", select: "restOfArea" }, fmt: "percent1" },
                " diện tích còn lại chứa nửa kia.",
              ],
            },
          },
          { kind: "figure-slot", id: "lorenz-area-pop" },
          {
            kind: "stat",
            label: {
              parts: [
                { slot: { src: "model", model: "lorenz-area-pop", select: "areaReadShare" }, fmt: "percent" },
                " diện tích dày dân nhất chứa",
              ],
            },
            value: { src: "model", model: "lorenz-area-pop", select: "popShareForTenthArea" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["hệ số Gini của dân trên diện tích"] },
            value: { src: "model", model: "lorenz-area-pop", select: "gini" },
            fmt: "number",
          },
          {
            kind: "stat",
            label: { parts: ["ô lưới đưa vào phép tính"] },
            value: { src: "model", model: "lorenz-area-pop", select: "nCells" },
            fmt: "count",
          },
          {
            kind: "para",
            text: {
              parts: [
                "Đường cong trên là ",
                { em: "Lorenz" },
                ": ô lưới xếp theo mật độ giảm dần, rồi cộng dồn cả diện tích lẫn dân số. Đường thẳng nhạt là hình dạng mà một địa bàn trải đều sẽ có. Khoảng cách giữa hai đường chính là sự dồn lại.",
              ],
            },
          },
          {
            kind: "para",
            text: {
              parts: [
                "Diện tích ở đây là phần ",
                { em: "nằm trong ranh giới tỉnh/thành" },
                " (area_km2 × area_frac), không phải diện tích hình học của ô. Dân số của ô biên chỉ tính phần trong ranh giới, nên mẫu số phải khớp — nếu không, ô biên được gán một phần diện tích mà dân của nó không ở trong đó, và đường cong sẽ nói địa bàn trải đều hơn thực tế.",
              ],
            },
          },
        ],
      },
      {
        id: "nguong-p90",
        label: "lát cắt phân vị trên",
        field: "pop_density_ppkm2",
        marks: [],
        filter: {
          field: "pop_density_ppkm2",
          op: "ge",
          value: { kind: "quantile", q: 0.9 },
          label: {
            parts: [
              "mật độ từ lát cắt phân vị ",
              { slot: { src: "model", model: "spatial-structure", select: "steps.0.q" }, fmt: "quantile" },
              " trở lên",
            ],
          },
        },
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "spatial-structure", select: "steps.0.nComponents" },
            fmt: "count",
            unit: "vùng rời nhau",
            caption: {
              parts: [
                "ở lát cắt phân vị ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.q" }, fmt: "quantile" },
                " — nhưng chỉ ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.nComponentsGe3" }, fmt: "count" },
                " vùng đủ lớn để không còn là một đốm. Vùng lớn nhất một mình chiếm ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.largestComponentCells" }, fmt: "count" },
                " trong ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.nCells" }, fmt: "count" },
                " ô còn lại: một lõi cộng một đám đốm.",
              ],
            },
          },
          { kind: "figure-slot", id: "structure-sweep" },
          {
            kind: "stat",
            label: { parts: ["giá trị THẬT của lát cắt"] },
            value: { src: "model", model: "spatial-structure", select: "steps.0.threshold" },
            fmt: "count",
            unit: "người/km²",
          },
          {
            kind: "stat",
            label: { parts: ["dân trong vùng lớn nhất"] },
            value: { src: "model", model: "spatial-structure", select: "steps.0.largestComponentPop" },
            fmt: "count",
            unit: "người",
          },
          {
            kind: "stat",
            label: { parts: ["Moran's I của dân số trên cùng đồ thị kề"] },
            value: { src: "model", model: "spatial-structure", select: "moranI" },
            fmt: "number",
          },
          {
            kind: "assumption",
            id: "density-quantiles",
            note: {
              parts: [
                { slot: { src: "model", model: "spatial-structure", select: "steps.length" }, fmt: "count" },
                " lát cắt này do ta chọn. Chính việc đổi lát cắt là luận điểm — nếu chỉ in một lát cắt thì con số vùng sẽ trông như một sự thật về địa bàn.",
              ],
            },
          },
        ],
      },
      {
        id: "nguong-p99",
        label: "lát cắt phân vị đỉnh",
        field: "pop_density_ppkm2",
        marks: [],
        filter: {
          field: "pop_density_ppkm2",
          op: "ge",
          value: { kind: "quantile", q: 0.99 },
          label: {
            parts: [
              "mật độ từ lát cắt phân vị ",
              { slot: { src: "model", model: "spatial-structure", select: "steps.3.q" }, fmt: "quantile" },
              " trở lên",
            ],
          },
        },
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "spatial-structure", select: "steps.3.nComponents" },
            fmt: "count",
            unit: "vùng rời nhau",
            caption: {
              parts: [
                "ở lát cắt phân vị ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.3.q" }, fmt: "quantile" },
                ", trên ",
                { em: "cùng một trường" },
                " vừa cho ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.nComponents" }, fmt: "count" },
                " vùng. Số vùng không nằm trong địa bàn; nó nằm trong ngưỡng.",
              ],
            },
          },
          { kind: "figure-slot", id: "structure-sweep" },
          {
            kind: "stat",
            label: { parts: ["giá trị THẬT của lát cắt"] },
            value: { src: "model", model: "spatial-structure", select: "steps.3.threshold" },
            fmt: "count",
            unit: "người/km²",
          },
          {
            kind: "stat",
            label: { parts: ["ô còn lại sau lát cắt"] },
            value: { src: "model", model: "spatial-structure", select: "steps.3.nCells" },
            fmt: "count",
            unit: "ô",
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Nếu cầu trải đều thì công cụ đúng là chia lưới, và mọi mô hình cụm đều thừa. Cầu ",
                { em: "không" },
                " trải đều. Nhưng hãy đọc kỹ điều thứ hai: số vùng dày đi từ ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.0.nComponents" }, fmt: "count" },
                " xuống ",
                { slot: { src: "model", model: "spatial-structure", select: "steps.3.nComponents" }, fmt: "count" },
                " chỉ vì ta đổi lát cắt. Nên một phương pháp ",
                { em: "phải được cho biết trước có bao nhiêu cụm" },
                " đang bị hỏi một câu mà dữ liệu này không trả lời được — còn một phương pháp gán thành viên ",
                { em: "mềm" },
                " không phải một sở thích thẩm mỹ, nó là câu trả lời trung thực cho một trường không có chỗ gãy tự nhiên.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    id: "cung-lech",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM B",
    title: "Cung không đi theo cầu",
    lens: "supply",
    claim: {
      parts: [
        "Cung dồn chặt hơn cầu rất nhiều, và nó dồn ở ",
        { em: "chỗ khác" },
        ": Gini của cổng trên người là ",
        { slot: { src: "model", model: "supply-equity", select: "gini" }, fmt: "number" },
        " so với ",
        { slot: { src: "model", model: "lorenz-area-pop", select: "gini" }, fmt: "number" },
        " của người trên đất; ",
        { slot: { src: "model", model: "commune-supply", select: "nZeroPorts" }, fmt: "count" },
        " xã không có một cổng công cộng nào, và ",
        { slot: { src: "model", model: "commune-supply", select: "popZeroPorts" }, fmt: "count" },
        " người sống trong đó.",
      ],
    },
    camera: { kind: "fit-province" },
    layers: ["stations"],
    subjects: [
      // Xã ĐÔNG DÂN NHẤT mà không có cổng nào — một câu về một LUẬT, không về một nơi.
      { kind: "commune-extreme", measure: "population", at: "max", where: "zero-ports" },
      // Đầu kia của cùng thang đo: xã mang nhiều cổng nhất thành phố.
      { kind: "commune-extreme", measure: "n_ports", at: "max" },
    ],
    select: { kind: "subject", which: 0 },
    chart: {
      kind: "none",
      why: "cơ cấu công suất trả lời một câu hỏi khác — cảnh về luật loại trừ dùng nó ở chỗ nó LÀ luận điểm",
    },
    requires: {
      communeColumns: ["population", "n_ports", "ports_per_10k_pop"],
      gridColumns: ["population", "n_ports"],
    },
    beats: [
      {
        id: "goi-ten",
        label: "cổng trên 10k dân",
        field: "commune:ports_per_10k_pop",
        marks: [],
        blocks: [
          {
            kind: "subject-card",
            which: 0,
            why: {
              parts: [
                "Xã đông dân nhất trong gói này mà không có một cổng sạc công cộng nào. Không phải ít hơn — là ",
                { em: "không có" },
                ".",
              ],
            },
            rows: [
              { select: "population", fmt: "count", unit: "dân" },
              { select: "ports", fmt: "count", unit: "cổng" },
              { select: "perPop", fmt: "number", unit: "cổng/10k dân" },
              // `vsMedian` là `null` khi tử số bằng 0 ⇒ dòng này biến mất. Một tỉ số bằng 0
              // so với trung vị không nói được gì; in nó ra là mời đọc "kém hơn ít".
              { select: "vsMedian", fmt: "multiple", unit: "trung vị", optional: true },
            ],
          },
          {
            kind: "subject-card",
            which: 1,
            why: {
              parts: ["Đầu kia của cùng một thang: xã mang số cổng lớn nhất trong gói."],
            },
            rows: [
              { select: "population", fmt: "count", unit: "dân" },
              { select: "ports", fmt: "count", unit: "cổng" },
              { select: "perPop", fmt: "number", unit: "cổng/10k dân" },
              { select: "vsMedian", fmt: "multiple", unit: "trung vị", optional: true },
            ],
          },
          {
            kind: "stat",
            label: {
              parts: [
                "trung vị ",
                { slot: { src: "model", model: "commune-supply", select: "n" }, fmt: "count" },
                " xã",
              ],
            },
            value: { src: "model", model: "commune-supply", select: "median" },
            fmt: "number",
            unit: "cổng/10k dân",
          },
          {
            kind: "para",
            text: {
              parts: [
                "Hai con số trên là số của ",
                { em: "LỚP XÃ" },
                " (commune.geojson), không phải tổng các ô lưới trong xã. Hai đơn vị đọc ấy có thể lệch nhau đáng kể ở cùng một xã, nên trộn chúng trong một câu là dựng một sự thật thứ ba không tồn tại. Cảnh về bán kính phục vụ đọc theo đơn vị Ô, và nó nói ra điều đó ở ngay chỗ ấy.",
              ],
            },
          },
          {
            kind: "para",
            text: {
              parts: [
                "Đây là một ",
                { em: "tỉ số" },
                ", và tỉ số với mẫu số nhỏ thì vọt: một xã ít dân có vài trạm lớn sẽ lên rất cao mà không có nghĩa là nó được phục vụ tốt hơn. Đó là lý do phải đọc kèm cột dân số. Thêm một cảnh báo về mẫu số: dân số của xã neo theo số công bố toàn quốc, mà tổng ấy cao hơn thực tế và cao không đều giữa các tỉnh — nên mọi con số “trên đầu người” ở đây thừa hưởng sai lệch đó.",
              ],
            },
          },
        ],
      },
      {
        id: "duong-cong",
        label: "đường cong cung",
        field: "commune:ports_per_10k_pop",
        marks: [],
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "supply-equity", select: "cellsForHalfPorts" },
            fmt: "count",
            unit: "ô",
            caption: {
              parts: [
                "chứa một nửa toàn bộ cổng công cộng đã lắp, trong ",
                { slot: { src: "model", model: "supply-equity", select: "nCells" }, fmt: "count" },
                " ô của gói.",
              ],
            },
          },
          { kind: "figure-slot", id: "supply-lorenz" },
          {
            kind: "stat",
            label: {
              parts: [
                { slot: { src: "model", model: "supply-equity", select: "popReadShare" }, fmt: "percent" },
                " dân đông nhất giữ",
              ],
            },
            value: { src: "model", model: "supply-equity", select: "portShareForTenthPop" },
            fmt: "percent1",
            unit: "số cổng",
          },
          {
            kind: "stat",
            label: { parts: ["ô không có cổng nào"] },
            value: { src: "model", model: "supply-equity", select: "shareCellsZeroPorts" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["cổng nằm ở ô KHÔNG có dân"] },
            value: { src: "model", model: "supply-equity", select: "portsNoPop" },
            fmt: "count",
            unit: "cổng",
          },
          {
            kind: "stat",
            label: {
              parts: [
                { slot: { src: "model", model: "commune-supply", select: "topN" }, fmt: "count" },
                " xã nhiều cổng nhất giữ",
              ],
            },
            value: { src: "model", model: "commune-supply", select: "top10PortShare" },
            fmt: "percent1",
            unit: "số cổng",
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Nếu cung đã đi theo cầu thì không có bài toán đặt trạm nào để giải. Đọc kỹ chỗ này: xã đầu tiên ở trên có ",
                {
                  slot: { src: "subject", which: 0, select: "perPop" },
                  fmt: "number",
                  unit: "cổng/10k dân",
                },
                ". Một tỉ số với tử số bằng không thì không nhỏ hơn ",
                { em: "mấy lần" },
                " — nó không phải một con số nhỏ, nó là không có số nào.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    id: "di-vong",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM C",
    title: "Thước đo phải theo mạng đường",
    lens: "access",
    basemapLayer: "river",
    claim: {
      parts: [
        "Đường chim bay không phải bản rẻ tiền của đường thật — nó sai ",
        { em: "về một phía duy nhất" },
        ". Ở bán kính so sánh, chim bay báo ",
        { slot: { src: "model", model: "detour", select: "falsePositive" }, fmt: "count" },
        " ô là đã phủ mà mạng đường nói là chưa, và ",
        { slot: { src: "model", model: "detour", select: "nCells" }, fmt: "count" },
        " ô có đường đi thật dài hơn ",
        { slot: { src: "assumption", id: "detour-threshold" }, fmt: "multiple" },
        " đường thẳng.",
      ],
    },
    camera: { kind: "fit-marks", mark: "bridges" },
    layers: [],
    subjects: [{ kind: "province" }],
    select: { kind: "none" },
    chart: { kind: "primary", id: "access-population-curve" },
    requires: {
      gridColumns: ["detour_ratio", "dist_station_network_m", "dist_station_euclid_m"],
      roadColumns: ["dist_station_m"],
    },
    beats: [
      {
        id: "mang-duong",
        label: "nguyên nhân",
        field: "road:dist_station_m",
        marks: ["bridges", "routes"],
        camera: { kind: "fit-marks", mark: "bridges" },
        blocks: [
          {
            kind: "para",
            text: {
              parts: [
                "Bản đồ đang tô ",
                { em: "mạng đường" },
                ", không phải ô lưới: mỗi đoạn phố mang khoảng cách theo đường tới trạm gần nhất. Đây là cùng phép Dijkstra đã tính khoảng cách cho từng ô — chỉ khác là lần này ta giữ lại nhãn trên đoạn thay vì ném nó đi.",
              ],
            },
          },
          {
            kind: "stat",
            label: { parts: ["đoạn đường được tô"] },
            value: { src: "model", model: "roads", select: "waysDrawn" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["đoạn mang cờ cầu trong chính tập đang vẽ"] },
            value: { src: "model", model: "roads", select: "bridgeWays" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["trong đó dài hơn ngưỡng — kẻ đậm"] },
            value: { src: "model", model: "roads", select: "majorBridges" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["đoạn không tới được — vẽ xám, không vẽ bằng không"] },
            value: { src: "model", model: "roads", select: "unreachable" },
            fmt: "count",
          },
          {
            kind: "assumption",
            id: "major-bridge-min",
            note: {
              parts: [
                "Bộ dữ liệu KHÔNG có cờ “bắc qua sông nào”, nên bộ lọc này chọn theo ",
                { em: "chiều dài" },
                " và câu chữ phải nói đúng thứ nó chọn: một đoạn được kẻ đậm vì nó dài, không vì nó bắc qua một con sông cụ thể.",
              ],
            },
          },
          // Hai đoạn dưới là VĂN BIÊN TẬP về Hà Nội (sông Hồng và sáu cây cầu) — Phase 7
          // §1.8 khoanh đúng chúng vào `editorialProvince: "01"`. 33 gói còn lại vẫn thấy
          // toàn bộ cơ chế (màu chảy theo mạng đường, số cầu, số đoạn) qua các khối trên.
          {
            kind: "para",
            editorialProvince: "01",
            text: {
              parts: [
                "Nhìn màu ",
                { em: "chảy" },
                ": nó đi dọc phố, đậm dần khi xa trạm, rồi khựng lại ở sông Hồng. Bờ đông không hề xa trung tâm theo đường chim bay, nhưng theo đường đi thì nó phải vòng qua vài cây cầu, và mọi thứ ở đó tối đi cùng một lúc.",
              ],
            },
          },
          {
            kind: "para",
            editorialProvince: "01",
            text: {
              parts: [
                "Các cây cầu chính qua sông Hồng trong phạm vi này là Thăng Long · Nhật Tân · Long Biên · Chương Dương · Vĩnh Tuy · Thanh Trì. Tên là ",
                { em: "chữ biên tập, không đến từ dữ liệu" },
                ": bản trích OSM không mang cột name. Vì thế chúng nằm ở đây dưới dạng câu chứ không dán làm nhãn trên bản đồ — dán nhãn là khẳng định một toạ độ mà ta không neo được.",
              ],
            },
          },
          // Tiêu đề nằm TRONG khe hình, không đứng trước nó: một tiêu đề còn lại sau khi
          // nội dung của nó biến mất là một lời hứa không giữ được, và mắt đọc nó thành
          // "chỗ này lẽ ra có gì đó" mà không nói được là đang chờ hay đã hỏng.
          { kind: "figure-slot", id: "route-pairs" },
        ],
      },
      {
        id: "hau-qua",
        label: "hậu quả đo được",
        field: "detour_ratio",
        marks: [],
        camera: { kind: "fit-province" },
        filter: {
          field: "detour_ratio",
          op: "gt",
          value: { kind: "assumption", id: "detour-threshold" },
          label: { parts: ["hệ số đi vòng vượt ngưỡng giả định"] },
        },
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "detour", select: "nCells" },
            fmt: "count",
            unit: "ô",
            caption: {
              parts: [
                "có đường đi thật dài hơn ngưỡng giả định so với đường chim bay — và ",
                { slot: { src: "model", model: "detour", select: "pop" }, fmt: "count" },
                " người sống trong chúng. Đây là hậu quả đo được của cái cơ chế vừa xem.",
              ],
            },
          },
          {
            kind: "stat",
            label: { parts: ["hệ số đi vòng, trung vị toàn lưới"] },
            value: { src: "model", model: "detour", select: "median" },
            fmt: "multiple",
          },
          {
            kind: "stat",
            label: {
              parts: [
                "ô mà CHIM BAY nói đã phủ trong ",
                { slot: { src: "model", model: "detour", select: "radiusKm" }, fmt: "number" },
                " km",
              ],
            },
            value: { src: "model", model: "detour", select: "euclidCovered" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["ô mà MẠNG ĐƯỜNG xác nhận đã phủ"] },
            value: { src: "model", model: "detour", select: "networkCovered" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["chênh lệch — ô báo phủ nhầm"] },
            value: { src: "model", model: "detour", select: "falsePositive" },
            fmt: "count",
          },
          {
            kind: "stat",
            label: { parts: ["tỉ lệ báo nhầm trên tổng ô chim bay gọi là đã phủ"] },
            value: { src: "model", model: "detour", select: "falsePositiveShare" },
            fmt: "percent1",
          },
          {
            kind: "assumption",
            id: "detour-threshold",
            note: {
              parts: [
                "Ngưỡng này là chỗ ta cắt, không phải chỗ dữ liệu gãy. Cùng ngưỡng mà bước kiểm định dùng, nên con số trên màn hình và con số trong hồ sơ QA nói về cùng một tập ô.",
              ],
            },
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Đây là câu trả lời cho “vì sao không dùng k-means Euclid cho xong”. k-means tối thiểu hoá khoảng cách thẳng; ở đây khoảng cách thẳng không nhiễu — nó ",
                { em: "lệch có hệ thống và có nguyên nhân hình học" },
                ". Sai số không bao giờ chỉ về phía kia: đường đi thật không bao giờ ngắn hơn đường thẳng. Một thuật toán tối thiểu hoá khoảng cách thẳng đang tối ưu một đại lượng lạc quan quá mức đúng ở những chỗ được phục vụ tệ nhất.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    id: "ngoai-2km",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM D",
    title: "Những người ngoài bán kính",
    lens: "opportunity",
    claim: {
      parts: [
        { slot: { src: "model", model: "access-curve", select: "beyond" }, fmt: "count" },
        " người — ",
        { slot: { src: "model", model: "access-curve", select: "shareBeyond" }, fmt: "percent1" },
        " dân trên địa bàn — bắt đầu chuyến đi cách trạm công cộng gần nhất hơn bán kính phục vụ, tính ",
        { em: "theo đường thật" },
        ". Khoảng trống ấy không thuộc về một xã nào: xã nặng nhất chỉ chiếm ",
        { slot: { src: "model", model: "opportunity-rank", select: "topShareOfGap" }, fmt: "percent1" },
        " của nó.",
      ],
    },
    camera: { kind: "fit-province" },
    layers: ["beyond2km", "stations"],
    subjects: [
      { kind: "province" },
      // Xã có SỐ NGƯỜI ngoài bán kính lớn nhất TRONG SỐ những xã mà quá nửa dân của chính
      // nó cũng ở ngoài — hai điều kiện, nên thẻ không thể là hiện tượng của mẫu số nhỏ.
      { kind: "commune-set", rank: "population_beyond_2km", take: 10 },
    ],
    select: { kind: "none" },
    chart: { kind: "primary", id: "opportunity-commune-rank" },
    requires: {
      gridColumns: ["dist_station_network_m", "population"],
      communeColumns: ["population"],
    },
    beats: [
      {
        id: "khoang-trong",
        label: "khoảng cách theo mạng đường",
        field: "dist_station_network_m",
        marks: [],
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "access-curve", select: "beyond" },
            fmt: "count",
            unit: "người",
            caption: {
              parts: [
                "ở ngoài bán kính phục vụ, tức ",
                { slot: { src: "model", model: "access-curve", select: "shareBeyond" }, fmt: "percent1" },
                " dân trên địa bàn.",
              ],
            },
          },
          { kind: "figure-slot", id: "access-curve" },
          {
            kind: "stat",
            label: { parts: ["trong bán kính"] },
            value: { src: "model", model: "access-curve", select: "within" },
            fmt: "count",
            unit: "người",
          },
          {
            kind: "stat",
            label: { parts: ["KHÔNG đo được khoảng cách — không gộp vào bên nào"] },
            value: { src: "model", model: "access-curve", select: "unknown" },
            fmt: "count",
            unit: "người",
          },
          {
            kind: "stat",
            label: { parts: ["số ô mang phần dân chưa đo được ấy"] },
            value: { src: "model", model: "access-curve", select: "unknownCells" },
            fmt: "count",
            unit: "ô",
          },
          {
            kind: "assumption",
            id: "beyond-2km",
            note: {
              parts: [
                "Bán kính này là ",
                { em: "của chúng ta" },
                ", không phải thứ dữ liệu tìm ra. Đổi nó thì mọi con số trong cảnh này đổi theo — đó chính là lý do nó phải hiện ra chứ không nấp trong một con số trông như đã đo.",
              ],
            },
          },
          {
            kind: "subject-card",
            which: 1,
            why: {
              parts: [
                "Xã có nhiều người ngoài bán kính nhất, ",
                { em: "trong số những xã mà quá nửa dân của chính nó cũng ở ngoài" },
                " — hai điều kiện, để thẻ này không thể là hiện tượng của một mẫu số nhỏ.",
              ],
            },
            rows: [
              { select: "populationBeyond2km", fmt: "count", unit: "người ngoài bán kính" },
              { select: "shareBeyond2km", fmt: "percent1", unit: "dân của chính xã" },
              { select: "population", fmt: "count", unit: "dân (lớp xã)" },
            ],
          },
          { kind: "figure-slot", id: "opportunity-rank" },
          {
            kind: "stat",
            label: {
              parts: [
                { slot: { src: "model", model: "opportunity-rank", select: "topN" }, fmt: "count" },
                " xã nặng nhất cộng lại chiếm",
              ],
            },
            value: { src: "model", model: "opportunity-rank", select: "top10ShareOfGap" },
            fmt: "percent1",
            unit: "khoảng trống",
          },
          {
            kind: "stat",
            label: { parts: ["xã có quá nửa dân ở ngoài bán kính"] },
            value: { src: "model", model: "opportunity-rank", select: "nMajorityBeyond" },
            fmt: "count",
            unit: "xã",
          },
          {
            kind: "stat",
            label: { parts: ["xã có TOÀN BỘ dân ở ngoài bán kính"] },
            value: { src: "model", model: "opportunity-rank", select: "nAtHundredPercent" },
            fmt: "count",
            unit: "xã",
          },
          {
            kind: "para",
            text: {
              parts: [
                "Số theo xã ở đây là ",
                { em: "ô lưới gộp về xã của chúng" },
                ", không phải dân số công bố của lớp xã. Hai đơn vị đọc có thể lệch nhau đáng kể ở cùng một xã — nên một xã có thể xuất hiện ở cảnh “cung lệch” với một con số và ở đây với một con số khác, và cả hai đều đúng trong đơn vị của mình.",
              ],
            },
          },
          {
            kind: "para",
            text: {
              parts: [
                "Một thứ tự hạng là thứ tự ",
                { em: "trong phần dân đo được" },
                ": xã không có dân đo được thì không có hạng, và một ô trống không phải đáy bảng.",
              ],
            },
          },
          {
            kind: "so-what",
            text: {
              parts: [
                { slot: { src: "model", model: "access-curve", select: "shareBeyond" }, fmt: "percent1" },
                " dân bắt đầu chuyến đi ngoài bán kính phục vụ. Bán kính là của ta; thứ dữ liệu nói là khoảng trống ấy ",
                { em: "không có chủ" },
                " — xã nặng nhất giữ ",
                { slot: { src: "model", model: "opportunity-rank", select: "topShareOfGap" }, fmt: "percent1" },
                ", ",
                { slot: { src: "model", model: "opportunity-rank", select: "topN" }, fmt: "count" },
                " xã nặng nhất cộng lại giữ ",
                { slot: { src: "model", model: "opportunity-rank", select: "top10ShareOfGap" }, fmt: "percent1" },
                " của nó. Đây là một bài toán phân bố, và công cụ cho nó là một tấm bản đồ chứ không phải một danh sách rút gọn.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    id: "nhip-tuan",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM E",
    title: "Nhịp của một tuần",
    lens: "utilization",
    claim: {
      parts: [
        "Giờ bận nhất của tuần chạy gấp ",
        { slot: { src: "model", model: "utilization-week", select: "ratio" }, fmt: "multiple" },
        " giờ vắng nhất — ",
        { slot: { src: "model", model: "utilization-week", select: "peak" }, fmt: "percent1" },
        " số cổng đã lắp đang bận, so với ",
        { slot: { src: "model", model: "utilization-week", select: "trough" }, fmt: "percent1" },
        ". Và mọi câu trong cảnh này mô tả mạng lưới của ",
        { em: "một nhà vận hành" },
        ".",
      ],
    },
    camera: { kind: "fit-province" },
    layers: ["stations", "station_status"],
    subjects: [{ kind: "province" }],
    select: { kind: "none" },
    chart: { kind: "primary", id: "utilization-day-profiles" },
    requires: {
      gridColumns: ["util_cell"],
      files: ["station_occupancy_profile_168h.parquet"],
      usableLayers: ["occupancy"],
    },
    beats: [
      {
        id: "dinh-tuan",
        label: "giờ bận nhất của tuần",
        field: "station:occ",
        marks: [],
        // CẢNH sở hữu `t` ở đây (§2.6): bản đồ đứng ở khung đỉnh trong khi heatmap cho xem
        // cả tuần. Scrubber ẩn — cảnh, không phải người xem, cầm trục thời gian.
        t: { kind: "model-argmax", model: "utilization-week" },
        blocks: [
          {
            kind: "figure",
            value: { src: "model", model: "utilization-week", select: "ratio" },
            fmt: "multiple",
            unit: "giữa đỉnh và đáy",
            caption: {
              parts: [
                "Đỉnh ",
                { slot: { src: "model", model: "utilization-week", select: "peak" }, fmt: "percent1" },
                " số cổng bận; đáy ",
                { slot: { src: "model", model: "utilization-week", select: "trough" }, fmt: "percent1" },
                ". Trung bình cả tuần ",
                { slot: { src: "model", model: "utilization-week", select: "weekMean" }, fmt: "percent1" },
                ".",
              ],
            },
          },
          { kind: "figure-slot", id: "utilization-week" },
          {
            kind: "para",
            text: {
              parts: [
                "Trục giờ vẽ ",
                { em: "chỉ số giờ trong tuần" },
                ", không vẽ nhãn đồng hồ. Lý do là một chỗ trống có thật: không nơi nào trong kho khai múi giờ của trục này. Dưới cách đọc giờ địa phương đường cong hợp lý; dưới UTC thì đỉnh rơi vào sáng sớm. Hai câu chuyện khác hẳn nhau, nên ta nói HÌNH DẠNG và im về giờ cho tới khi múi giờ được phát ra.",
              ],
            },
          },
          {
            kind: "stat",
            label: { parts: ["trung vị mức sử dụng của một trạm (hạng đo GOOD)"] },
            value: { src: "manifest", path: "quality.util_median" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["trạm trong phạm vi có hồ sơ giờ dùng được"] },
            value: { src: "model", model: "utilization-week", select: "shareStationsWithProfile" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["trạm qua được cổng chất lượng (định nghĩa KHÁC ở trên)"] },
            value: { src: "manifest", path: "quality.share_stations_measured" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["ô giờ dưới sàn quan sát — vẽ “chưa quan sát”, không vẽ bằng không"] },
            value: { src: "model", model: "utilization-week", select: "nBelowFloor" },
            fmt: "count",
          },
          {
            kind: "assumption",
            id: "observed-h-min",
            note: {
              parts: [
                "Dưới ngưỡng này thì ô giờ là ",
                { em: "chưa quan sát" },
                ", không phải vắng khách. Đổ hai thứ đó vào một ký hiệu là biến một lỗ hổng đo đạc thành một phát hiện.",
              ],
            },
          },
          {
            kind: "stat",
            label: { parts: ["mức sử dụng thật đo được ở"] },
            value: { src: "manifest", path: "coverage.util_cell.cell_share" },
            fmt: "percent1",
            unit: "số ô",
          },
          {
            kind: "stat",
            label: { parts: ["…nhưng trong số ô ĐÃ CÓ trạm thì đo được"] },
            value: { src: "manifest", path: "coverage.util_cell.share_measured_among_cells_with_station" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["trạm của nhà vận hành lớn nhất"] },
            value: { src: "model", model: "power-tier", select: "topOperatorShare" },
            fmt: "percent1",
            unit: "số trạm trong phạm vi",
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Sạc không phải một phụ tải phẳng. Đó là hình dạng mà một mô hình đặt trạm phải phục vụ. Suy đoán vận hành — bộ dữ liệu này không đo hàng chờ hay lượt sạc bị từ chối: công suất kê theo giờ vắng có thể thiếu lúc đỉnh, kê theo đỉnh có thể nằm không gần cả tuần; dữ liệu ở đây chỉ đo hình dạng đường cong, không đo hai hệ quả ấy. Các cảnh báo nằm đè lên trên. Trước hết, chữ “đo được” ở đây mang hai nghĩa khác nhau và ta in cả hai chứ không chọn cái đẹp hơn. Quan trọng hơn: gần như toàn bộ trạm trong phạm vi thuộc về một công ty, nên mọi thứ ở trên mô tả mạng lưới của một hãng, không mô tả một thị trường.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    id: "mot-quyet-dinh",
    scaleMode: "binned",
    kicker: "LUẬN ĐIỂM F",
    title: "Con số lớn nhất là một quyết định",
    lens: "supply",
    claim: {
      parts: [
        "Con số lớn nhất định hình bộ dữ liệu này không phải một số đo — nó là một luật ta viết: ",
        { slot: { src: "manifest", path: "totals.private_ac_dropped.n" }, fmt: "count" },
        " trạm (",
        { slot: { src: "manifest", path: "totals.private_ac_dropped.share_stations" }, fmt: "percent1" },
        " số dòng thô) bị loại vì chúng có đúng một súng và súng đó là AC.",
      ],
    },
    camera: { kind: "fit-province" },
    layers: ["stations"],
    subjects: [{ kind: "province" }],
    select: { kind: "none" },
    chart: { kind: "primary", id: "supply-power-tier-breakdown" },
    requires: { manifestKeys: ["totals.private_ac_dropped"] },
    beats: [
      {
        id: "luat-loai",
        label: "cổng đã lắp trong ô",
        field: "n_ports",
        marks: [],
        blocks: [
          {
            kind: "figure",
            value: { src: "manifest", path: "totals.private_ac_dropped.n" },
            fmt: "count",
            unit: "trạm bị loại",
            caption: {
              parts: [
                "bằng ",
                { slot: { src: "manifest", path: "totals.private_ac_dropped.share_stations" }, fmt: "percent1" },
                " số dòng trạm thô — nhưng chỉ ",
                { slot: { src: "manifest", path: "totals.private_ac_dropped.share_ports" }, fmt: "percent1" },
                " số súng và ",
                { slot: { src: "manifest", path: "totals.private_ac_dropped.share_power" }, fmt: "percent1" },
                " công suất. Hình dạng này khớp với — nhưng không chứng minh — cách đọc rằng phần bị loại phần lớn là ổ cắm treo tường.",
              ],
            },
          },
          {
            kind: "para",
            text: {
              parts: [
                "Luật viết ra là: ",
                { em: "một súng duy nhất VÀ súng đó là AC" },
                " ⇒ luật coi đó là ổ cắm cá nhân, không phải hạ tầng công cộng — một cách phân loại ta chọn, không phải một thuộc tính đã kiểm chứng — nên nó ra khỏi bộ dữ liệu. Luật cắt trên ",
                { em: "cặp" },
                " (một súng ",
                { em: "và" },
                " AC), không cắt trên số súng: trạm một súng mà không phải AC thì được giữ. Một ngoại lệ là một phần của luật, và giấu nó đi làm luật trông rộng hơn thực tế.",
              ],
            },
          },
          {
            kind: "para",
            text: {
              parts: [
                "Bản đồ này ",
                { em: "không" },
                " có những chấm đó, và đó là ký hiệu trung thực duy nhất cho một phép loại trừ: chúng không nằm trong dữ liệu, nên vẽ một ước lượng về chỗ chúng từng ở là chế tạo đúng cái thứ mà cảnh này đang nói về.",
              ],
            },
          },
          { kind: "figure-slot", id: "power-tier" },
          {
            kind: "stat",
            label: { parts: ["trạm còn lại ở bậc công suất thấp nhất"] },
            value: { src: "model", model: "power-tier", select: "lowTierStations" },
            fmt: "count",
            unit: "trạm",
          },
          {
            kind: "stat",
            label: { parts: ["…tức phần số trạm trong phạm vi"] },
            value: { src: "model", model: "power-tier", select: "lowTierShare" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["…mang phần số cổng"] },
            value: { src: "model", model: "power-tier", select: "lowTierPortShare" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["…mang phần công suất"] },
            value: { src: "model", model: "power-tier", select: "lowTierKwShare" },
            fmt: "percent1",
          },
          // Dải giữa 34 tỉnh và phản thực của luật đều là KHE. Gói tỉnh không mang
          // `provinces.parquet`, và phản thực chưa được phát vào manifest (§10 U2) — nên cả
          // hai câu dưới đây tự biến mất thay vì đoán, và tự hiện ra khi dữ liệu về.
          {
            kind: "stat",
            label: { parts: ["tỉ lệ này ở tỉnh thấp nhất cả nước"] },
            value: { src: "model", model: "province-range", select: "acStationsMin" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["…và ở tỉnh cao nhất"] },
            value: { src: "model", model: "province-range", select: "acStationsMax" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["luật đẩy trung vị khoảng cách theo mạng đường từ"] },
            value: { src: "manifest", path: "counterfactual.ac_filter.dist_median_before_m" },
            fmt: "meters",
          },
          {
            kind: "stat",
            label: { parts: ["…lên"] },
            value: { src: "manifest", path: "counterfactual.ac_filter.dist_median_after_m" },
            fmt: "meters",
          },
          {
            kind: "stat",
            label: { parts: ["…và đẩy ra ngoài bán kính thêm"] },
            value: { src: "manifest", path: "counterfactual.ac_filter.pop_moved_beyond_2km" },
            fmt: "count",
            unit: "người",
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Mọi con số trong tập bản đồ này tựa lên một dòng mã. Ta cho xem nó vì nó là thứ hệ trọng nhất ở đây mà người đọc ",
                { em: "không thể nhìn thấy" },
                ": nó không nằm trong cột nào, không nằm trên bản đồ nào. Nếu bạn không đồng ý với luật này thì bạn không đồng ý với mọi con số ở các cảnh trước, và đó chính là chỗ đúng để không đồng ý.",
              ],
            },
          },
        ],
      },
    ],
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    id: "chua-biet",
    scaleMode: "binned",
    kicker: "CẢNH KẾT",
    title: "Những điều ta không biết",
    lens: "supply",
    claim: {
      parts: [
        "Mỗi giới hạn mang một con số: cầu là ",
        { em: "suy ra, không phải quan sát" },
        " (mức sử dụng thật chỉ có ở ",
        { slot: { src: "manifest", path: "coverage.util_cell.cell_share" }, fmt: "percent1" },
        " số ô); ta không biết chỗ nào đấu được điện; và không có ngày mai trong dữ liệu này.",
      ],
    },
    camera: { kind: "fit-province" },
    layers: ["stations"],
    subjects: [{ kind: "province" }],
    select: { kind: "none" },
    chart: { kind: "none", why: "một biểu đồ ở đây mời người đọc coi một giới hạn là một phát hiện" },
    requires: { manifestKeys: ["coverage.util_cell", "snapshots"] },
    beats: [
      {
        id: "gioi-han",
        label: "cổng trên 10k dân",
        field: "commune:ports_per_10k_pop",
        marks: [],
        blocks: [
          { kind: "heading", text: "1 · TA KHÔNG QUAN SÁT ĐƯỢC CẦU — TA CHỈ SUY RA NÓ" },
          {
            kind: "stat",
            label: { parts: ["mức sử dụng thật đo được ở"] },
            value: { src: "manifest", path: "coverage.util_cell.cell_share" },
            fmt: "percent1",
            unit: "số ô",
          },
          {
            kind: "stat",
            label: { parts: ["…tương ứng phần dân"] },
            value: { src: "manifest", path: "coverage.util_cell.pop_share" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["…nhưng trong số ô ĐÃ CÓ trạm thì đo được"] },
            value: { src: "manifest", path: "coverage.util_cell.share_measured_among_cells_with_station" },
            fmt: "percent1",
          },
          {
            kind: "para",
            text: {
              parts: [
                "Telemetry chỉ tồn tại ở nơi đã có trạm — mà chỗ ",
                { em: "chưa" },
                " có trạm mới là chỗ bài toán hỏi. Nên “cầu” trong các luận điểm đầu là dân số và điểm quan tâm: một biến thay thế, không phải lượt sạc đã xảy ra.",
              ],
            },
          },
          { kind: "heading", text: "2 · ĐIỂM QUAN TÂM LÀ LỚP PHỦ, KHÔNG PHẢI LỚP CẦU" },
          {
            kind: "stat",
            label: { parts: ["ô không có một điểm quan tâm nào trong bán kính một km"] },
            value: { src: "model", model: "poi-coverage", select: "shareCells" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["…và phần dân sống ở những ô đó"] },
            value: { src: "model", model: "poi-coverage", select: "sharePop" },
            fmt: "percent1",
          },
          {
            kind: "stat",
            label: { parts: ["thiên lệch mật độ POI giữa phường và xã"] },
            value: { src: "manifest", path: "quality.poi_bias_phuong_vs_xa" },
            fmt: "multiple",
          },
          {
            kind: "para",
            text: {
              parts: [
                "Một ô trống ở đây phần lớn KHÔNG có nghĩa “không có hoạt động” mà có nghĩa “OpenStreetMap chưa vẽ tới”. Hệ quả bắt buộc, không phải một lời phàn nàn về chất lượng: ",
                { em: "POI không được vào bất kỳ luật loại trừ nào" },
                " — một điểm không bị từ chối vì bản đồ nguồn chưa vẽ tới chỗ nó.",
              ],
            },
          },
          { kind: "heading", text: "3 · TA KHÔNG BIẾT CHỖ NÀO CẮM ĐIỆN ĐƯỢC" },
          {
            kind: "para",
            text: {
              parts: [
                "Lớp lưới điện đã ra khỏi phạm vi: không có khoảng cách tới trạm biến áp, không có công suất khả dụng, không có kVA, và không còn cột buildable. Hệ quả thẳng thắn: một điểm mà thuật toán chọn có thể hoàn hảo về cầu và không đấu được điện, và không có gì trong app này báo được điều đó. Vẽ một con số kVA ở đây sẽ là bịa số.",
              ],
            },
          },
          { kind: "heading", text: "4 · ĐÂY LÀ MỘT ẢNH CHỤP, KHÔNG PHẢI MỘT XU HƯỚNG" },
          {
            kind: "para",
            text: {
              parts: [
                "Trạm, OSM và telemetry đều là ảnh chụp một thời điểm, mỗi cái một ngày, không cái nào có xu hướng. Không có kế hoạch mở trạm của bất kỳ nhà vận hành nào ở trong đây. Một xã hôm nay không có cổng nào có thể đã nằm trong kế hoạch quý sau; bộ dữ liệu không biết, nên app cũng không biết.",
              ],
            },
          },
          {
            kind: "so-what",
            text: {
              parts: [
                "Các giới hạn này không làm các luận điểm trước sai — chúng nói các luận điểm ấy đủ cho ",
                { em: "việc gì" },
                ". Đủ để chọn dạng mô hình và thước đo khoảng cách. Chưa đủ để nói một điểm cụ thể là điểm nên xây.",
              ],
            },
          },
        ],
      },
    ],
  },
];

export const SCENE_BY_ID = new Map<SceneId, SceneSpec>(SCENES.map((s) => [s.id, s]));

/** Khung nhìn mở app — điểm neo của `fit-province` khi manifest chưa có bbox. */
export const CITY_VIEW = {
  lng: INITIAL_VIEW.center[0],
  lat: INITIAL_VIEW.center[1],
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing,
};



// ── Điều kiện dựng: cảnh nào MỞ ĐƯỢC trên gói đang mở ───────────────────────

/**
 * Bối cảnh phân giải của câu chuyện — thứ mà `sceneState()` cần mà store không có.
 *
 * Cùng khuôn với `setAvailableColumns` / `setStoryEnabled`: một biến module, ghi một lần
 * lúc gói về, đọc ở nơi đọc. Lý do vẫn là lý do cũ — `store.ts` gọi `readHash()` lúc NẠP
 * MODULE, trước cả lần render đầu tiên, nên nó không thể nhận bối cảnh qua props.
 */
let BASE: { pkg: StoryPackage; models: StoryModels } | null = null;
let CTX_CACHE = new Map<SceneId, ResolveContext>();
let RENDERABLE: readonly SceneId[] = SCENE_IDS;
let STORY_ON = true;

export function setStoryEnabled(on: boolean): void {
  STORY_ON = on;
}

/** Chế độ CÂU CHUYỆN có dựng được trên bộ dữ liệu đang mở không. Đọc, không suy. */
export function storyEnabled(): boolean {
  return STORY_ON && RENDERABLE.length > 0;
}

/** Cảnh nào dựng được — đọc, không suy. Thứ tự giữ nguyên thứ tự lập luận. */
export function renderableScenes(): readonly SceneSpec[] {
  return SCENES.filter((s) => RENDERABLE.includes(s.id));
}

function hasPath(root: unknown, path: string): boolean {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur !== null && cur !== undefined;
}

/**
 * Cảnh này dựng được trên manifest đang mở không — §1.8.
 *
 * Vắng khoá khai báo = KHÔNG BIẾT = **không chặn**. Bộ Hà Nội gốc không phát
 * `available_columns`, và coi "không khai" là "không có" sẽ tắt cả bảy cảnh ở chính bộ dữ
 * liệu mà chúng được viết cho. Chỉ chặn ở nơi ta THẬT SỰ biết là thiếu.
 */
export function sceneRenderable(s: SceneSpec, m: Manifest | null): boolean {
  if (!m) return true;
  const has = (declared: string[] | undefined, needed: readonly string[] | undefined) =>
    !needed || !declared || needed.every((c) => declared.includes(c));
  if (!has(m.available_columns, s.requires.gridColumns)) return false;
  if (!has(m.available_commune_columns, s.requires.communeColumns)) return false;
  if (!has(m.available_road_columns, s.requires.roadColumns)) return false;
  for (const key of s.requires.manifestKeys ?? []) if (!hasPath(m, key)) return false;
  for (const f of s.requires.files ?? []) {
    if (m.files && !Object.keys(m.files).some((k) => k.includes(f))) return false;
  }
  for (const layer of s.requires.usableLayers ?? []) {
    if (m.unusable_layers?.some((u) => u.layer === layer)) return false;
  }
  if (s.requires.editorialProvince && m.province) {
    if (m.province.province_code !== s.requires.editorialProvince) return false;
  }
  return true;
}

/**
 * Ghi gói + mô hình, và tính lại tập cảnh dựng được. Gọi mỗi khi gói đổi.
 *
 * Đối tượng phân giải THEO TỪNG CẢNH chứ không một lần cho cả câu chuyện: chỉ số `which`
 * trong một `SceneSpec` là chỉ số **trong cảnh đó**. Gộp chung một mảng thì thêm một cảnh
 * vào giữa sẽ lặng lẽ dịch mọi thẻ của các cảnh sau nó sang một xã khác — đúng loại lỗi
 * không trông như lỗi.
 */
export function setStoryContext(pkg: StoryPackage, models: StoryModels): void {
  BASE = { pkg, models };
  CTX_CACHE = new Map();
  RENDERABLE = SCENES.filter((s) => sceneRenderable(s, pkg.manifest)).map((s) => s.id);
}


/** Bối cảnh phân giải CỦA MỘT CẢNH — đối tượng của chính nó, mô hình dùng chung. */
export function storyContext(id: SceneId): ResolveContext | null {
  if (!BASE) return null;
  const hit = CTX_CACHE.get(id);
  if (hit) return hit;
  const spec = SCENE_BY_ID.get(id);
  if (!spec) return null;
  const ctx: ResolveContext = {
    pkg: BASE.pkg,
    models: BASE.models,
    subjects: spec.subjects.map((sp) => resolveSubject(sp, BASE!.pkg, BASE!.models)),
  };
  CTX_CACHE.set(id, ctx);
  return ctx;
}

// ── Hash: `s=<cảnh>` hoặc `s=<cảnh>.<nhịp>` ─────────────────────────────────

/**
 * `s` của hash → cảnh, hoặc `null`. Slug lạ bị bỏ, và bỏ nó CHÍNH LÀ về BẢN ĐỒ (§9a).
 *
 * Hậu tố nhịp tách ở đây chứ không ở chỗ gọi: một link tới `#s=di-vong.hau-qua` phải mở
 * đúng nhịp 2, còn `#s=di-vong.khong-co` phải rơi về nhịp 1 — cùng luật "khoá hỏng thì về
 * mặc định của khoá đó", không phải một nhánh lỗi mới.
 */
export function parseScene(raw: string | null | undefined): SceneId | null {
  return parseSceneRef(raw).scene;
}

export function parseSceneRef(raw: string | null | undefined): {
  scene: SceneId | null;
  beat: string | null;
} {
  if (!STORY_ON || !raw || typeof raw !== "string") return { scene: null, beat: null };
  const dot = raw.indexOf(".");
  const slug = dot === -1 ? raw : raw.slice(0, dot);
  const beatRaw = dot === -1 ? null : raw.slice(dot + 1);
  if (!(RENDERABLE as readonly string[]).includes(slug)) return { scene: null, beat: null };
  const scene = slug as SceneId;
  const spec = SCENE_BY_ID.get(scene)!;
  // Nhịp ĐẦU không bao giờ vào hash: nó là mặc định, và ghi mặc định vào URL làm link dài
  // ra mà không mang thêm thông tin nào (§9a).
  const beat =
    beatRaw && spec.beats.some((b) => b.id === beatRaw) && beatRaw !== spec.beats[0]!.id
      ? beatRaw
      : null;
  return { scene, beat };
}

/** Cảnh + nhịp → giá trị khoá `s`. Nhịp đầu không phát hậu tố. */
export function serializeSceneRef(scene: SceneId, beat: string | null): string {
  const spec = SCENE_BY_ID.get(scene);
  if (!spec || !beat || beat === spec.beats[0]!.id) return scene;
  return spec.beats.some((b) => b.id === beat) ? `${scene}.${beat}` : scene;
}

/**
 * Nhịp đang hoạt động. `beatId` không khớp thì rơi về nhịp ĐẦU — cùng luật §9, và nhịp đầu
 * luôn tồn tại vì mọi cảnh có ≥ 1 nhịp.
 */
export function beatOf(id: SceneId, beatId?: string | null): BeatSpec {
  const s = SCENE_BY_ID.get(id)!;
  return s.beats.find((b) => b.id === beatId) ?? s.beats[0]!;
}

// ── Khung nhìn ──────────────────────────────────────────────────────────────

/**
 * `CameraSpec` → `View`. Mức phóng đến từ hình học, **không từ một literal**.
 *
 * `fit-marks` cần chính mảng mark sẽ được vẽ, nên nó chỉ phân giải được khi mạng đường đã
 * nạp. Chưa nạp thì rơi về khung tỉnh — không phải một mức phóng đoán: khung tỉnh là câu
 * trả lời đúng cho "chưa biết mark nằm ở đâu".
 */
export function resolveCamera(cam: CameraSpec, ctx: ResolveContext | null): View {
  const m = ctx?.pkg.manifest;
  const provinceView: View = m?.province?.bbox
    ? {
        lng: (m.province.bbox[0] + m.province.bbox[2]) / 2,
        lat: (m.province.bbox[1] + m.province.bbox[3]) / 2,
        zoom: zoomForBbox(m.province.bbox as [number, number, number, number]),
        pitch: 0,
        bearing: 0,
      }
    : { ...CITY_VIEW };

  if (cam.kind === "fit-province") return provinceView;

  if (cam.kind === "fit-subject") {
    const s = ctx?.subjects[cam.which];
    if (!s?.bbox || !s.center) return provinceView;
    return {
      lng: s.center[0],
      lat: s.center[1],
      zoom: zoomForFeatureBounds(s.bbox) - SCENE_CONTEXT_ZOOM_OUT,
      pitch: 0,
      bearing: 0,
    };
  }

  // fit-marks — hộp bao của chính những đoạn cầu sẽ được kẻ đậm.
  const roads = ctx?.pkg.roads;
  if (!roads || roads.length === 0) return provinceView;
  const marks = majorBridges(roads as RoadSeg[]);
  if (marks.length === 0) return provinceView;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const seg of marks) {
    for (let i = 0; i < seg.path.length; i += 2) {
      const x = seg.path[i]!;
      const y = seg.path[i + 1]!;
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  }
  if (!Number.isFinite(w)) return provinceView;
  // Mark đã tự mang lề của chúng, nên KHÔNG lùi thêm `SCENE_CONTEXT_ZOOM_OUT` ở đây.
  return {
    lng: (w + e) / 2,
    lat: (s + n) / 2,
    zoom: zoomForFeatureBounds([w, s, e, n]),
    pitch: 0,
    bearing: 0,
  };
}

// ── State mà một cảnh ghi đè ────────────────────────────────────────────────

/**
 * State mà một cảnh ghi đè — luật L1, và là thứ test gọi thẳng.
 *
 * Trả về object mới mỗi lần: `SceneState` đi vào store, và trả về chính object hằng của
 * `SCENES` thì một lần `set` bất cẩn sẽ sửa vào định nghĩa cảnh.
 *
 * Trường lấy từ nhịp đang mở (mặc định là nhịp ĐẦU): tới bằng link giữa chừng vẫn phải
 * thấy đúng mặt tô mà câu chữ ở đó đang mô tả.
 */
export function sceneState(id: SceneId, beatId?: string | null): SceneState {
  const s = SCENE_BY_ID.get(id)!;
  const beat = beatOf(id, beatId);
  const ctx = storyContext(id);
  const view = resolveCamera(beat.camera ?? s.camera, ctx);

  let select: string | null = null;
  if (s.select.kind === "subject") {
    const subject = ctx?.subjects[s.select.which];
    select = subject?.code ? `commune:${subject.code}` : null;
  }

  let t: number | null = null;
  if (beat.t) {
    const model = ctx?.models[beat.t.model] as Record<string, unknown> | null | undefined;
    const argmax = model?.["peakT"];
    t = typeof argmax === "number" && Number.isFinite(argmax) ? argmax : null;
  }

  // Không `scaleMode` ở đây — xem `SceneState`. Ghim của cảnh đọc từ `SceneSpec.scaleMode`.
  return { field: beat.field, view, layers: [...s.layers], select, t };
}

/**
 * Câu khai CÁCH ĐỌC của một cảnh — CG-1(B), badge cảnh trên bản đồ.
 *
 * Cảnh ghim thang bậc, và cho tới bản này màn hình KHÔNG nói ra điều đó ở đâu cả: cột đọc
 * bị `StoryColumn` thay nên không có legend, không có toggle, không có câu nào. Người xem
 * vừa bấm Gradient rồi bước vào câu chuyện chỉ thấy lớp bậc quay lại mà không biết vì sao —
 * và im lặng ở đúng chỗ ấy là thứ đã sinh ra RF-1.
 *
 * Đây là một câu KHAI, không phải một bộ điều khiển. Một toggle bị vô hiệu hoá đứng cạnh
 * một cảnh đang áp đặt cách đọc là hai thứ tranh nhau cùng một state ngay trên màn hình —
 * đúng lý do §14c đã bỏ rail trường khỏi cột cảnh.
 *
 * **Ba nguyên nhân, ba câu khác nhau.** Bản đồ vẽ lớp bậc có thể vì cảnh ghim, vì trường
 * không dựng được dải liên tục, hoặc vì bảng màu chưa qua cổng gradient. Chỉ trường hợp
 * ĐẦU mới là quyết định của cảnh; hai trường hợp sau là câu trả lời của registry, và ghi
 * công chúng cho cảnh là để một câu chữ mang hai nghĩa (luật R3). Hai câu sau vì thế đọc
 * thẳng lý do của `scaleControlFor` — cùng chuỗi mà cột đọc in ở workspace, một nguồn.
 */
export function scenePinDisclosure(spec: SceneSpec, control: ScaleControlModel): string {
  if (control.gradientDisabled) {
    return control.reason ? `lớp bậc · ${control.reason}` : "lớp bậc";
  }
  // Trường DỰNG ĐƯỢC dải liên tục mà bản đồ vẫn vẽ bậc ⇒ ghim của cảnh là thứ đang chặn.
  return spec.scaleMode === "binned"
    ? "lớp bậc · cảnh ghim cách đọc để khớp số đã thẩm định"
    : "dải liên tục · cảnh khai và đã thẩm định lại số của mình";
}

// ── Bộ lọc ô của nhịp ───────────────────────────────────────────────────────

/**
 * Bộ lọc ô của nhịp đang mở — nguồn DUY NHẤT của khoá `filtered` trong render plan.
 *
 * `MapView` và `Legend` đều cần biết "tập ô có đang bị thu hẹp không". Để mỗi bên tự suy là
 * mở cửa cho chúng suy khác nhau, và chúng ĐÃ suy khác nhau một lần rồi.
 *
 * Ngưỡng phân vị phân giải trên chính các giá trị **phân tích được** của trường — không
 * trên tất cả ô: ô `null` không có chỗ trong một phân vị, và nhét chúng vào sẽ kéo lát cắt
 * xuống theo đúng số ô ta không đo được.
 */
export function activeCellFilter(
  scene: SceneId | null,
  beatId: string | null,
  values?: readonly (number | null)[],
): CellFilter | undefined {
  if (!beatHasFilter(scene, beatId)) return undefined;
  const spec = beatOf(scene!, beatId).filter!;

  let cut: number | null = null;
  if (spec.value.kind === "assumption") {
    const a = ASSUMPTIONS[spec.value.id];
    cut = Array.isArray(a.value) ? null : (a.value as number);
  } else if (values) {
    const usable = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (usable.length > 0) {
      const sorted = [...usable].sort((a, b) => a - b);
      const pos = spec.value.q * (sorted.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      cut = lo === hi ? sorted[lo]! : sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
    }
  }
  // Ngưỡng chưa phân giải được ⇒ KHÔNG lọc. Lọc bằng một ngưỡng đoán là vẽ một tập ô mà
  // không câu nào trên màn hình mô tả đúng.
  if (cut === null) return undefined;

  const threshold = cut;
  return {
    threshold,
    keep: (v) =>
      typeof v === "number" && (spec.op === "gt" ? v > threshold : v >= threshold),
  };
}

/**
 * Nhịp này CÓ thu hẹp tập ô không — câu hỏi BOOLEAN, tách khỏi việc phân giải ngưỡng.
 *
 * Chú giải và bản đồ đều phải trả lời câu này, mà chỉ bản đồ có sẵn dãy giá trị để phân
 * giải một ngưỡng phân vị. Nếu chú giải phải suy từ `activeCellFilter(...) !== undefined`
 * thì nó sẽ nói "chưa lọc" trong đúng khoảng thời gian bản đồ đang lọc — hai bên suy khác
 * nhau, đúng cái đã xảy ra một lần rồi.
 */
export function beatHasFilter(scene: SceneId | null, beatId: string | null): boolean {
  return scene !== null && beatOf(scene, beatId).filter !== undefined;
}

/** Bộ lọc ô của một nhịp — `threshold` in ra được, vì §13b-2 đòi tập đã thu hẹp phải đếm được. */
export interface CellFilter {
  threshold: number;
  keep: (value: CellValue) => boolean;
}
