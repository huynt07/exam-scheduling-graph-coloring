/**
 * exporter.js — Xuất lịch thi ra Excel (.xlsx) hoặc CSV (người D).
 *
 * File trong core/: không dùng document, window. Trả về Blob để giao diện (E) gắn vào nút tải xuống.
 */
import * as XLSX from 'xlsx';
import { DataError } from './dataLoader.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv;charset=utf-8';

/** Tiêu đề các cột trong file xuất. */
export const EXPORT_HEADERS = ['Môn thi', 'Ngày thi', 'Ca', 'Giờ', 'Phòng'];

/** Đổi YYYY-MM-DD thành dd/mm/yyyy cho người đọc Việt Nam. */
function displayDate(iso) {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

/**
 * Đổi lịch thi thành mảng dòng (mảng chuỗi) để xuất; nhiều phòng ghép bằng dấu phẩy.
 * Ca hiển thị đếm từ 1 (trong dữ liệu, slot đếm từ 0).
 * @param {{course: string, date: string, slot: number, time?: string, rooms: string[]}[]} schedule
 * @returns {string[][]}
 */
export function scheduleToRows(schedule) {
  return schedule.map((e) => [e.course, displayDate(e.date), String(e.slot + 1), e.time ?? '', e.rooms.join(', ')]);
}

/** Bao trường trong ngoặc kép khi chứa dấu phẩy, ngoặc kép hoặc xuống dòng (RFC 4180). */
function csvField(value) {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Tạo nội dung CSV (có BOM để Excel đọc đúng tiếng Việt UTF-8).
 * @param {string[][]} rows
 * @returns {string}
 */
export function rowsToCsv(rows) {
  const lines = [EXPORT_HEADERS, ...rows].map((r) => r.map(csvField).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Xuất lịch thi.
 * @param {{course: string, date: string, slot: number, time?: string, rooms: string[]}[]} schedule
 * @param {'xlsx'|'csv'} format
 * @returns {Promise<Blob>}
 * @throws {DataError} khi lịch rỗng hoặc định dạng không hỗ trợ
 */
export async function exportSchedule(schedule, format) {
  if (!Array.isArray(schedule) || schedule.length === 0) throw new DataError('Chưa có lịch thi để xuất.');
  const rows = scheduleToRows(schedule);

  if (format === 'csv') return new Blob([rowsToCsv(rows)], { type: CSV_MIME });

  if (format === 'xlsx') {
    const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows]); // mọi ô là chuỗi, Excel không tự đổi kiểu
    ws['!cols'] = EXPORT_HEADERS.map((h, i) => ({ wch: Math.max(h.length, ...rows.map((r) => r[i].length)) + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lịch thi');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new Blob([bytes], { type: XLSX_MIME });
  }

  throw new DataError(`Định dạng "${format}" chưa được hỗ trợ (chỉ xlsx hoặc csv).`);
}