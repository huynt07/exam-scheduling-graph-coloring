import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  compareIds,
  degree,
  degrees,
  maxDegree,
  countVertices,
  countEdges,
  getEdges,
  toAdjacencyMatrix,
  formatAdjacencyList,
  formatAdjacencyMatrix,
  graphStats,
} from '../src/core/graphBuilder.js';
import { loadFixture, fixtureText } from './helpers/fixtures.js';

const small = () => buildGraph(loadFixture('small.xlsx'));

describe('buildGraph trên bộ nhỏ', () => {
  const expected = JSON.parse(fixtureText('small.expected.json'));

  it('khớp danh sách kề lập bằng tay', () => {
    const graph = small();
    const actual = Object.fromEntries(
      [...graph].map(([v, ns]) => [v, [...ns].sort(compareIds)]),
    );
    expect(actual).toEqual(expected.adjacency);
  });

  it('đúng số đỉnh, số cạnh, bậc lớn nhất', () => {
    const graph = small();
    expect(countVertices(graph)).toBe(expected.vertices);
    expect(countEdges(graph)).toBe(expected.edges);
    expect(maxDegree(graph)).toBe(expected.maxDegree);
    expect(degree(graph, 'GT')).toBe(4);
    expect(degrees(graph).get('CSDL')).toBe(2);
  });

  it('đồ thị đối xứng và không có khuyên', () => {
    const graph = small();
    for (const [u, ns] of graph) {
      expect(ns.has(u)).toBe(false);
      for (const v of ns) expect(graph.get(v).has(u)).toBe(true);
    }
  });

  it('môn không trùng sinh viên với môn nào vẫn là đỉnh cô lập', () => {
    const graph = small();
    expect(graph.has('TA')).toBe(true);
    expect(graph.get('TA').size).toBe(0);
    expect(graphStats(graph).isolated).toBe(1);
  });

  it('đỉnh được sắp theo mã môn tăng dần', () => {
    expect([...small().keys()]).toEqual(Object.keys(expected.adjacency).sort(compareIds));
  });

  it('ma trận kề đối xứng, đường chéo bằng 0, tổng = 2|E|', () => {
    const { vertices, matrix } = toAdjacencyMatrix(small());
    expect(vertices).toHaveLength(8);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      expect(matrix[i][i]).toBe(0);
      for (let j = 0; j < 8; j++) {
        expect(matrix[i][j]).toBe(matrix[j][i]);
        sum += matrix[i][j];
      }
    }
    expect(sum).toBe(22);
  });

  it('getEdges liệt kê mỗi cạnh một lần', () => {
    const edges = getEdges(small());
    expect(edges).toHaveLength(11);
    expect(edges[0]).toEqual(['CSDL', 'MMT']);
  });

  it('in được danh sách kề và ma trận kề', () => {
    const graph = small();
    expect(formatAdjacencyList(graph)).toContain('GT: CTDL, LTDT, TRR, XSTK');
    expect(formatAdjacencyList(graph)).toContain('TA: (không kề môn nào)');
    expect(formatAdjacencyMatrix(graph).split('\n')).toHaveLength(9);
  });
});

describe('buildGraph các trường hợp biên', () => {
  it('danh sách rỗng cho đồ thị rỗng', () => {
    const g = buildGraph([]);
    expect(g.size).toBe(0);
    expect(countEdges(g)).toBe(0);
    expect(maxDegree(g)).toBe(0);
  });

  it('một sinh viên học k môn tạo đồ thị đầy đủ K_k', () => {
    const regs = ['A', 'B', 'C', 'D', 'E'].map((c) => ({ studentId: 'SV1', courseId: c }));
    const g = buildGraph(regs);
    expect(countEdges(g)).toBe(10); // 5·4/2
    for (const ns of g.values()) expect(ns.size).toBe(4);
  });

  it('đăng ký trùng (nếu lọt qua bước kiểm tra) không tạo khuyên hay cạnh thừa', () => {
    const g = buildGraph([
      { studentId: 'SV1', courseId: 'A' },
      { studentId: 'SV1', courseId: 'A' },
      { studentId: 'SV1', courseId: 'B' },
    ]);
    expect(g.get('A')).toEqual(new Set(['B']));
    expect(countEdges(g)).toBe(1);
  });

  it('nhiều sinh viên chung một cặp môn chỉ tạo một cạnh', () => {
    const regs = [];
    for (let s = 0; s < 50; s++) {
      regs.push({ studentId: `SV${s}`, courseId: 'A' }, { studentId: `SV${s}`, courseId: 'B' });
    }
    expect(countEdges(buildGraph(regs))).toBe(1);
  });

  it('degree báo lỗi khi môn không tồn tại', () => {
    expect(() => degree(small(), 'XYZ')).toThrow(/Không có môn XYZ/);
  });
});

describe('buildGraph trên bộ lớn', () => {
  it('chạy nhanh và cho đồ thị hợp lệ', () => {
    const regs = loadFixture('large.xlsx');
    const t0 = performance.now();
    const g = buildGraph(regs);
    const ms = performance.now() - t0;
    const stats = graphStats(g);
    expect(stats.vertices).toBe(190); // 8 ngành × 20 môn + 30 môn chung
    expect(stats.edges).toBeGreaterThan(0);
    for (const [u, ns] of g) for (const v of ns) expect(g.get(v).has(u)).toBe(true);
    expect(ms).toBeLessThan(1000);
  });
});
