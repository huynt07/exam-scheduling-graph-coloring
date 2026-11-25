import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/core/graphBuilder.js';
import { welshPowell, welshPowellOrder } from '../src/core/welshPowell.js';
import { dsatur, smallestFreeColor } from '../src/core/dsatur.js';
import { isValidColoring, countColors } from '../src/core/validator.js';
import { generateRegistrations } from './helpers/randomData.js';
import { loadFixture } from './helpers/fixtures.js';

const small = () => buildGraph(loadFixture('small.xlsx'));

/** Dựng đồ thị từ danh sách cạnh và danh sách đỉnh. */
function graphOf(vertices, edges) {
  const g = new Map(vertices.map((v) => [v, new Set()]));
  for (const [u, v] of edges) { g.get(u).add(v); g.get(v).add(u); }
  return g;
}
const complete = (n) => {
  const vs = Array.from({ length: n }, (_, i) => `V${i}`);
  const es = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) es.push([vs[i], vs[j]]);
  return graphOf(vs, es);
};
/**
 * Đồ thị hai phía "vương miện": a_i kề b_j với i ≠ j, mọi đỉnh cùng bậc n − 1.
 * Mã đặt là P1A, P1B, P2A, P2B, ... để khi hòa bậc, thứ tự theo mã xen kẽ hai phía.
 */
const crown = (n) => {
  const vs = [];
  for (let i = 1; i <= n; i++) vs.push(`P${i}A`, `P${i}B`);
  const es = [];
  for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) if (i !== j) es.push([`P${i}A`, `P${j}B`]);
  return graphOf(vs, es);
};

for (const [name, algo] of [['Welsh-Powell', welshPowell], ['DSATUR', dsatur]]) {
  describe(name, () => {
    it('K_n cần đúng n màu', () => {
      for (const n of [1, 2, 5, 8]) {
        const colors = algo(complete(n));
        expect(isValidColoring(complete(n), colors).valid).toBe(true);
        expect(countColors(colors)).toBe(n);
      }
    });
    it('đồ thị không cạnh cần 1 màu, đồ thị rỗng 0 màu', () => {
      expect(countColors(algo(graphOf(['A', 'B', 'C'], [])))).toBe(1);
      expect(algo(new Map()).size).toBe(0);
    });
    it('bộ nhỏ: hợp lệ, đúng 4 màu (= χ vì có K4)', () => {
      const colors = algo(small());
      expect(isValidColoring(small(), colors).valid).toBe(true);
      expect(countColors(colors)).toBe(4);
    });
    it('ghi đủ các bước tô, mỗi đỉnh một lần', () => {
      const steps = [];
      const colors = algo(small(), steps);
      expect(steps).toHaveLength(8);
      for (const s of steps) expect(colors.get(s.course)).toBe(s.color);
    });
    it('hợp lệ và không vượt Δ + 1 trên bộ lớn và dữ liệu sinh có seed', () => {
      const graphs = [
        buildGraph(loadFixture('large.xlsx')),
        buildGraph(generateRegistrations(1, { students: 500, courses: 60, coursesPerStudent: [3, 6] })),
        buildGraph(generateRegistrations(2, { students: 2000, courses: 120, coursesPerStudent: 4 })),
      ];
      for (const g of graphs) {
        const colors = algo(g);
        expect(isValidColoring(g, colors).valid).toBe(true);
        let delta = 0; for (const ns of g.values()) delta = Math.max(delta, ns.size);
        expect(countColors(colors)).toBeLessThanOrEqual(delta + 1);
      }
    });
    it('cùng đầu vào cho cùng kết quả', () => {
      expect([...algo(small())]).toEqual([...algo(small())]);
    });
  });
}

describe('so sánh hành vi hai thuật toán', () => {
  it('thứ tự Welsh-Powell: bậc giảm dần, hòa thì mã tăng dần', () => {
    expect(welshPowellOrder(small())).toEqual(['GT', 'LTDT', 'TRR', 'CTDL', 'MMT', 'CSDL', 'XSTK', 'TA']);
  });
  it('đồ thị vương miện: DSATUR đúng 2 màu, Welsh-Powell cần n màu', () => {
    const g = crown(5);
    expect(countColors(dsatur(g))).toBe(2);
    expect(countColors(welshPowell(g))).toBe(5);
    expect(isValidColoring(g, welshPowell(g)).valid).toBe(true);
  });
  it('DSATUR tối ưu (2 màu) trên đồ thị hai phía khác: chu trình chẵn, cây', () => {
    const c6 = graphOf(['A', 'B', 'C', 'D', 'E', 'F'], [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'F'], ['F', 'A']]);
    const tree = graphOf(['R', 'X', 'Y', 'Z', 'W'], [['R', 'X'], ['R', 'Y'], ['X', 'Z'], ['X', 'W']]);
    expect(countColors(dsatur(c6))).toBe(2);
    expect(countColors(dsatur(tree))).toBe(2);
  });
  it('smallestFreeColor', () => {
    expect(smallestFreeColor(new Set())).toBe(0);
    expect(smallestFreeColor(new Set([0, 1, 3]))).toBe(2);
  });
});

describe('isValidColoring', () => {
  it('bắt lỗi khi cố tình tô sai và khi thiếu màu', () => {
    const g = small();
    const colors = welshPowell(g);
    colors.set('CTDL', colors.get('GT'));
    const r = isValidColoring(g, colors);
    expect(r.valid).toBe(false);
    expect(r.conflicts).toContainEqual(['CTDL', 'GT']);
    colors.delete('TA');
    expect(isValidColoring(g, colors).uncolored).toEqual(['TA']);
  });
});
