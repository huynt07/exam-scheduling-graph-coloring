/**
 * validator.js — Kiểm tra tính hợp lệ của phép tô màu và của lịch thi (người B).
 * Cả nhóm dùng các hàm này để "chấm" kết quả của mọi thuật toán.
 *
 * File trong core/: không dùng document, window.
 */
import { compareIds } from './graphBuilder.js';

/** @typedef {Map<string, Set<string>>} Graph */
/** @typedef {{course: string, date: string, slot: number, rooms: string[], students?: number}} ScheduleEntry */

/**
 * Kiểm tra phép tô màu: mọi đỉnh đều có màu và mọi cạnh có hai đầu khác màu.
 * Mỗi cạnh chỉ xét một lần (u < v). Độ phức tạp O(V + E).
 *
 * @param {Graph} graph
 * @param {Map<string, number>} colors
 * @returns {{valid: boolean, conflicts: [string, string][], uncolored: string[]}}
 *          conflicts: các cặp môn kề nhau nhưng cùng màu; uncolored: các môn chưa có màu
 */
export function isValidColoring(graph, colors) {
  const conflicts = [];
  const uncolored = [];
  for (const [u, neighbors] of graph) {
    if (!colors.has(u)) {
      uncolored.push(u);
      continue;
    }
    for (const v of neighbors) {
      if (compareIds(u, v) < 0 && colors.has(v) && colors.get(u) === colors.get(v)) {
        conflicts.push([u, v]);
      }
    }
  }
  return { valid: conflicts.length === 0 && uncolored.length === 0, conflicts, uncolored };
}

/**
 * Số màu đã dùng (số giá trị màu khác nhau).
 * @param {Map<string, number>} colors
 * @returns {number}
 */
export function countColors(colors) {
  return new Set(colors.values()).size;
}

/**
 * Kiểm tra lịch thi theo từng sinh viên: không sinh viên nào có hai môn cùng ngày và ca,
 * và môn nào sinh viên đăng ký cũng có trong lịch. Độ phức tạp O(R + số môn).
 *
 * @param {ScheduleEntry[]} schedule
 * @param {{studentId: string, courseId: string}[]} registrations
 * @returns {{valid: boolean,
 *            conflicts: {studentId: string, date: string, slot: number, courses: [string, string]}[],
 *            missing: string[]}}
 */
export function checkScheduleByStudent(schedule, registrations) {
  const entryOf = new Map(schedule.map((e) => [e.course, e]));
  const conflicts = [];
  const missing = new Set();
  // Mã SV → Map("ngày|ca" → môn đã thi ở ca đó)
  const seen = new Map();

  for (const { studentId, courseId } of registrations) {
    const entry = entryOf.get(courseId);
    if (!entry) {
      missing.add(courseId);
      continue;
    }
    if (!seen.has(studentId)) seen.set(studentId, new Map());
    const slots = seen.get(studentId);
    const key = `${entry.date}|${entry.slot}`;
    if (slots.has(key)) {
      conflicts.push({
        studentId,
        date: entry.date,
        slot: entry.slot,
        courses: [slots.get(key), courseId],
      });
    } else {
      slots.set(key, courseId);
    }
  }
  return {
    valid: conflicts.length === 0 && missing.size === 0,
    conflicts,
    missing: [...missing].sort(compareIds),
  };
}

/**
 * Kiểm tra phòng thi: một phòng không bị dùng cho hai môn trong cùng ngày và ca,
 * tổng sức chứa các phòng của một môn đủ cho số sinh viên của môn đó.
 *
 * @param {ScheduleEntry[]} schedule
 * @param {{id: string, capacity: number}[]} rooms
 * @returns {{valid: boolean, problems: string[]}}
 */
export function checkRooms(schedule, rooms) {
  const capacity = new Map(rooms.map((r) => [r.id, r.capacity]));
  const used = new Map(); // "ngày|ca|phòng" → môn
  const problems = [];
  for (const e of schedule) {
    let total = 0;
    for (const room of e.rooms) {
      if (!capacity.has(room)) problems.push(`Môn ${e.course}: phòng ${room} không có trong cấu hình.`);
      total += capacity.get(room) ?? 0;
      const key = `${e.date}|${e.slot}|${room}`;
      if (used.has(key)) {
        problems.push(`Phòng ${room} bị xếp cho cả ${used.get(key)} và ${e.course} (ngày ${e.date}, ca ${e.slot}).`);
      } else {
        used.set(key, e.course);
      }
    }
    if (e.students !== undefined && total < e.students) {
      problems.push(`Môn ${e.course}: ${e.students} sinh viên nhưng phòng chỉ chứa ${total}.`);
    }
  }
  return { valid: problems.length === 0, problems };
}
