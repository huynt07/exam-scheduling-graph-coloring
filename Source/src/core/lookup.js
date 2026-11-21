/**
 * lookup.js — Tra cứu lịch thi theo mã sinh viên (người C).
 *
 * File trong core/: không dùng document, window.
 */
import { DataError, normalizeCode } from './dataLoader.js';

/** @typedef {{course: string, date: string, slot: number, time?: string, rooms: string[]}} ScheduleEntry */

/**
 * Trả về các môn thi của một sinh viên, sắp theo ngày rồi ca.
 * Mã nhập được chuẩn hóa giống lúc đọc dữ liệu (cắt khoảng trắng, viết hoa).
 *
 * @param {ScheduleEntry[]} schedule
 * @param {{studentId: string, courseId: string}[]} registrations
 * @param {string} studentId
 * @returns {ScheduleEntry[]}
 * @throws {DataError} khi chưa nhập mã, mã không có trong dữ liệu, hoặc môn chưa có trong lịch
 */
export function lookupStudent(schedule, registrations, studentId) {
  const id = normalizeCode(studentId);
  if (id === '') throw new DataError('Hãy nhập mã sinh viên cần tra cứu.');

  const courses = registrations.filter((r) => r.studentId === id).map((r) => r.courseId);
  if (courses.length === 0) {
    throw new DataError(`Không tìm thấy sinh viên có mã ${id} trong dữ liệu đăng ký.`);
  }

  const entryOf = new Map(schedule.map((e) => [e.course, e]));
  const missing = courses.filter((c) => !entryOf.has(c));
  if (missing.length > 0) {
    throw new DataError(`Các môn ${missing.join(', ')} của sinh viên ${id} chưa có trong lịch thi.`);
  }

  return courses
    .map((c) => entryOf.get(c))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot));
}
