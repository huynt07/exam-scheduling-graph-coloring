/**
 * dsatur.js — Thuật toán tô màu DSATUR (Brélaz, 1979) (người C).
 *
 * Mỗi lượt chọn đỉnh chưa tô có độ bão hòa cao nhất (số màu khác nhau ở các đỉnh kề đã tô);
 * hòa thì chọn đỉnh bậc lớn hơn, vẫn hòa thì chọn mã môn nhỏ hơn; rồi gán màu nhỏ nhất hợp lệ.
 *
 * File trong core/: không dùng document, window.
 */
import { compareIds } from './graphBuilder.js';

/** @typedef {Map<string, Set<string>>} Graph */
/** @typedef {{course: string, color: number, saturation: number}} DsaturStep */

/**
 * Màu nhỏ nhất (số nguyên không âm) không thuộc tập usedColors.
 * @param {Set<number>} usedColors
 * @returns {number}
 */
export function smallestFreeColor(usedColors) {
  let c = 0;
  while (usedColors.has(c)) c++;
  return c;
}

/**
 * Tô màu đồ thị bằng DSATUR (bản quét tuyến tính, dễ đọc).
 *
 * Độ phức tạp: V lượt, mỗi lượt quét các đỉnh chưa tô để tìm độ bão hòa lớn nhất O(V),
 * cập nhật đỉnh kề O(deg); tổng O(V² + E) = O(V²). Bộ nhớ O(V + E).
 *
 * @param {Graph} graph
 * @param {DsaturStep[] | null} [steps]  Nếu truyền mảng, đẩy {course, color, saturation} mỗi lần tô
 * @returns {Map<string, number>} mã môn → màu (đánh số từ 0)
 */
export function dsatur(graph, steps = null) {
  /** @type {Map<string, number>} */
  const colors = new Map();
  /** adjColors[v] = tập màu đang có ở các đỉnh kề đã tô của v; sat(v) = adjColors[v].size */
  const adjColors = new Map();
  for (const v of graph.keys()) adjColors.set(v, new Set());

  // Danh sách đỉnh chưa tô, giữ thứ tự mã môn để quét ổn định.
  const uncolored = new Set([...graph.keys()].sort(compareIds));

  while (uncolored.size > 0) {
    // Chọn đỉnh: độ bão hòa lớn nhất → bậc lớn nhất → mã môn nhỏ nhất.
    let best = null;
    let bestSat = -1;
    let bestDeg = -1;
    for (const v of uncolored) {
      const sat = adjColors.get(v).size;
      const deg = graph.get(v).size;
      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && compareIds(v, best) < 0)
      ) {
        best = v;
        bestSat = sat;
        bestDeg = deg;
      }
    }

    const color = smallestFreeColor(adjColors.get(best));
    colors.set(best, color);
    uncolored.delete(best);
    if (steps) steps.push({ course: best, color, saturation: bestSat });

    // Cập nhật độ bão hòa của các đỉnh kề chưa tô.
    for (const u of graph.get(best)) {
      if (uncolored.has(u)) adjColors.get(u).add(color);
    }
  }
  return colors;
}
