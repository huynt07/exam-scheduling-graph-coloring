/**
 * constraints.js — Cấu hình lịch thi và các ràng buộc mở rộng (người D).
 *
 * File trong core/: không dùng document, window.
 */
import { DataError } from './dataLoader.js';

/**
 * @typedef {Object} Room
 * @property {string} id         mã phòng (viết hoa)
 * @property {number} capacity   sức chứa
 *
 * @typedef {Object} ScheduleConfig
 * @property {string} startDate                    ngày bắt đầu, dạng YYYY-MM-DD
 * @property {number} slotsPerDay                  số ca mỗi ngày
 * @property {string[]} slotTimes                  giờ bắt đầu từng ca (độ dài = slotsPerDay)
 * @property {Room[]} rooms                        danh sách phòng
 * @property {boolean} skipWeekends                bỏ thứ Bảy, Chủ nhật
 * @property {string[]} holidays                   các ngày nghỉ thêm, dạng YYYY-MM-DD
 * @property {number|null} maxExamsPerStudentPerDay  số môn tối đa của một sinh viên trong một ngày (null = không giới hạn)
 * @property {boolean} optimizeOrder               sắp lại thứ tự các ca để giảm số sinh viên vi phạm ràng buộc trên
 */

/** Giá trị mặc định. Cố ý để trống ngày bắt đầu và phòng: người dùng phải tự nhập. */
export const DEFAULT_CONFIG = Object.freeze({
  startDate: '',
  slotsPerDay: 3,
  slotTimes: ['07:30', '09:30', '13:30'],
  rooms: [],
  skipWeekends: true,
  holidays: [],
  maxExamsPerStudentPerDay: 2,
  optimizeOrder: true,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SCAN_DAYS = 3660; // chặn vòng lặp vô hạn khi mọi ngày đều là ngày nghỉ

/**
 * Đổi chuỗi YYYY-MM-DD thành Date (UTC, tránh lệch múi giờ). Trả null nếu không phải ngày có thật.
 * @param {string} s
 * @returns {Date|null}
 */
function parseIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

/**
 * Kiểm tra và chuẩn hóa config. Trường thiếu lấy từ DEFAULT_CONFIG.
 * @param {Partial<ScheduleConfig>} [raw]
 * @returns {ScheduleConfig}
 * @throws {DataError} nêu rõ trường sai
 */
export function validateConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG, ...raw };

  if (!parseIsoDate(c.startDate)) {
    throw new DataError('Ngày bắt đầu phải có dạng YYYY-MM-DD và là ngày có thật.');
  }
  if (!Number.isInteger(c.slotsPerDay) || c.slotsPerDay < 1) {
    throw new DataError('Số ca mỗi ngày phải là số nguyên ≥ 1.');
  }
  if (!Array.isArray(c.slotTimes) || c.slotTimes.length !== c.slotsPerDay) {
    throw new DataError(`Cần đúng ${c.slotsPerDay} giờ ca thi, hiện có ${c.slotTimes?.length ?? 0}.`);
  }
  if (!Array.isArray(c.rooms) || c.rooms.length === 0) {
    throw new DataError('Cần ít nhất một phòng thi.');
  }

  const seen = new Set();
  const rooms = c.rooms.map((r, i) => {
    const id = String(r?.id ?? '').trim().toUpperCase();
    const capacity = Number(r?.capacity);
    if (id === '') throw new DataError(`Phòng thứ ${i + 1} thiếu mã phòng.`);
    if (seen.has(id)) throw new DataError(`Mã phòng ${id} bị trùng.`);
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new DataError(`Sức chứa phòng ${id} phải là số nguyên ≥ 1.`);
    }
    seen.add(id);
    return { id, capacity };
  });

  const holidays = (c.holidays ?? []).map((h) => {
    if (!parseIsoDate(h)) throw new DataError(`Ngày nghỉ "${h}" không hợp lệ (cần YYYY-MM-DD).`);
    return h;
  });

  const maxPerDay = c.maxExamsPerStudentPerDay;
  if (maxPerDay !== null && (!Number.isInteger(maxPerDay) || maxPerDay < 1)) {
    throw new DataError('Số môn tối đa mỗi sinh viên mỗi ngày phải là số nguyên ≥ 1 (hoặc để trống).');
  }

  return {
    startDate: c.startDate,
    slotsPerDay: c.slotsPerDay,
    slotTimes: c.slotTimes.map(String),
    rooms,
    skipWeekends: Boolean(c.skipWeekends),
    holidays,
    maxExamsPerStudentPerDay: maxPerDay,
    optimizeOrder: Boolean(c.optimizeOrder),
  };
}

/** Lưu config thành chuỗi JSON. */
export function configToJson(config) {
  return JSON.stringify(config, null, 2);
}

/**
 * Đọc config từ chuỗi JSON (rồi kiểm tra như validateConfig).
 * @param {string} text
 * @returns {ScheduleConfig}
 * @throws {DataError}
 */
