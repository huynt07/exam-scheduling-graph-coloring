/**
 * fixtures.js — Hàm dùng chung cho test: đọc fixture .xlsx và tạo file .xlsx trong bộ nhớ.
 * Chỉ dùng trong tests/.
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseRegistrationsExcel } from '../../src/core/dataLoader.js';

/** Đọc nguyên byte của một file trong tests/fixtures/. */
export const fixtureBytes = (name) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

/** Đọc file chữ (JSON) trong tests/fixtures/. */
export const fixtureText = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

/** Đọc một fixture .xlsx thành danh sách đăng ký đã kiểm tra. */
export const loadFixture = (name) => parseRegistrationsExcel(fixtureBytes(name));

/**
 * Tạo file .xlsx trong bộ nhớ từ mảng hai chiều (giả lập file người dùng tải lên).
 * @param {unknown[][] | Record<string, unknown[][]>} sheets  một bảng, hoặc {tênSheet: bảng}
 * @returns {Uint8Array}
 */
export function makeXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  const entries = Array.isArray(sheets) ? [['Sheet1', sheets]] : Object.entries(sheets);
  for (const [name, aoa] of entries) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
