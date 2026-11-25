/**
 * main.js — Điều phối giao diện web (người E).
 *
 * Luồng chính khi bấm "Chạy và xếp lịch thi":
 *   dữ liệu (nhập tay hoặc file) → validateRegistrations/loadRegistrations → buildGraph
 *   → welshPowell/dsatur (compareAlgorithms) → buildSchedule → kiểm tra lịch → hiển thị.
 *
 * File này chỉ làm việc với trang web (jQuery + DOM); mọi tính toán nằm trong core/.
 * Mọi lỗi từ các module khác đều được bắt bằng try/catch và hiện thành thông báo trên trang,
 * nên nhập sai không làm trang bị treo hay trắng.
 */
import $ from 'jquery';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../css/style.css';

import { DataError, validateRegistrations, summarizeRegistrations } from '../core/dataLoader.js';
import { loadRegistrations } from './fileLoader.js';
import { buildGraph, graphStats } from '../core/graphBuilder.js';
import { ALGORITHMS, compareAlgorithms } from '../core/compare.js';
import { checkScheduleByStudent, checkRooms } from '../core/validator.js';
import { DEFAULT_CONFIG, validateConfig, configToJson, configFromJson } from '../core/constraints.js';
import { buildSchedule, countStudentsPerCourse } from '../core/scheduler.js';
import { lookupStudent } from '../core/lookup.js';
import { exportSchedule } from '../core/exporter.js';
import { drawGraph } from './visualizer.js';
import {
  esc,
  renderSummary,
  renderComparison,
  renderSchedule,
  renderWarnings,
  renderChecks,
  computeSlotStats,
  renderSlotStats,
  renderLookup,
  renderLegend,
  downloadBlob,
} from './statsPanel.js';

/** Số dòng trống có sẵn trong bảng nhập khi mở trang (bảng luôn trống, không có dữ liệu mẫu). */
const INITIAL_ROWS = 5;

/** Trạng thái của trang: mọi thứ cần nhớ giữa các lần bấm nút. */
const state = {
  mode: 'manual', // 'manual' | 'file'
  fileRegs: null, // danh sách đăng ký đã đọc từ file
  regs: null, // danh sách đăng ký của lần chạy gần nhất
  graph: null,
  runs: [], // mỗi phần tử: kết quả compareAlgorithms + steps
  usedId: null, // thuật toán được dùng để xếp lịch
  schedule: [],
  warnings: [],
  view: { id: null, step: 0, timer: null },
};

/* ------------------------------------------------------------------ */
/* Thông báo                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hiện thông báo ở đầu trang.
 * @param {'danger'|'warning'|'success'|'info'} type
 * @param {string} text  văn bản thuần (được escape), xuống dòng được giữ nguyên
 */