export function configFromJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataError('File cấu hình không phải JSON hợp lệ.');
  }
  return validateConfig(parsed);
}

/**
 * Ngày thi thứ n (n = 0, 1, 2...) tính từ startDate, bỏ qua cuối tuần (nếu bật) và ngày nghỉ.
 * Bỏ qua ngày nghỉ ở đúng một chỗ này để scheduler không phải lo.
 * @param {ScheduleConfig} config  config đã qua validateConfig
 * @param {number} n
 * @returns {string} YYYY-MM-DD
 */
export function nthExamDay(config, n) {
  const off = new Set(config.holidays);
  const d = parseIsoDate(config.startDate);
  let count = -1;
  for (let scanned = 0; scanned < MAX_SCAN_DAYS; scanned++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay(); // 0 = Chủ nhật, 6 = thứ Bảy
    const isOff = off.has(iso) || (config.skipWeekends && (dow === 0 || dow === 6));
    if (!isOff && ++count === n) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new DataError('Không tìm đủ ngày thi: hầu hết các ngày đều là ngày nghỉ. Hãy kiểm tra lại cấu hình.');
}

/**
 * Đếm sinh viên có nhiều hơn maxPerDay môn trong cùng một ngày.
 * @param {{course: string, date: string}[]} schedule
 * @param {{studentId: string, courseId: string}[]} registrations
 * @param {number|null} maxPerDay  null = không giới hạn
 * @returns {{studentId: string, date: string, count: number}[]}
 */
export function findDailyOverload(schedule, registrations, maxPerDay) {
  if (maxPerDay === null || maxPerDay === undefined) return [];
  const dateOf = new Map(schedule.map((e) => [e.course, e.date]));
  /** @type {Map<string, Map<string, number>>} */
  const perStudent = new Map();
  for (const { studentId, courseId } of registrations) {
    const date = dateOf.get(courseId);
    if (date === undefined) continue;
    if (!perStudent.has(studentId)) perStudent.set(studentId, new Map());
    const days = perStudent.get(studentId);
    days.set(date, (days.get(date) ?? 0) + 1);
  }
  const result = [];
  for (const [studentId, days] of perStudent) {
    for (const [date, count] of days) if (count > maxPerDay) result.push({ studentId, date, count });
  }
  return result.sort((a, b) => (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : a.date < b.date ? -1 : 1));
}

/**
 * Sắp lại thứ tự các nhóm màu (mỗi nhóm = một ca thi) để giảm số lượt "sinh viên vượt giới hạn môn mỗi ngày".
 * Hoán đổi vị trí của hai nhóm không làm hai môn kề nhau rơi vào cùng ca, nên lịch vẫn hợp lệ.
 * Leo đồi: duyệt mọi cặp theo thứ tự cố định, nhận hoán đổi nếu chi phí giảm hẳn (kết quả luôn xác định).
 * Chi phí ước lượng với vị trí = chỉ số nhóm (chưa tính ca phụ).
 *
 * @param {string[][]} groups  groups[i] = các môn của ca thứ i
 * @param {{studentId: string, courseId: string}[]} registrations
 * @param {ScheduleConfig} config
 * @returns {string[][]} thứ tự mới của các nhóm
 */
export function orderGroups(groups, registrations, config) {
  const maxPerDay = config.maxExamsPerStudentPerDay;
  if (!config.optimizeOrder || maxPerDay === null || groups.length < 2) return groups;

  const groupOf = new Map();
  groups.forEach((g, i) => g.forEach((course) => groupOf.set(course, i)));

  // Mỗi sinh viên → danh sách chỉ số nhóm của các môn họ thi.
  /** @type {Map<string, number[]>} */
  const byStudent = new Map();
  for (const { studentId, courseId } of registrations) {
    if (!groupOf.has(courseId)) continue;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(groupOf.get(courseId));
  }
  const lists = [...byStudent.values()].filter((l) => l.length > maxPerDay); // chỉ những SV có thể vi phạm

  const k = groups.length;
  const perDay = config.slotsPerDay;
  const position = Array.from({ length: k }, (_, i) => i); // position[g] = vị trí hiện tại của nhóm g

  const cost = () => {
    let total = 0;
    for (const list of lists) {
      const counts = new Map();
      for (const g of list) {
        const day = Math.floor(position[g] / perDay);
        const n = (counts.get(day) ?? 0) + 1;
        counts.set(day, n);
        if (n > maxPerDay) total++;
      }
    }
    return total;
  };

  let best = cost();
  for (let pass = 0; pass < 20 && best > 0; pass++) {
    let improved = false;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        [position[a], position[b]] = [position[b], position[a]];
        const c = cost();
        if (c < best) {
          best = c;
          improved = true;
        } else {
          [position[a], position[b]] = [position[b], position[a]];
        }
      }
    }
    if (!improved) break;
  }

  const ordered = new Array(k);
  groups.forEach((g, i) => {
    ordered[position[i]] = g;
  });
  return ordered;
}