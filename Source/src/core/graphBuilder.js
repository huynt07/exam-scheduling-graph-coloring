/**
 * graphBuilder.js — Dựng đồ thị xung đột và các hàm tiện ích trên đồ thị (người A).
 *
 * Mô hình: mỗi môn là một đỉnh; hai môn có ít nhất một sinh viên học chung thì nối một cạnh.
 * Đồ thị được biểu diễn bằng danh sách kề: Map<mãMôn, Set<mãMôn kề>>.
 *
 * File này nằm trong core/: không dùng document, window, để kiểm thử bằng Node.js.
 */

/** @typedef {import('./dataLoader.js').Registration} Registration */
/** @typedef {Map<string, Set<string>>} Graph */

/**
 * So sánh hai mã môn theo thứ tự mã ký tự (code unit), dùng cho Array.sort.
 * Cố ý không dùng localeCompare vì kết quả của nó có thể khác nhau giữa Node.js và trình duyệt;
 * cả nhóm dùng chung hàm này để mọi thuật toán phá hòa theo cùng một thứ tự.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareIds(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Dựng đồ thị xung đột từ danh sách đăng ký.
 * Bước 1: gom các môn của từng sinh viên (Map mãSV → Set môn).
 * Bước 2: với mỗi sinh viên, nối từng cặp môn của sinh viên đó.
 * Mọi môn đều có mặt trong đồ thị, kể cả môn không trùng sinh viên với môn nào (đỉnh cô lập).
 * Các đỉnh được thêm theo mã môn tăng dần nên thứ tự duyệt Map luôn xác định.
 *
 * Độ phức tạp: O(R + Σ k_s²), với R là số dòng đăng ký và k_s là số môn của sinh viên s.
 *
 * @param {Registration[]} registrations
 * @returns {Graph}
 */
export function buildGraph(registrations) {
  /** @type {Map<string, Set<string>>} */
  const coursesByStudent = new Map();
  const allCourses = new Set();

  for (const { studentId, courseId } of registrations) {
    allCourses.add(courseId);
    if (!coursesByStudent.has(studentId)) coursesByStudent.set(studentId, new Set());
    // Set tự bỏ môn trùng, nên dù một sinh viên lỡ đăng ký một môn hai lần
    // cũng không sinh ra khuyên (cạnh nối đỉnh với chính nó).
    coursesByStudent.get(studentId).add(courseId);
  }

  /** @type {Graph} */
  const graph = new Map();
  for (const course of [...allCourses].sort(compareIds)) {
    graph.set(course, new Set());
  }

  for (const courses of coursesByStudent.values()) {
    const list = [...courses];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        // Đồ thị vô hướng: thêm cả hai chiều để u kề v thì v kề u.
        graph.get(list[i]).add(list[j]);
        graph.get(list[j]).add(list[i]);
      }
    }
  }
  return graph;
}

/**
 * Danh sách đỉnh sắp theo mã môn tăng dần.
 * @param {Graph} graph
 * @returns {string[]}
 */
export function getVertices(graph) {
  return [...graph.keys()].sort(compareIds);
}

/**
 * Bậc của một đỉnh (số môn có sinh viên học chung với môn đó).
 * @param {Graph} graph
 * @param {string} vertex
 * @returns {number}
 */
export function degree(graph, vertex) {
  const neighbors = graph.get(vertex);
  if (!neighbors) throw new Error(`Không có môn ${vertex} trong đồ thị.`);
  return neighbors.size;
}

/**
 * Bậc của mọi đỉnh.
 * @param {Graph} graph
 * @returns {Map<string, number>}
 */
export function degrees(graph) {
  const result = new Map();
  for (const v of getVertices(graph)) result.set(v, graph.get(v).size);
  return result;
}

/**
 * Bậc lớn nhất Δ(G); đồ thị rỗng trả 0.
 * @param {Graph} graph
 * @returns {number}
 */
export function maxDegree(graph) {
  let max = 0;
  for (const neighbors of graph.values()) max = Math.max(max, neighbors.size);
  return max;
}

/**
 * Số đỉnh |V|.
 * @param {Graph} graph
 * @returns {number}
 */
export function countVertices(graph) {
  return graph.size;
}

/**
 * Số cạnh |E| = (tổng bậc) / 2 theo định lý bắt tay.
 * @param {Graph} graph
 * @returns {number}
 */
export function countEdges(graph) {
  let sum = 0;
  for (const neighbors of graph.values()) sum += neighbors.size;
  return sum / 2;
}

/**
 * Danh sách cạnh, mỗi cạnh ghi một lần [u, v] với u < v, sắp tăng dần.
 * @param {Graph} graph
 * @returns {[string, string][]}
 */
export function getEdges(graph) {
  const edges = [];
  for (const u of getVertices(graph)) {
    for (const v of [...graph.get(u)].sort(compareIds)) {
      if (compareIds(u, v) < 0) edges.push([u, v]);
    }
  }
  return edges;
}

/**
 * Ma trận kề: matrix[i][j] = 1 nếu vertices[i] kề vertices[j], ngược lại 0.
 * Dùng để in và minh họa trong báo cáo; chương trình xử lý trên danh sách kề.
 * @param {Graph} graph
 * @returns {{vertices: string[], matrix: number[][]}}
 */
export function toAdjacencyMatrix(graph) {
  const vertices = getVertices(graph);
  const index = new Map(vertices.map((v, i) => [v, i]));
  const matrix = vertices.map(() => new Array(vertices.length).fill(0));
  for (const [u, neighbors] of graph) {
    for (const v of neighbors) matrix[index.get(u)][index.get(v)] = 1;
  }
  return { vertices, matrix };
}

/**
 * Chuỗi in ma trận kề, mỗi dòng một đỉnh (dùng cho console và báo cáo).
 * @param {Graph} graph
 * @returns {string}
 */
export function formatAdjacencyMatrix(graph) {
  const { vertices, matrix } = toAdjacencyMatrix(graph);
  const width = Math.max(1, ...vertices.map((v) => v.length));
  const pad = (s) => String(s).padStart(width);
  const lines = [[' '.repeat(width), ...vertices.map(pad)].join(' ')];
  matrix.forEach((row, i) => lines.push([pad(vertices[i]), ...row.map(pad)].join(' ')));
  return lines.join('\n');
}

/**
 * Chuỗi in danh sách kề, ví dụ "CTDL: GT, LTDT, TRR".
 * @param {Graph} graph
 * @returns {string}
 */
export function formatAdjacencyList(graph) {
  return getVertices(graph)
    .map((v) => `${v}: ${[...graph.get(v)].sort(compareIds).join(', ') || '(không kề môn nào)'}`)
    .join('\n');
}

/**
 * Thống kê nhanh của đồ thị cho giao diện và báo cáo.
 * @param {Graph} graph
 * @returns {{vertices: number, edges: number, maxDegree: number, isolated: number, density: number}}
 */
export function graphStats(graph) {
  const n = countVertices(graph);
  const m = countEdges(graph);
  let isolated = 0;
  for (const neighbors of graph.values()) if (neighbors.size === 0) isolated++;
  return {
    vertices: n,
    edges: m,
    maxDegree: maxDegree(graph),
    isolated,
    density: n > 1 ? (2 * m) / (n * (n - 1)) : 0,
  };
}
