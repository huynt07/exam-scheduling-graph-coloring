/**
 * dataLoader.js — Đọc, kiểm tra và chuẩn hóa danh sách đăng ký thi (người A).
 *
 * Hai nguồn dữ liệu (nhập trực tiếp trên bảng, file Excel .xlsx) đều đi qua CÙNG một
 * quy trình kiểm tra (checkRows), nên quy tắc dữ liệu chỉ viết ở một chỗ.
 * Chương trình chỉ nhận file .xlsx: định dạng này luôn lưu Unicode nên tiếng Việt
 * không bao giờ bị lỗi chữ như CSV lưu sai bảng mã.
 *
 * File này nằm trong core/: không dùng document, window hay File, để kiểm thử bằng Node.js.
 */
import * as XLSX from 'xlsx';

/**
 * @typedef {Object} Registration
 * @property {string} studentId  Mã sinh viên đã chuẩn hóa
 * @property {string} courseId   Mã môn đã chuẩn hóa
 */

/** Số lỗi tối đa liệt kê trong một thông báo, tránh thông báo quá dài. */
const MAX_ERRORS = 20;

/**
 * Các tên cột được chấp nhận, viết ở dạng đã chuẩn hóa bởi normalizeHeader
 * (chữ thường, bỏ dấu, bỏ khoảng trắng). Ví dụ "Mã SV" → "masv", "MSSV" → "mssv".
 */
const STUDENT_HEADERS = new Set(['studentid', 'mssv', 'masv', 'masinhvien']);
const COURSE_HEADERS = new Set(['courseid', 'mamon', 'mamonhoc']);

/**
 * Lỗi dữ liệu đầu vào: message dễ đọc để giao diện hiện thẳng cho người dùng,
 * details giữ danh sách lỗi theo dòng để kiểm thử hoặc hiển thị dạng bảng.
 */
export class DataError extends Error {
  /**
   * @param {string} message
   * @param {{line: number|null, message: string}[]} [details]
   */
  constructor(message, details = []) {
    super(message);
    this.name = 'DataError';
    this.details = details;
  }
}

/**
 * Chuẩn hóa tên cột để so khớp: bỏ dấu tiếng Việt, đổi đ → d, chữ thường, bỏ mọi khoảng trắng.
 * @param {unknown} header
 * @returns {string}
 */
export function normalizeHeader(header) {
  return String(header ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu thanh, dấu mũ...
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Chuẩn hóa một mã (sinh viên hoặc môn): ép về chuỗi, cắt khoảng trắng hai đầu,
 * gộp khoảng trắng thừa ở giữa, chuẩn Unicode NFC và viết hoa.
 * Không bao giờ đổi sang số, nên mã như "0123" giữ nguyên số 0 đầu.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeCode(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Tìm vị trí hai cột mã sinh viên và mã môn trong dòng tiêu đề.
 * @param {unknown[]} headerRow
 * @returns {{studentCol: number, courseCol: number}}
 * @throws {DataError} nếu thiếu cột
 */
function findColumns(headerRow) {
  let studentCol = -1;
  let courseCol = -1;
  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (studentCol === -1 && STUDENT_HEADERS.has(name)) studentCol = index;
    if (courseCol === -1 && COURSE_HEADERS.has(name)) courseCol = index;
  });
  const missing = [];
  if (studentCol === -1) missing.push('mã sinh viên (studentId, MSSV hoặc Mã SV)');
  if (courseCol === -1) missing.push('mã môn (courseId hoặc Mã môn)');
  if (missing.length > 0) {
    throw new DataError(
      `Dòng tiêu đề thiếu cột ${missing.join(' và ')}. ` +
        'Dòng đầu tiên của sheet phải có tên hai cột studentId, courseId.',
      [{ line: 1, message: 'Thiếu cột' }],
    );
  }
  return { studentCol, courseCol };
}

/**
 * Quy trình kiểm tra dùng chung cho cả ba nguồn dữ liệu.
 * Bỏ qua dòng trống hoàn toàn; báo lỗi ô trống và đăng ký trùng kèm số dòng.
 *
 * @param {{line: number, studentId: unknown, courseId: unknown}[]} rows
 *        Các dòng dữ liệu (không gồm tiêu đề), line là số dòng hiển thị cho người dùng.
 * @param {string} lineLabel  Cách gọi dòng trong thông báo, ví dụ "Dòng" hoặc "Dòng bảng nhập"
 * @returns {Registration[]}
 * @throws {DataError}
 */
function checkRows(rows, lineLabel) {
  /** @type {Registration[]} */
  const registrations = [];
  const errors = [];
  // Khóa (mãSV, mãMôn) → dòng xuất hiện đầu tiên, để phát hiện đăng ký trùng trong O(1).
  const firstSeen = new Map();

  for (const row of rows) {
    const studentId = normalizeCode(row.studentId);
    const courseId = normalizeCode(row.courseId);

    if (studentId === '' && courseId === '') continue; // dòng trống: bỏ qua

    if (studentId === '' || courseId === '') {
      const what = studentId === '' ? 'mã sinh viên' : 'mã môn';
      errors.push({ line: row.line, message: `${lineLabel} ${row.line}: thiếu ${what}.` });
      continue;
    }

    // Ghép hai mã bằng ký tự \u0000 (không bao giờ có trong mã) để làm khóa duy nhất cho cặp.
    const key = `${studentId}\u0000${courseId}`;
    if (firstSeen.has(key)) {
      errors.push({
        line: row.line,
        message:
          `${lineLabel} ${row.line}: sinh viên ${studentId} đăng ký môn ${courseId} ` +
          `trùng với ${lineLabel.toLowerCase()} ${firstSeen.get(key)}.`,
      });
      continue;
    }
    firstSeen.set(key, row.line);
    registrations.push({ studentId, courseId });
  }

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS).map((e) => e.message);
    if (errors.length > MAX_ERRORS) shown.push(`... và ${errors.length - MAX_ERRORS} lỗi khác.`);
    throw new DataError(`Dữ liệu có ${errors.length} lỗi:\n${shown.join('\n')}`, errors);
  }
  if (registrations.length === 0) {
    throw new DataError('Không có dòng đăng ký nào. Hãy nhập ít nhất một dòng mã sinh viên, mã môn.');
  }
  return registrations;
}

