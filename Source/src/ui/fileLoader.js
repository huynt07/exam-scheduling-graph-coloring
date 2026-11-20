/**
 * fileLoader.js — Đọc file Excel người dùng chọn trên giao diện (người A, nằm trong ui/).
 *
 * Đây là nơi DUY NHẤT dùng đối tượng File của trình duyệt. File chỉ đọc nội dung rồi giao
 * cho parseRegistrationsExcel trong core/dataLoader.js; mọi quy tắc kiểm tra nằm ở core/.
 * Chương trình chỉ nhận .xlsx để tránh lỗi chữ tiếng Việt do CSV lưu sai bảng mã.
 */
import { DataError, parseRegistrationsExcel } from '../core/dataLoader.js';

/** Giới hạn kích thước file để tránh treo trang khi chọn nhầm file rất lớn (20 MB). */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Lấy đuôi file viết thường, ví dụ "DangKy.XLSX" → "xlsx".
 * @param {string} name
 * @returns {string}
 */
function getExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Đọc file Excel người dùng chọn và trả về danh sách đăng ký đã kiểm tra.
 * @param {File} file  Đối tượng File lấy từ <input type="file">
 * @returns {Promise<import('../core/dataLoader.js').Registration[]>}
 * @throws {DataError} khi file không phải .xlsx, rỗng, quá lớn hoặc dữ liệu không hợp lệ
 */
export async function loadRegistrations(file) {
  if (!file) throw new DataError('Chưa chọn file.');
  const ext = getExtension(file.name);
  if (ext !== 'xlsx') {
    const hint = ext === 'csv' || ext === 'xls'
      ? ' Hãy mở file bằng Excel, chọn Save As → "Excel Workbook (*.xlsx)".'
      : '';
    throw new DataError(`File "${file.name}" không được hỗ trợ. Chỉ nhận file Excel .xlsx.${hint}`);
  }
  if (file.size === 0) throw new DataError(`File "${file.name}" rỗng.`);
  if (file.size > MAX_FILE_SIZE) {
    throw new DataError(`File "${file.name}" quá lớn (tối đa 20 MB).`);
  }
  const buffer = await file.arrayBuffer();
  return parseRegistrationsExcel(new Uint8Array(buffer));
}
