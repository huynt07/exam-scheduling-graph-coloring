/**
 * statsPanel.js — Dựng các bảng/thống kê hiển thị trên giao diện (người E).
 *
 * Mỗi hàm render* nhận dữ liệu từ các module core/ và trả về một chuỗi HTML (đã escape),
 * main.js chỉ việc gắn vào trang bằng jQuery. Tách như vậy để phần tính toán thống kê
 * (computeSlotStats, formatMs...) kiểm thử được bằng Node.js, không cần trình duyệt.
 * Chỉ downloadBlob dùng document/URL của trình duyệt.
 */
import { improvementPercent } from '../core/compare.js';
import { countStudentsPerCourse } from '../core/scheduler.js';
import { legendItems } from './visualizer.js';

/** @typedef {{course: string, date: string, slot: number, time?: string, rooms: string[]}} ScheduleEntry */

/**
 * Escape ký tự đặc biệt của HTML. Mã sinh viên/môn do người dùng nhập nên PHẢI escape
 * trước khi chèn vào trang, nếu không một mã như "<b>" sẽ làm vỡ bảng.
 * @param {unknown} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * Đổi YYYY-MM-DD thành "Thứ Hai, 21/12/2026". Tính thứ theo UTC để không lệch múi giờ.
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return String(iso);
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${WEEKDAYS[dow] ?? ''}, ${d}/${m}/${y}`;
}

/**
 * Định dạng thời gian chạy (ms): đủ chữ số để thấy khác biệt giữa hai thuật toán.
 * @param {number} ms
 * @returns {string}
 */
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 0.001) return '< 0.001';
  return ms < 1 ? ms.toFixed(3) : ms.toFixed(2);
}

/** Một ô thống kê dạng "số lớn + nhãn nhỏ". */
function tile(num, label) {
  return `<div class="col-6 col-md-3 col-lg"><div class="stat-tile h-100"><div class="num">${esc(num)}</div><div class="lbl">${esc(label)}</div></div></div>`;
}

/**
 * Tóm tắt dữ liệu sau khi nhập: số sinh viên, số môn, số dòng và thống kê đồ thị.
 * @param {{students: number, courses: number, rows: number}} summary  từ summarizeRegistrations
 * @param {{vertices: number, edges: number, maxDegree: number, isolated: number, density: number}} [graph]  từ graphStats
 * @returns {string}
 */
export function renderSummary(summary, graph) {
  let html = '<div class="alert alert-success py-2 mb-2">Dữ liệu hợp lệ.</div><div class="row g-2">';
  html += tile(summary.students, 'sinh viên') + tile(summary.courses, 'môn thi') + tile(summary.rows, 'dòng đăng ký');
  if (graph) {
    html += tile(graph.edges, 'cạnh (cặp môn có SV chung)') + tile(graph.maxDegree, 'bậc lớn nhất Δ');
  }
  return `${html}</div>`;
}

/**
 * Bảng so sánh Welsh-Powell và DSATUR kèm cận dưới, cận trên.
 * @param {{results: {id: string, name: string, colorCount: number, timeMs: number, valid: boolean, gapPercent: number|null}[],
 *          lowerBound: number, upperBound: number}} compare  kết quả compareAlgorithms (có thể đã lọc còn một thuật toán)
 * @param {string} usedId  id thuật toán được dùng để xếp lịch
 * @returns {string}
 */
export function renderComparison(compare, usedId) {
  const { results, lowerBound: lb, upperBound: ub } = compare;
  const rows = results
    .map((r) => {
      const inRange = r.colorCount >= lb && r.colorCount <= ub;
      const gap = r.gapPercent === null ? '—' : `${r.gapPercent.toFixed(1)}%`;
      return `<tr class="${r.id === usedId ? 'best-row' : ''}">
        <td>${esc(r.name)}${r.id === usedId ? ' <span class="badge text-bg-success">dùng xếp lịch</span>' : ''}</td>
        <td class="text-end">${r.colorCount}</td>
        <td class="text-end">${formatMs(r.timeMs)}</td>
        <td class="text-end">${gap}</td>
        <td class="text-center">${r.valid ? '✔ hợp lệ' : '✘ KHÔNG hợp lệ'}</td>
        <td class="text-center">${inRange ? '✔' : '✘'}</td>
      </tr>`;
    })
    .join('');

  let note = '';
  const wp = results.find((r) => r.id === 'welshPowell');
  const ds = results.find((r) => r.id === 'dsatur');
  if (wp && ds) {
    const pct = improvementPercent(wp.colorCount, ds.colorCount);
    if (ds.colorCount < wp.colorCount) {
      note = `DSATUR dùng ít hơn Welsh-Powell ${wp.colorCount - ds.colorCount} ca (cải thiện ${pct.toFixed(1)}%).`;
    } else if (ds.colorCount > wp.colorCount) {
      note = `Trường hợp này Welsh-Powell dùng ít hơn DSATUR ${ds.colorCount - wp.colorCount} ca (heuristic không đảm bảo tối ưu).`;
    } else {
      note = `Hai thuật toán cùng dùng ${ds.colorCount} ca.`;
    }
    note += ` Thời gian trung bình: Welsh-Powell ${formatMs(wp.timeMs)} ms, DSATUR ${formatMs(ds.timeMs)} ms.`;
  }

  return `<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-2">
    <thead class="table-light"><tr>
      <th>Thuật toán</th><th class="text-end">Số màu (ca thi)</th><th class="text-end">Thời gian TB (ms)</th>
      <th class="text-end">Lệch so với cận dưới</th><th class="text-center">Kiểm tra hợp lệ</th><th class="text-center">Nằm giữa hai cận</th>
    </tr></thead><tbody>${rows}</tbody></table></div>
    <p class="mb-1"><strong>Cận dưới</strong> (clique tham lam): ${lb} &nbsp;·&nbsp; <strong>Cận trên</strong> (Δ + 1): ${ub}.
      Số sắc χ(G) nằm trong khoảng từ ${lb} đến ${ub}.</p>
    ${note ? `<p class="mb-0 text-muted">${esc(note)}</p>` : ''}`;
}

