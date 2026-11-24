/**
 * welshPowell.js — Thuật toán tô màu Welsh-Powell (người B).
 *
 * Ý tưởng: đỉnh bậc cao bị nhiều ràng buộc nhất nên xét trước. Mỗi màu được lấp đầy tối đa
 * bằng các đỉnh chưa tô và không kề đỉnh nào đã mang màu đó, rồi mới chuyển sang màu mới.
 *
 * File trong core/: không dùng document, window.
 */
import { compareIds } from './graphBuilder.js';

/** @typedef {Map<string, Set<string>>} Graph */
/** @typedef {{course: string, color: number}} ColorStep */

/**
 * Thứ tự xét đỉnh của Welsh-Powell: bậc giảm dần, bậc bằng nhau thì mã môn tăng dần.
 * Tách riêng để báo cáo và giao diện hiển thị được thứ tự này.
 * @param {Graph} graph
 * @returns {string[]}
 */
export function welshPowellOrder(graph) {
  return [...graph.keys()].sort((a, b) => {
    const byDegree = graph.get(b).size - graph.get(a).size; // bậc lớn đứng trước
    return byDegree !== 0 ? byDegree : compareIds(a, b);
  });
}

/**
 * Tô màu đồ thị bằng Welsh-Powell.
 *
 * Độ phức tạp: sắp xếp O(V log V); mỗi lượt màu quét các đỉnh và các đỉnh kề, O(V + E);
 * có k ≤ Δ + 1 lượt nên tổng O(V log V + k(V + E)). Bộ nhớ O(V + E).
 *
 * @param {Graph} graph  Đồ thị xung đột (danh sách kề)
 * @param {ColorStep[] | null} [steps]  Nếu truyền mảng, mỗi lần tô một đỉnh sẽ đẩy {course, color} vào
 * @returns {Map<string, number>} mã môn → màu (đánh số từ 0)
 */
export function welshPowell(graph, steps = null) {
  const order = welshPowellOrder(graph);
  /** @type {Map<string, number>} */
  const colors = new Map();
  let color = 0;

  while (colors.size < order.length) {
    // Tập các đỉnh đã mang màu `color` trong lượt này. Thay vì hỏi từng đỉnh kề của v
    // "có màu này không", ta kiểm tra v có kề đỉnh nào trong tập này không.
    const sameColor = [];
    for (const v of order) {
      if (colors.has(v)) continue;
      const neighbors = graph.get(v);
      let blocked = false;
      for (const u of sameColor) {
        if (neighbors.has(u)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        colors.set(v, color);
        sameColor.push(v);
        if (steps) steps.push({ course: v, color });
      }
    }
    color++;
  }
  return colors;
}
