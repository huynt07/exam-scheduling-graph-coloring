/**
 * compare.js — So sánh Welsh-Powell và DSATUR, tính cận dưới và cận trên (người B).
 *
 * File trong core/: không dùng document, window. performance.now() có sẵn cả trong
 * trình duyệt lẫn Node.js.
 */
import { compareIds, maxDegree } from './graphBuilder.js';
import { welshPowell } from './welshPowell.js';
import { dsatur } from './dsatur.js';
import { isValidColoring, countColors } from './validator.js';

/** @typedef {Map<string, Set<string>>} Graph */

/**
 * Tìm tham lam một clique lớn, xuất phát lần lượt từ mỗi đỉnh: duyệt các đỉnh kề theo bậc
 * giảm dần, thêm đỉnh nếu nó kề mọi đỉnh đã có trong clique. Lấy clique lớn nhất tìm được.
 * Độ phức tạp O(V · Δ · ω) với ω là kích thước clique, thường nhỏ.
 * @param {Graph} graph
 * @returns {string[]} các đỉnh của clique tìm được
 */
export function greedyClique(graph) {
  const byDegree = (a, b) => graph.get(b).size - graph.get(a).size || compareIds(a, b);
  let best = [];
  for (const start of [...graph.keys()].sort(byDegree)) {
    // Clique chứa start có tối đa deg(start) + 1 đỉnh: không thể vượt best thì bỏ qua.
    if (graph.get(start).size + 1 <= best.length) continue;
    const clique = [start];
    for (const v of [...graph.get(start)].sort(byDegree)) {
      if (clique.every((u) => graph.get(v).has(u))) clique.push(v);
    }
    if (clique.length > best.length) best = clique;
  }
  return best;
}

/**
 * Cận dưới của số sắc: kích thước clique tìm tham lam (LB ≤ ω(G) ≤ χ(G)).
 * @param {Graph} graph
 * @returns {number}
 */
export function lowerBound(graph) {
  return greedyClique(graph).length;
}

/**
 * Cận trên của số sắc: Δ(G) + 1 (đồ thị rỗng trả 0).
 * @param {Graph} graph
 * @returns {number}
 */
export function upperBound(graph) {
  return graph.size === 0 ? 0 : maxDegree(graph) + 1;
}

/** Danh sách thuật toán được so sánh, theo thứ tự hiển thị. */
export const ALGORITHMS = [
  { id: 'welshPowell', name: 'Welsh-Powell', run: welshPowell },
  { id: 'dsatur', name: 'DSATUR', run: dsatur },
];

/**
 * Chạy cả hai thuật toán trên cùng đồ thị, đo thời gian trung bình qua `repeat` lần chạy.
 *
 * @param {Graph} graph
 * @param {{repeat?: number}} [options]  repeat: số lần lặp đo thời gian (mặc định 20)
 * @returns {{results: {id: string, name: string, colorCount: number, timeMs: number, valid: boolean,
 *                      gapPercent: number|null, colors: Map<string, number>}[],
 *            lowerBound: number, upperBound: number}}
 */
export function compareAlgorithms(graph, options = {}) {
  const repeat = Math.max(1, Math.floor(options.repeat ?? 20));
  const lb = lowerBound(graph);
  const ub = upperBound(graph);
  const results = ALGORITHMS.map(({ id, name, run }) => {
    let total = 0;
    let colors = new Map();
    for (let r = 0; r < repeat; r++) {
      const t0 = performance.now();
      colors = run(graph);
      total += performance.now() - t0;
    }
    const colorCount = countColors(colors);
    return {
      id,
      name,
      colorCount,
      timeMs: total / repeat,
      valid: isValidColoring(graph, colors).valid,
      gapPercent: lb > 0 ? ((colorCount - lb) / lb) * 100 : null,
      colors,
    };
  });
  return { results, lowerBound: lb, upperBound: ub };
}

/**
 * Mức cải thiện của DSATUR so với Welsh-Powell: (k_WP − k_DS) / k_WP × 100%.
 * @param {number} kWP
 * @param {number} kDS
 * @returns {number}
 */
export function improvementPercent(kWP, kDS) {
  return kWP > 0 ? ((kWP - kDS) / kWP) * 100 : 0;
}
