/**
 * scheduler.js — Biến kết quả tô màu thành lịch thi (ngày, ca, phòng) (người D).
 *
 * Quy ước: mỗi màu là một ca thi; các môn cùng màu thi cùng lúc nên không có sinh viên chung.
 * Ca được đánh số liên tục; ca thứ p rơi vào ngày floor(p / slotsPerDay), ca (slot) p % slotsPerDay (đếm từ 0).
 *
 * File trong core/: không dùng document, window.
 */
import { DataError } from './dataLoader.js';
import { compareIds } from './graphBuilder.js';
import { nthExamDay, orderGroups, findDailyOverload, validateConfig } from './constraints.js';

/** @typedef {{course: string, date: string, slot: number, time: string, rooms: string[]}} ScheduleEntry */

/**
 * Đếm số sinh viên (không trùng) của từng môn.
 * @param {{studentId: string, courseId: string}[]} registrations
 * @returns {Map<string, number>}
 */
export function countStudentsPerCourse(registrations) {
  /** @type {Map<string, Set<string>>} */
  const sets = new Map();
  for (const { studentId, courseId } of registrations) {
    if (!sets.has(courseId)) sets.set(courseId, new Set());
    sets.get(courseId).add(studentId);
  }
  return new Map([...sets].map(([course, s]) => [course, s.size]));
}

/**
 * Chọn phòng cho một môn từ các phòng còn trống trong ca.
 * - Có phòng vừa một mình: lấy phòng nhỏ nhất đủ chỗ (đỡ phí phòng lớn).
 * - Không có: lấy dần các phòng lớn nhất, phòng cuối là phòng nhỏ nhất vẫn đủ phần còn lại.
 * Trả null nếu tổng sức chứa các phòng trống không đủ.
 *
 * @param {number} size
 * @param {{id: string, capacity: number}[]} freeRooms  đã sắp sức chứa tăng dần, cùng sức chứa thì theo mã
 * @returns {{id: string, capacity: number}[] | null}
 */
export function pickRooms(size, freeRooms) {
  const single = freeRooms.find((r) => r.capacity >= size);
  if (single) return [single];

  const chosen = [];
  const pool = [...freeRooms]; // tăng dần
  let remaining = size;
  while (remaining > 0) {
    if (pool.length === 0) return null;
    const fit = pool.find((r) => r.capacity >= remaining);
    const room = fit ?? pool[pool.length - 1]; // không phòng nào đủ phần còn lại thì lấy phòng lớn nhất
    pool.splice(pool.indexOf(room), 1);
    chosen.push(room);
    remaining -= room.capacity;
  }
  return chosen;
}

/**
 * Xếp lịch thi từ kết quả tô màu.
 *
 * 1. Gom môn theo màu, mỗi màu là một ca (tùy chọn: sắp lại thứ tự ca để giảm vi phạm "quá N môn mỗi ngày").
 * 2. Trong mỗi ca, xếp môn đông trước; chia phòng theo sức chứa, môn đông hơn một phòng thì nhiều phòng.
 * 3. Môn nào không đủ phòng trong ca được tách sang ca phụ chèn ngay sau ca đó (ca sau đẩy lùi một bậc),
 *    ghi vào warnings. Ca phụ chỉ chứa môn cùng màu nên không gây xung đột sinh viên.
 *
 * @param {Map<string, number>} colors  mã môn → màu (từ 0)
 * @param {{studentId: string, courseId: string}[]} registrations
 * @param {import('./constraints.js').ScheduleConfig} config
 * @returns {{schedule: ScheduleEntry[], warnings: string[]}}
 * @throws {DataError} thiếu màu cho một môn, hoặc có môn đông hơn tổng sức chứa mọi phòng
 */
