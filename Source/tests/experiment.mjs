/**
 * experiment.mjs — Thực nghiệm so sánh hai thuật toán cho mục 4.3 (người C, dùng compare.js của B).
 * Chạy: npm run experiment   (kết quả in ra màn hình và ghi tests/experiment-result.xlsx)
 * Dữ liệu: bộ nhỏ, bộ lớn và dữ liệu sinh có seed ở nhiều kích thước; cùng seed → cùng số liệu.
 * Thời gian phụ thuộc máy, nên ghi rõ cấu hình máy khi đưa vào báo cáo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseRegistrationsExcel } from '../src/core/dataLoader.js';
import { buildGraph, graphStats } from '../src/core/graphBuilder.js';
import { compareAlgorithms } from '../src/core/compare.js';
import { generateRegistrations } from './helpers/randomData.js';

const fixture = (n) => parseRegistrationsExcel(new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url))));
const datasets = [
  ['Bộ nhỏ (small.xlsx)', fixture('small.xlsx')],
  ['Bộ lớn (large.xlsx)', fixture('large.xlsx')],
  ...[[100, 20, [2, 4]], [500, 50, [3, 5]], [2000, 100, [3, 6]], [5000, 200, [4, 6]], [10000, 300, [4, 7]]].map(
    ([students, courses, k], i) => [`Seed ${i + 1}: ${students} SV, ${courses} môn`, generateRegistrations(i + 1, { students, courses, coursesPerStudent: k })],
  ),
];

const rows = [['Bộ dữ liệu', 'Đỉnh', 'Cạnh', 'Δ', 'Cận dưới', 'Cận trên', 'k_WP', 'k_DS', 't_WP (ms)', 't_DS (ms)', 'Hợp lệ']];
for (const [name, regs] of datasets) {
  const g = buildGraph(regs);
  const s = graphStats(g);
  const cmp = compareAlgorithms(g, { repeat: 20 });
  const [wp, ds] = cmp.results;
  rows.push([name, s.vertices, s.edges, s.maxDegree, cmp.lowerBound, cmp.upperBound, wp.colorCount, ds.colorCount,
    Number(wp.timeMs.toFixed(3)), Number(ds.timeMs.toFixed(3)), wp.valid && ds.valid ? 'Có' : 'KHÔNG']);
}
console.table(rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h, r[i]]))));
const out = new URL('./experiment-result.xlsx', import.meta.url);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'ThucNghiem');
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }));
console.log('Đã ghi', out.pathname);