/**
 * Lấy tập môn đã bị chuyển sang ca phụ từ danh sách cảnh báo của buildSchedule.
 * Câu cảnh báo có dạng "Môn X thiếu phòng ở ... đã chuyển sang ca phụ ...".
 * @param {string[]} warnings
 * @returns {Set<string>}
 */
export function auxiliaryCourses(warnings) {
  const set = new Set();
  for (const w of warnings) {
    const m = /^Môn (.+?) thiếu phòng ở /.exec(w);
    if (m) set.add(m[1]);
  }
  return set;
}

/**
 * Bảng lịch thi.
 * @param {ScheduleEntry[]} schedule
 * @param {{studentId: string, courseId: string}[]} registrations  để hiện số sinh viên mỗi môn
 * @param {string[]} warnings
 * @returns {string}
 */
export function renderSchedule(schedule, registrations, warnings) {
  const sizes = countStudentsPerCourse(registrations);
  const aux = auxiliaryCourses(warnings);
  const rows = schedule
    .map(
      (e) => `<tr>
        <td>${esc(formatDate(e.date))}</td><td class="text-center">${e.slot + 1}</td><td>${esc(e.time ?? '')}</td>
        <td>${esc(e.course)}${aux.has(e.course) ? ' <span class="badge text-bg-warning">ca phụ</span>' : ''}</td>
        <td>${esc(e.rooms.join(', '))}</td><td class="text-end">${sizes.get(e.course) ?? 0}</td></tr>`,
    )
    .join('');
  return `<table class="table table-sm table-striped table-hover mb-0">
    <thead><tr><th>Ngày</th><th class="text-center">Ca</th><th>Giờ</th><th>Môn</th><th>Phòng</th><th class="text-end">Số SV</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/**
 * Hộp cảnh báo (môn phải chuyển sang ca phụ, sinh viên thi quá nhiều môn trong ngày...).
 * @param {string[]} warnings
 * @returns {string}
 */
export function renderWarnings(warnings) {
  if (warnings.length === 0) return '';
  const items = warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  return `<div class="alert alert-warning py-2"><strong>Cảnh báo (${warnings.length}):</strong><ul class="mb-0">${items}</ul></div>`;
}

/**
 * Kết quả các phép kiểm tra lịch cuối cùng (theo sinh viên, theo phòng).
 * @param {{valid: boolean, conflicts: unknown[], missing: string[]}} byStudent  từ checkScheduleByStudent
 * @param {{valid: boolean, problems: string[]}} rooms  từ checkRooms
 * @returns {string}
 */
export function renderChecks(byStudent, rooms) {
  const line = (ok, okText, badText) =>
    `<div class="${ok ? 'text-success' : 'text-danger'}">${ok ? '✔' : '✘'} ${esc(ok ? okText : badText)}</div>`;
  return (
    line(byStudent.valid, 'Không sinh viên nào có hai môn cùng ngày và ca.',
      `Có ${byStudent.conflicts.length} trường hợp sinh viên trùng ca và ${byStudent.missing.length} môn thiếu trong lịch.`) +
    line(rooms.valid, 'Không phòng nào bị xếp hai môn cùng ca.', `Phòng thi có vấn đề: ${rooms.problems.slice(0, 3).join(' ')}`)
  );
}

/**
 * Thống kê theo từng ca thi thực tế (một ca = một cặp ngày + ca).
 * Mức cân bằng đo bằng hệ số biến thiên CV = độ lệch chuẩn / trung bình của số môn mỗi ca:
 * CV càng nhỏ thì các ca càng đều nhau.
 *
 * @param {ScheduleEntry[]} schedule
 * @param {{studentId: string, courseId: string}[]} registrations
 * @param {number} colorCount  số màu của phép tô (số ca tối thiểu theo thuật toán)
 * @returns {{sessions: {date: string, slot: number, time: string, courses: number, rooms: number, students: number}[],
 *            dayCount: number, colorCount: number, sessionCount: number, auxiliaryCount: number,
 *            min: number, max: number, mean: number, stdev: number, cv: number, label: string}}
 */
export function computeSlotStats(schedule, registrations, colorCount) {
  const sizes = countStudentsPerCourse(registrations);
  /** @type {Map<string, {date: string, slot: number, time: string, courses: number, rooms: Set<string>, students: number}>} */
  const map = new Map();
  for (const e of schedule) {
    const key = `${e.date}|${e.slot}`;
    if (!map.has(key)) map.set(key, { date: e.date, slot: e.slot, time: e.time ?? '', courses: 0, rooms: new Set(), students: 0 });
    const s = map.get(key);
    s.courses++;
    e.rooms.forEach((r) => s.rooms.add(r));
    s.students += sizes.get(e.course) ?? 0;
  }
  const sessions = [...map.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot))
    .map((s) => ({ ...s, rooms: s.rooms.size }));

  const counts = sessions.map((s) => s.courses);
  const n = counts.length;
  const mean = n ? counts.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n ? counts.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
  const stdev = Math.sqrt(variance);
  const cv = mean > 0 ? stdev / mean : 0;
  const label = cv < 0.25 ? 'khá đều' : cv < 0.5 ? 'trung bình' : 'chênh lệch nhiều';
  return {
    sessions,
    dayCount: new Set(sessions.map((s) => s.date)).size,
    colorCount,
    sessionCount: n,
    auxiliaryCount: Math.max(0, n - colorCount),
    min: n ? Math.min(...counts) : 0,
    max: n ? Math.max(...counts) : 0,
    mean,
    stdev,
    cv,
    label,
  };
}

/**
 * Hiển thị thống kê ca thi: số ca, số ngày, mức cân bằng và số môn từng ca.
 * @param {ReturnType<typeof computeSlotStats>} stats
 * @returns {string}
 */
export function renderSlotStats(stats) {
  const tiles =
    tile(stats.colorCount, 'ca tối thiểu (số màu)') +
    tile(stats.sessionCount, 'ca thực tế (cả ca phụ)') +
    tile(stats.auxiliaryCount, 'ca phụ phát sinh') +
    tile(stats.dayCount, 'số ngày thi') +
    tile(`${stats.min} – ${stats.max}`, 'số môn mỗi ca (nhỏ – lớn)');
  const max = Math.max(1, stats.max);
  const rows = stats.sessions
    .map(
      (s, i) => `<tr><td class="text-center">${i + 1}</td><td>${esc(formatDate(s.date))}</td><td class="text-center">${s.slot + 1}</td>
        <td>${esc(s.time)}</td><td class="text-end">${s.courses}</td><td class="text-end">${s.rooms}</td><td class="text-end">${s.students}</td>
        <td class="bar-cell"><div class="bar" style="width:${Math.round((s.courses / max) * 100)}%"></div></td></tr>`,
    )
    .join('');
  return `<div class="row g-2 mb-3">${tiles}</div>
    <p class="mb-2">Mức cân bằng số môn giữa các ca: trung bình ${stats.mean.toFixed(2)} môn/ca, độ lệch chuẩn ${stats.stdev.toFixed(2)},
      hệ số biến thiên CV = ${stats.cv.toFixed(2)} (<strong>${esc(stats.label)}</strong>).</p>
    <div class="table-responsive schedule-wrap"><table class="table table-sm mb-0">
      <thead><tr><th class="text-center">#</th><th>Ngày</th><th class="text-center">Ca</th><th>Giờ</th>
        <th class="text-end">Số môn</th><th class="text-end">Số phòng</th><th class="text-end">Lượt thi</th><th>Biểu đồ số môn</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

/**
 * Kết quả tra cứu lịch thi của một sinh viên.
 * @param {string} studentId
 * @param {ScheduleEntry[]} entries  từ lookupStudent
 * @returns {string}
 */
export function renderLookup(studentId, entries) {
  const rows = entries
    .map(
      (e) => `<tr><td>${esc(e.course)}</td><td>${esc(formatDate(e.date))}</td><td class="text-center">${e.slot + 1}</td>
        <td>${esc(e.time ?? '')}</td><td>${esc(e.rooms.join(', '))}</td></tr>`,
    )
    .join('');
  return `<p class="mb-2">Sinh viên <strong>${esc(studentId)}</strong> thi ${entries.length} môn:</p>
    <div class="table-responsive"><table class="table table-sm table-bordered mb-0">
      <thead class="table-light"><tr><th>Môn</th><th>Ngày</th><th class="text-center">Ca</th><th>Giờ</th><th>Phòng</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

/**
 * Chú thích màu: mỗi ca (màu) kèm số môn.
 * @param {Map<string, number>} colors
 * @returns {string}
 */
export function renderLegend(colors) {
  const items = legendItems(colors);
  if (items.length === 0) return '<span class="text-muted">Chưa tô đỉnh nào.</span>';
  return items
    .map((it) => `<span class="legend-item"><span class="legend-swatch" style="background:${it.css}"></span>Ca ${it.color + 1} (${it.count} môn)</span>`)
    .join('');
}

/**
 * Tải một Blob về máy bằng thẻ <a download>.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