/**
 * Chuyển một bảng hai chiều đọc từ sheet Excel (dòng đầu là tiêu đề) thành danh sách đăng ký.
 * @param {unknown[][]} table
 * @param {number[]} lineNumbers  Số dòng thật trong file của từng phần tử table
 * @returns {Registration[]}
 */
function tableToRegistrations(table, lineNumbers) {
  // Bỏ các dòng trống ở đầu để tìm dòng tiêu đề.
  let start = 0;
  while (start < table.length && table[start].every((cell) => String(cell ?? '').trim() === '')) {
    start++;
  }
  if (start >= table.length) {
    throw new DataError('Sheet đầu tiên không có dữ liệu.');
  }
  const { studentCol, courseCol } = findColumns(table[start]);
  const rows = [];
  for (let i = start + 1; i < table.length; i++) {
    rows.push({
      line: lineNumbers[i],
      studentId: table[i][studentCol],
      courseId: table[i][courseCol],
    });
  }
  return checkRows(rows, 'Dòng');
}

/**
 * Đọc file Excel .xlsx: chỉ sheet đầu tiên, mọi ô đọc thành chuỗi, bỏ dòng trống.
 * @param {ArrayBuffer | Uint8Array} arrayBuffer
 * @returns {Registration[]}
 * @throws {DataError}
 */
export function parseRegistrationsExcel(arrayBuffer) {
  let workbook;
  try {
    // cellText giữ chuỗi đã định dạng; ô kiểu chuỗi như "0123" giữ nguyên số 0 đầu.
    workbook = XLSX.read(arrayBuffer, { type: 'array', cellText: true, cellDates: false });
  } catch {
    throw new DataError('Không đọc được file Excel. Hãy kiểm tra file có đúng định dạng .xlsx không.');
  }
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new DataError('File Excel không có sheet nào.');
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) {
    throw new DataError(`Sheet đầu tiên "${workbook.SheetNames[0]}" không có dữ liệu.`);
  }
  // header: 1 → mảng hai chiều; raw: false → lấy chữ đã định dạng (chuỗi);
  // blankrows: true → giữ dòng trống để số dòng khớp với Excel.
  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
  const firstRow = XLSX.utils.decode_range(sheet['!ref']).s.r; // chỉ số 0 của dòng đầu vùng dữ liệu
  const lineNumbers = table.map((_, i) => firstRow + i + 1);
  return tableToRegistrations(
    table.map((row) => row.map((cell) => String(cell ?? ''))),
    lineNumbers,
  );
}

/**
 * Kiểm tra và chuẩn hóa dữ liệu người dùng nhập trực tiếp trên bảng của giao diện.
 * @param {{studentId?: unknown, courseId?: unknown}[]} rows  Các dòng theo thứ tự trên bảng
 * @returns {Registration[]}
 * @throws {DataError} kèm số dòng (đếm từ 1) nếu thiếu mã hoặc đăng ký trùng
 */
export function validateRegistrations(rows) {
  if (!Array.isArray(rows)) throw new DataError('Dữ liệu nhập phải là một danh sách dòng.');
  return checkRows(
    rows.map((r, i) => ({ line: i + 1, studentId: r?.studentId, courseId: r?.courseId })),
    'Dòng',
  );
}

/**
 * Tóm tắt dữ liệu để giao diện hiển thị sau khi nhập.
 * @param {Registration[]} registrations
 * @returns {{students: number, courses: number, rows: number}}
 */
export function summarizeRegistrations(registrations) {
  const students = new Set();
  const courses = new Set();
  for (const r of registrations) {
    students.add(r.studentId);
    courses.add(r.courseId);
  }
  return { students: students.size, courses: courses.size, rows: registrations.length };
}