export function buildSchedule(colors, registrations, config) {
  const cfg = validateConfig(config);
  const sizes = countStudentsPerCourse(registrations);

  // Kiểm tra đầu vào.
  const missing = [...sizes.keys()].filter((c) => !colors.has(c)).sort(compareIds);
  if (missing.length > 0) throw new DataError(`Các môn chưa được tô màu: ${missing.join(', ')}.`);

  const totalCapacity = cfg.rooms.reduce((sum, r) => sum + r.capacity, 0);
  const tooBig = [...sizes].filter(([, n]) => n > totalCapacity).sort((a, b) => compareIds(a[0], b[0]));
  if (tooBig.length > 0) {
    const list = tooBig.map(([c, n]) => `${c} (${n} sinh viên)`).join(', ');
    throw new DataError(`Môn ${list} đông hơn tổng sức chứa ${totalCapacity} của mọi phòng; hãy thêm phòng hoặc tăng sức chứa.`);
  }

  // Bước 1: gom môn theo màu, màu tăng dần, môn trong nhóm theo mã.
  /** @type {Map<number, string[]>} */
  const byColor = new Map();
  for (const course of sizes.keys()) {
    const c = colors.get(course);
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push(course);
  }
  let groups = [...byColor.keys()].sort((a, b) => a - b).map((c) => byColor.get(c).sort(compareIds));
  groups = orderGroups(groups, registrations, cfg);

  // Bước 2–3: xếp phòng, tách ca phụ khi thiếu phòng.
  const roomsAsc = [...cfg.rooms].sort((a, b) => a.capacity - b.capacity || compareIds(a.id, b.id));
  const warnings = [];
  /** @type {{course: string, rooms: string[], position: number}[]} */
  const placed = [];
  let position = 0; // chỉ số ca liên tục, tính cả ca phụ

  const labelOf = (p) => `ngày ${nthExamDay(cfg, Math.floor(p / cfg.slotsPerDay))} ca ${(p % cfg.slotsPerDay) + 1}`;

  for (const group of groups) {
    const mainPosition = position;
    let pending = [...group].sort((a, b) => sizes.get(b) - sizes.get(a) || compareIds(a, b)); // đông trước
    while (pending.length > 0) {
      let free = roomsAsc;
      const deferred = [];
      for (const course of pending) {
        const rooms = pickRooms(sizes.get(course), free);
        if (rooms === null) {
          deferred.push(course);
          continue;
        }
        const used = new Set(rooms.map((r) => r.id));
        free = free.filter((r) => !used.has(r.id));
        placed.push({ course, rooms: rooms.map((r) => r.id).sort(compareIds), position });
        if (position > mainPosition) {
          // Môn này không đủ phòng ở ca chính, chỉ ghi cảnh báo một lần, ở nơi nó thực sự được xếp.
          warnings.push(`Môn ${course} thiếu phòng ở ${labelOf(mainPosition)}, đã chuyển sang ca phụ ${labelOf(position)}.`);
        }
      }
      pending = deferred;
      position++;
    }
  }

  // Chuyển chỉ số ca thành ngày, ca, giờ.
  /** @type {ScheduleEntry[]} */
  const schedule = placed.map(({ course, rooms, position: p }) => {
    const slot = p % cfg.slotsPerDay;
    return { course, date: nthExamDay(cfg, Math.floor(p / cfg.slotsPerDay)), slot, time: cfg.slotTimes[slot], rooms };
  });
  schedule.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot || compareIds(a.course, b.course)));

  // Cảnh báo ràng buộc mở rộng còn vi phạm.
  const overload = findDailyOverload(schedule, registrations, cfg.maxExamsPerStudentPerDay);
  if (overload.length > 0) {
    const students = new Set(overload.map((o) => o.studentId)).size;
    warnings.push(
      `Còn ${students} sinh viên có hơn ${cfg.maxExamsPerStudentPerDay} môn trong cùng một ngày (ví dụ ${overload[0].studentId} ngày ${overload[0].date}: ${overload[0].count} môn).`,
    );
  }

  return { schedule, warnings };
}