function showMessage(type, text) {
  $('#messageBox').html(
    `<div class="alert alert-${type} alert-dismissible" role="alert"><p class="pre-line">${esc(text)}</p>` +
      '<button type="button" class="btn-close" aria-label="Đóng"></button></div>',
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearMessage() {
  $('#messageBox').empty();
}

$('#messageBox').on('click', '.btn-close', clearMessage);

/**
 * Hiện lỗi bắt được. DataError có message dành cho người dùng; lỗi khác là lỗi chương trình.
 * @param {unknown} err
 */
function showError(err) {
  if (err instanceof DataError) {
    showMessage('danger', err.message);
  } else {
    console.error(err);
    showMessage('danger', `Đã xảy ra lỗi không mong đợi: ${err?.message ?? err}. Hãy thử tải lại trang.`);
  }
}

window.addEventListener('error', (e) => showMessage('danger', `Lỗi chương trình: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

/** Báo cho người dùng biết kết quả đang hiển thị đã cũ so với dữ liệu/cấu hình. */
function markStale() {
  if (!$('#results').prop('hidden')) $('#staleBadge').prop('hidden', false);
}

/* ------------------------------------------------------------------ */
/* Bảng nhập trực tiếp                                                 */
/* ------------------------------------------------------------------ */

/** Đánh lại số thứ tự các dòng trong bảng nhập. */
function renumberRows() {
  $('#inputBody tr').each((i, tr) => $(tr).find('.row-no').text(i + 1));
}

/**
 * Thêm một dòng vào bảng nhập.
 * @param {string} [studentId]
 * @param {string} [courseId]
 * @returns {JQuery<HTMLElement>}
 */
function addRow(studentId = '', courseId = '') {
  const $tr = $(
    '<tr><td class="row-no"></td>' +
      '<td><input type="text" class="form-control form-control-sm in-student" aria-label="Mã sinh viên" autocomplete="off"></td>' +
      '<td><input type="text" class="form-control form-control-sm in-course" aria-label="Mã môn" autocomplete="off"></td>' +
      '<td class="text-center"><button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del" aria-label="Xóa dòng" title="Xóa dòng">✕</button></td></tr>',
  );
  $tr.find('.in-student').val(studentId);
  $tr.find('.in-course').val(courseId);
  $('#inputBody').append($tr);
  renumberRows();
  return $tr;
}

/** Đọc toàn bộ bảng nhập (kể cả dòng trống để số dòng báo lỗi khớp số dòng trên bảng). */
function readManualRows() {
  return $('#inputBody tr')
    .map((_, tr) => ({ studentId: $(tr).find('.in-student').val(), courseId: $(tr).find('.in-course').val() }))
    .get();
}

function resetManualTable() {
  $('#inputBody').empty();
  for (let i = 0; i < INITIAL_ROWS; i++) addRow();
}

/** Tô nền đỏ các dòng bị báo lỗi để người dùng tìm ra ngay. */
function markErrorRows(details) {
  $('#inputBody tr').removeClass('row-error');
  for (const d of details ?? []) {
    if (d.line) $('#inputBody tr').eq(d.line - 1).addClass('row-error');
  }
}

$('#btnAddRow').on('click', () => addRow().find('.in-student').trigger('focus'));
$('#btnClearRows').on('click', () => {
  resetManualTable();
  $('#dataSummary').empty();
  markStale();
});
$('#inputBody').on('click', '.btn-del', function () {
  $(this).closest('tr').remove();
  if ($('#inputBody tr').length === 0) addRow();
  renumberRows();
  markStale();
});
$('#inputBody').on('input', 'input', () => {
  $('#inputBody tr.row-error').removeClass('row-error');
  markStale();
});
// Nhấn Enter ở ô mã môn: xuống dòng kế tiếp (thêm dòng mới nếu đang ở dòng cuối).
$('#inputBody').on('keydown', '.in-course', function (e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const $tr = $(this).closest('tr');
  const $next = $tr.next().length ? $tr.next() : addRow();
  $next.find('.in-student').trigger('focus');
});
// Dán nhiều dòng từ Excel: tách theo dòng và theo tab (hoặc dấu phẩy/chấm phẩy).
$('#inputBody').on('paste', 'input', function (e) {
  const text = e.originalEvent.clipboardData?.getData('text') ?? '';
  if (!/[\n\t]/.test(text)) return; // dán một giá trị bình thường thì để trình duyệt tự xử lý
  e.preventDefault();
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  const cells = lines.map((l) => (l.includes('\t') ? l.split('\t') : l.split(/[,;]/)));
  const startCol = $(this).hasClass('in-course') ? 1 : 0;
  const singleColumn = cells.every((c) => c.length === 1);
  let $tr = $(this).closest('tr');
  cells.forEach((c, i) => {
    if (i > 0) $tr = $tr.next().length ? $tr.next() : addRow();
    const set = (sel, v) => $tr.find(sel).val((v ?? '').trim());
    if (singleColumn) set(startCol === 1 ? '.in-course' : '.in-student', c[0]);
    else {
      set('.in-student', c[0]);
      set('.in-course', c[1]);
    }
  });
  markStale();
});

/* ------------------------------------------------------------------ */
/* Chọn cách nhập và nạp dữ liệu                                       */
/* ------------------------------------------------------------------ */

$('#inputTabs').on('click', 'button[data-mode]', function () {
  state.mode = $(this).data('mode');
  $('#inputTabs .nav-link').removeClass('active');
  $(this).addClass('active');
  $('#paneManual').prop('hidden', state.mode !== 'manual');
  $('#paneFile').prop('hidden', state.mode !== 'file');
  $('#dataSummary').empty();
  markStale();
});

/** Chọn file: đọc và kiểm tra ngay để báo lỗi sớm. */
$('#fileInput').on('change', async function () {
  const file = this.files[0];
  state.fileRegs = null;
  $('#dataSummary').empty();
  $('#fileName').text(file ? file.name : '');
  if (!file) return;
  clearMessage();
  try {
    state.fileRegs = await loadRegistrations(file);
    showDataSummary(state.fileRegs);
    markStale();
  } catch (err) {
    showError(err);
    this.value = '';
    $('#fileName').text('');
  }
});

/**
 * Hiện tóm tắt dữ liệu và thống kê đồ thị.
 * @param {{studentId: string, courseId: string}[]} regs
 */
function showDataSummary(regs) {
  $('#dataSummary').html(renderSummary(summarizeRegistrations(regs), graphStats(buildGraph(regs))));
}

/**
 * Lấy danh sách đăng ký từ nguồn đang chọn.
 * @returns {{studentId: string, courseId: string}[]}
 * @throws {DataError}
 */
function getRegistrations() {
  if (state.mode === 'file') {
    if (!state.fileRegs) throw new DataError('Chưa có dữ liệu: hãy chọn file Excel (.xlsx) hoặc chuyển sang nhập trực tiếp.');
    return state.fileRegs;
  }
  try {
    const regs = validateRegistrations(readManualRows());
    markErrorRows([]);
    return regs;
  } catch (err) {
    if (err instanceof DataError) markErrorRows(err.details);
    throw err;
  }
}

$('#btnUseManual').on('click', () => {
  clearMessage();
  try {
    showDataSummary(getRegistrations());
  } catch (err) {
    $('#dataSummary').empty();
    showError(err);
  }
});

/* ------------------------------------------------------------------ */
/* Cấu hình lịch thi                                                   */
/* ------------------------------------------------------------------ */

/**
 * Dựng các ô giờ cho từng ca, giữ lại giờ đã nhập nếu có.
 * @param {number} count
 * @param {string[]} [values]
 */
function buildSlotInputs(count, values) {
  const old = values ?? $('#slotTimes input').map((_, el) => el.value).get();
  $('#slotTimes').empty();
  for (let i = 0; i < count; i++) {
    const v = old[i] ?? DEFAULT_CONFIG.slotTimes[i] ?? '';
    $('#slotTimes').append(
      `<div class="input-group input-group-sm w-auto"><span class="input-group-text">Ca ${i + 1}</span>` +
        `<input type="time" class="form-control slot-time" value="${esc(v)}" aria-label="Giờ ca ${i + 1}"></div>`,
    );
  }
}

/** Thêm một dòng phòng thi (mã phòng, sức chứa). */
function addRoom(id = '', capacity = '') {
  const $tr = $(
    '<tr><td><input type="text" class="form-control form-control-sm room-id" aria-label="Mã phòng" placeholder="VD: A101"></td>' +
      '<td><input type="number" min="1" class="form-control form-control-sm room-cap" aria-label="Sức chứa" placeholder="VD: 40"></td>' +
      '<td class="text-center"><button type="button" class="btn btn-sm btn-link text-danger p-0 btn-del-room" aria-label="Xóa phòng">✕</button></td></tr>',
  );
  $tr.find('.room-id').val(id);
  $tr.find('.room-cap').val(capacity);
  $('#roomBody').append($tr);
}

$('#btnAddRoom').on('click', () => addRoom());
$('#roomBody').on('click', '.btn-del-room', function () {
  $(this).closest('tr').remove();
  markStale();
});
$('#cfgSlotsPerDay').on('change', function () {
  const n = Math.max(1, Math.min(8, Number(this.value) || 1));
  this.value = n;
  buildSlotInputs(n);
  markStale();
});
$('#sectionConfig, #algoChoice').on('input change', markStale);

/**
 * Đọc cấu hình từ các ô trên trang (chưa kiểm tra; validateConfig sẽ kiểm tra).
 * @returns {object}
 * @throws {DataError} khi còn ca chưa có giờ
 */
function readConfig() {
  const slotTimes = $('#slotTimes input').map((_, el) => el.value).get();
  slotTimes.forEach((t, i) => {
    if (t === '') throw new DataError(`Hãy nhập giờ bắt đầu cho ca ${i + 1}.`);
  });
  const rooms = $('#roomBody tr')
    .map((_, tr) => ({ id: $(tr).find('.room-id').val().trim(), capacity: $(tr).find('.room-cap').val().trim() }))
    .get()
    .filter((r) => r.id !== '' || r.capacity !== '') // bỏ dòng phòng hoàn toàn trống
    .map((r) => ({ id: r.id, capacity: r.capacity === '' ? NaN : Number(r.capacity) }));
  const maxText = $('#cfgMaxPerDay').val().trim();
  return {
    startDate: $('#cfgStartDate').val(),
    slotsPerDay: Number($('#cfgSlotsPerDay').val()),
    slotTimes,
    rooms,
    holidays: $('#cfgHolidays').val().split(/[\s,;]+/).filter(Boolean),
    skipWeekends: $('#cfgSkipWeekends').prop('checked'),
    maxExamsPerStudentPerDay: maxText === '' ? null : Number(maxText),
    optimizeOrder: $('#cfgOptimize').prop('checked'),
  };
}

/** Đưa một cấu hình (đã kiểm tra) lên các ô trên trang. */
function writeConfig(cfg) {
  $('#cfgStartDate').val(cfg.startDate);
  $('#cfgSlotsPerDay').val(cfg.slotsPerDay);
  buildSlotInputs(cfg.slotsPerDay, cfg.slotTimes);
  $('#roomBody').empty();
  cfg.rooms.forEach((r) => addRoom(r.id, r.capacity));
  if (cfg.rooms.length === 0) addRoom();
  $('#cfgHolidays').val(cfg.holidays.join('\n'));
  $('#cfgSkipWeekends').prop('checked', cfg.skipWeekends);
  $('#cfgMaxPerDay').val(cfg.maxExamsPerStudentPerDay ?? '');
  $('#cfgOptimize').prop('checked', cfg.optimizeOrder);
}

$('#btnSaveConfig').on('click', () => {
  clearMessage();
  try {
    const cfg = validateConfig(readConfig());
    downloadBlob(new Blob([configToJson(cfg)], { type: 'application/json' }), 'cau-hinh-lich-thi.json');
  } catch (err) {
    showError(err);
  }
});

$('#configFile').on('change', async function () {
  const file = this.files[0];
  this.value = '';
  if (!file) return;
  clearMessage();
  try {
    writeConfig(configFromJson(await file.text()));
    showMessage('success', `Đã nạp cấu hình từ file "${file.name}".`);
  } catch (err) {
    showError(err);
  }
});

/* ------------------------------------------------------------------ */
/* Chạy thuật toán và xếp lịch                                         */
/* ------------------------------------------------------------------ */

/** Chọn lần chạy dùng để xếp lịch: ít màu nhất, hòa thì lấy theo thứ tự ALGORITHMS (Welsh-Powell trước). */
function pickRun(runs) {
  const valid = runs.filter((r) => r.valid);
  if (valid.length === 0) throw new Error('Không có thuật toán nào cho kết quả tô màu hợp lệ.');
  return valid.reduce((best, r) => (r.colorCount < best.colorCount ? r : best));
}

function runAll() {
  clearMessage();
  stopPlay();
  let regs;
  let config;
  try {
    regs = getRegistrations();
    config = validateConfig(readConfig());
  } catch (err) {
    showError(err);
    return;
  }

  const $btn = $('#btnRun').prop('disabled', true).text('Đang xử lý...');
  // setTimeout để trình duyệt kịp vẽ chữ "Đang xử lý..." trước khi tính toán nặng.
  setTimeout(() => {
    try {
      const graph = buildGraph(regs);
      const choice = $('input[name="algo"]:checked').val();
      const repeat = graph.size > 400 ? 3 : 20; // đồ thị lớn thì giảm số lần lặp đo thời gian
      const compare = compareAlgorithms(graph, { repeat });
      const results = choice === 'both' ? compare.results : compare.results.filter((r) => r.id === choice);

      // Chạy lại từng thuật toán một lần có ghi bước, để vẽ chế độ xem từng bước.
      const runs = results.map((r) => {
        const steps = [];
        ALGORITHMS.find((a) => a.id === r.id).run(graph, steps);
        return { ...r, steps };
      });
      const used = pickRun(runs);
      const { schedule, warnings } = buildSchedule(used.colors, regs, config);

      Object.assign(state, { regs, graph, runs, usedId: used.id, schedule, warnings });
      state.view = { id: used.id, step: used.steps.length, timer: null };
      renderResults({ ...compare, results: runs }, config);
    } catch (err) {
      showError(err);
    } finally {
      $btn.prop('disabled', false).text('Chạy và xếp lịch thi');
    }
  }, 30);
}

$('#btnRun').on('click', runAll);

/**
 * Hiển thị toàn bộ kết quả của lần chạy.
 * @param {ReturnType<typeof compareAlgorithms>} compare
 * @param {import('../core/constraints.js').ScheduleConfig} config
 */
function renderResults(compare, config) {
  const { regs, graph, schedule, warnings, usedId } = state;
  const used = state.runs.find((r) => r.id === usedId);

  $('#results').prop('hidden', false);
  $('#staleBadge').prop('hidden', true);

  const g = graphStats(graph);
  $('#graphInfo').text(`${g.vertices} đỉnh, ${g.edges} cạnh, ${g.isolated} đỉnh cô lập`);

  $('#viewAlgo').html(state.runs.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.colorCount} màu)</option>`).join(''));
  $('#viewAlgo').val(usedId);

  let cmpHtml = renderComparison(compare, usedId);
  if (state.runs.length > 1) {
    cmpHtml += '<p class="small text-muted mb-0 mt-2">Lịch thi dùng kết quả có ít ca nhất; nếu bằng nhau thì lấy Welsh-Powell.</p>';
  }
  $('#comparePanel').html(cmpHtml);

  // Kiểm tra lịch cuối cùng (theo sinh viên và theo phòng, có đối chiếu sức chứa).
  const sizes = countStudentsPerCourse(regs);
  const checkedSchedule = schedule.map((e) => ({ ...e, students: sizes.get(e.course) }));
  $('#checkPanel').html(renderChecks(checkScheduleByStudent(schedule, regs), checkRooms(checkedSchedule, config.rooms)));
  $('#warningPanel').html(renderWarnings(warnings));
  $('#schedulePanel').html(renderSchedule(schedule, regs, warnings));
  $('#slotPanel').html(renderSlotStats(computeSlotStats(schedule, regs, used.colorCount)));
  $('#lookupResult').empty();

  redraw();
  $('#results')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ------------------------------------------------------------------ */
/* Đồ thị và chế độ xem từng bước                                      */
/* ------------------------------------------------------------------ */

function currentRun() {
  return state.runs.find((r) => r.id === state.view.id) ?? state.runs[0];
}

/** Vẽ lại đồ thị theo bước đang xem và cập nhật chú thích, nút, dòng mô tả bước. */
function redraw() {
  if (!state.graph || $('#results').prop('hidden')) return;
  const run = currentRun();
  const total = run.steps.length;
  const k = Math.min(state.view.step, total);

  // Màu của k bước đầu tiên (Map giữ thứ tự thêm vào).
  const colors = new Map();
  for (let i = 0; i < k; i++) colors.set(run.steps[i].course, run.steps[i].color);
  const last = k > 0 && k < total ? run.steps[k - 1] : null;

  drawGraph(state.graph, colors, document.getElementById('graphCanvas'), { highlight: last?.course ?? null });
  $('#legend').html(renderLegend(colors));

  let info;
  if (k === total) info = `Đã tô xong ${total} môn bằng ${run.name}: dùng ${run.colorCount} màu (ca thi).`;
  else if (k === 0) info = `${run.name}: chưa tô môn nào. Bấm "Bước tiếp" để xem từng bước.`;
  else {
    const sat = last.saturation !== undefined ? `, độ bão hòa ${last.saturation}` : '';
    info = `Bước ${k}/${total}: môn ${last.course} → Ca ${last.color + 1}${sat}.`;
  }
  $('#stepInfo').text(info);

  $('#btnPrev').prop('disabled', k === 0);
  $('#btnNext').prop('disabled', k === total);
}

function stopPlay() {
  if (state.view.timer) clearInterval(state.view.timer);
  state.view.timer = null;
}

function setStep(k) {
  state.view.step = Math.max(0, Math.min(k, currentRun().steps.length));
  redraw();
}

$('#btnPrev').on('click', () => { stopPlay(); setStep(state.view.step - 1); });
$('#btnNext').on('click', () => { stopPlay(); setStep(state.view.step + 1); });
$('#btnShowAll').on('click', () => { stopPlay(); setStep(currentRun().steps.length); });
$('#btnReplay').on('click', () => {
  stopPlay();
  setStep(0);
  const total = currentRun().steps.length;
  const delay = total > 100 ? 30 : total > 40 ? 150 : 500; // đồ thị lớn thì chạy nhanh hơn
  state.view.timer = setInterval(() => {
    if (state.view.step >= total) return stopPlay();
    setStep(state.view.step + 1);
  }, delay);
});
$('#viewAlgo').on('change', function () {
  stopPlay();
  state.view.id = this.value;
  setStep(currentRun().steps.length);
});

// Vẽ lại khi đổi kích thước cửa sổ (đợi 150 ms sau lần đổi cuối để khỏi vẽ liên tục).
let resizeTimer = null;
$(window).on('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redraw, 150);
});

/* ------------------------------------------------------------------ */
/* Tra cứu và tải file                                                 */
/* ------------------------------------------------------------------ */

$('#lookupForm').on('submit', (e) => {
  e.preventDefault();
  const id = $('#lookupInput').val();
  try {
    const entries = lookupStudent(state.schedule, state.regs, id);
    $('#lookupResult').html(renderLookup(id.trim().toUpperCase().replace(/\s+/g, ' '), entries));
  } catch (err) {
    if (err instanceof DataError) $('#lookupResult').html(`<div class="alert alert-warning mb-0">${esc(err.message)}</div>`);
    else showError(err);
  }
});

/**
 * Xuất lịch thi và tải về.
 * @param {'xlsx'|'csv'} format
 */
async function doExport(format) {
  clearMessage();
  try {
    downloadBlob(await exportSchedule(state.schedule, format), `lich-thi.${format}`);
  } catch (err) {
    showError(err);
  }
}
$('#btnExportXlsx').on('click', () => doExport('xlsx'));
$('#btnExportCsv').on('click', () => doExport('csv'));

/* ------------------------------------------------------------------ */
/* Khởi tạo: mọi thứ để trống, không nạp dữ liệu mẫu                   */
/* ------------------------------------------------------------------ */

resetManualTable();
buildSlotInputs(DEFAULT_CONFIG.slotsPerDay, DEFAULT_CONFIG.slotTimes);
addRoom();
