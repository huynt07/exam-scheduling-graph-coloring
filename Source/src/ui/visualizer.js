/**
 * visualizer.js — Vẽ đồ thị tô màu bằng Canvas 2D (người E).
 *
 * Các đỉnh xếp đều trên một vòng tròn: đỉnh thứ i trong n đỉnh nằm ở góc 2πi/n.
 * Cạnh vẽ trước (lineTo), đỉnh vẽ sau (arc, fill) theo màu = ca thi.
 * Canvas được nhân với devicePixelRatio để nét trên màn hình độ phân giải cao.
 */
import { getVertices } from '../core/graphBuilder.js';

/** Bảng 12 màu dễ phân biệt; từ màu thứ 13 sinh thêm bằng HSL với góc vàng. */
const PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948',
  '#b07aa1', '#ff9da7', '#9c755f', '#86bcb6', '#d37295', '#a0cbe8',
];
const UNCOLORED = '#e5e7eb';

/**
 * Màu hiển thị cho số màu c.
 * @param {number} c
 * @returns {string}
 */
export function colorFor(c) {
  if (c < PALETTE.length) return PALETTE[c];
  const hue = (c * 137.508) % 360; // góc vàng: các màu sinh thêm cách xa nhau
  return `hsl(${hue.toFixed(0)}, 55%, 55%)`;
}

/**
 * Chuẩn bị canvas theo kích thước hiển thị và devicePixelRatio.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ctx: CanvasRenderingContext2D, width: number, height: number}}
 */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 480;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // vẽ theo đơn vị CSS pixel
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/**
 * Vẽ đồ thị tô màu lên canvas.
 * @param {Map<string, Set<string>>} graph
 * @param {Map<string, number>} colors  có thể chỉ chứa một phần đỉnh (chế độ từng bước)
 * @param {HTMLCanvasElement} canvas
 * @param {{highlight?: string | null}} [options]  highlight: đỉnh vừa tô, vẽ viền đậm và cạnh nổi bật
 */
export function drawGraph(graph, colors, canvas, options = {}) {
  const { ctx, width, height } = setupCanvas(canvas);
  const vertices = getVertices(graph);
  const n = vertices.length;
  if (n === 0) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chưa có dữ liệu để vẽ.', width / 2, height / 2);
    return;
  }

  const showLabels = n <= 60;
  const margin = showLabels ? 48 : 16;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(20, Math.min(width, height) / 2 - margin);
  const nodeR = n === 1 ? 22 : Math.max(3, Math.min(22, (Math.PI * radius) / n * 0.7));

  /** @type {Map<string, {x: number, y: number, angle: number}>} */
  const pos = new Map();
  vertices.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // bắt đầu từ đỉnh trên cùng
    pos.set(v, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), angle });
  });

  // Cạnh: đồ thị dày thì vẽ mờ hơn để còn nhìn thấy đỉnh.
  let edgeCount = 0;
  for (const ns of graph.values()) edgeCount += ns.size;
  edgeCount /= 2;
  const alpha = edgeCount > 3000 ? 0.04 : edgeCount > 500 ? 0.12 : 0.45;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(75, 85, 99, ${alpha})`;
  ctx.beginPath();
  for (const u of vertices) {
    const a = pos.get(u);
    for (const v of graph.get(u)) {
      if (u < v) {
        const b = pos.get(v);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
  }
  ctx.stroke();

  // Cạnh của đỉnh đang được nhấn mạnh.
  const hl = options.highlight && pos.has(options.highlight) ? options.highlight : null;
  if (hl) {
    const a = pos.get(hl);
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const v of graph.get(hl)) {
      const b = pos.get(v);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  // Đỉnh.
  for (const v of vertices) {
    const { x, y } = pos.get(v);
    ctx.beginPath();
    ctx.arc(x, y, nodeR, 0, 2 * Math.PI);
    ctx.fillStyle = colors.has(v) ? colorFor(colors.get(v)) : UNCOLORED;
    ctx.fill();
    ctx.lineWidth = v === hl ? 3 : 1;
    ctx.strokeStyle = v === hl ? '#111827' : 'rgba(17, 24, 39, 0.55)';
    ctx.stroke();
  }

  // Nhãn: ghi mã môn ra phía ngoài vòng tròn.
  if (showLabels) {
    ctx.font = `${n > 30 ? 11 : 13}px system-ui, sans-serif`;
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'middle';
    for (const v of vertices) {
      const { angle } = pos.get(v);
      const r = radius + nodeR + 6;
      const cos = Math.cos(angle);
      ctx.textAlign = Math.abs(cos) < 0.2 ? 'center' : cos > 0 ? 'left' : 'right';
      ctx.fillText(v, cx + r * cos, cy + r * Math.sin(angle));
    }
  }
}

/**
 * Các mục chú thích màu: mỗi màu đang dùng kèm số môn mang màu đó.
 * @param {Map<string, number>} colors
 * @returns {{color: number, css: string, count: number}[]}
 */
export function legendItems(colors) {
  const counts = new Map();
  for (const c of colors.values()) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([color, count]) => ({ color, css: colorFor(color), count }));
}
