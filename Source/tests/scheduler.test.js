import { describe, it, expect } from 'vitest';
import { buildSchedule, pickRooms, countStudentsPerCourse } from '../src/core/scheduler.js';
import { buildGraph } from '../src/core/graphBuilder.js';
import { dsatur } from '../src/core/dsatur.js';
import { generateRegistrations } from './helpers/randomData.js';
import { DataError } from '../src/core/dataLoader.js';

const cfg = (extra = {}) => ({
  startDate: '2026-12-21', // thứ Hai
  slotsPerDay: 3,
  slotTimes: ['07:30', '09:30', '13:30'],
  rooms: [{ id: 'A1', capacity: 3 }, { id: 'A2', capacity: 5 }, { id: 'A3', capacity: 10 }],
  maxExamsPerStudentPerDay: null,
  ...extra,
});

/** Tạo đăng ký: mỗi môn có số sinh viên cho trước, sinh viên dùng riêng theo môn. */
const regsOf = (sizes) =>
  Object.entries(sizes).flatMap(([course, n]) =>
    Array.from({ length: n }, (_, i) => ({ studentId: `${course}-${i}`, courseId: course })),
  );

/** Kiểm tra theo sinh viên: không ai có hai môn cùng ngày và ca. */
function studentClashes(schedule, regs) {
  const at = new Map(schedule.map((e) => [e.course, `${e.date}#${e.slot}`]));
  const seen = new Map();
  const bad = new Set();
  for (const { studentId, courseId } of regs) {
    const key = `${studentId}|${at.get(courseId)}`;
    if (seen.has(key) && seen.get(key) !== courseId) bad.add(studentId);
    seen.set(key, courseId);
  }
  return [...bad];
}

describe('pickRooms', () => {
  const free = [{ id: 'A1', capacity: 3 }, { id: 'A2', capacity: 5 }, { id: 'A3', capacity: 10 }];
  it('lấy phòng nhỏ nhất đủ chỗ', () => {
    expect(pickRooms(4, free).map((r) => r.id)).toEqual(['A2']);
  });
  it('ghép nhiều phòng khi không phòng nào đủ', () => {
    const rooms = pickRooms(14, free);
    expect(rooms.reduce((s, r) => s + r.capacity, 0)).toBeGreaterThanOrEqual(14);
    expect(rooms.length).toBe(2);
  });
  it('trả null khi tổng sức chứa không đủ', () => {
    expect(pickRooms(19, free)).toBeNull();
  });
});

describe('buildSchedule', () => {
  it('màu thứ i → ngày = floor(i / số ca), ca = phần dư', () => {
    const colors = new Map([['A', 0], ['B', 1], ['C', 2], ['D', 3]]);
    const { schedule, warnings } = buildSchedule(colors, regsOf({ A: 2, B: 2, C: 2, D: 2 }), cfg());
    const of = (c) => schedule.find((e) => e.course === c);
    expect([of('A').date, of('A').slot, of('A').time]).toEqual(['2026-12-21', 0, '07:30']);
    expect([of('C').date, of('C').slot]).toEqual(['2026-12-21', 2]);
    expect([of('D').date, of('D').slot]).toEqual(['2026-12-22', 0]);
    expect(warnings).toEqual([]);
  });

  it('7 màu, 3 ca mỗi ngày thì kéo dài 3 ngày', () => {
    const colors = new Map(Array.from({ length: 7 }, (_, i) => [`M${i}`, i]));
    const regs = regsOf(Object.fromEntries([...colors.keys()].map((c) => [c, 1])));
    const { schedule } = buildSchedule(colors, regs, cfg());
    expect(new Set(schedule.map((e) => e.date)).size).toBe(3);
  });

  it('môn đông hơn một phòng được chia nhiều phòng', () => {
    const { schedule } = buildSchedule(new Map([['A', 0]]), regsOf({ A: 14 }), cfg());
    expect(schedule[0].rooms.length).toBe(2);
  });

  it('thiếu phòng thì chuyển sang ca phụ, đẩy lùi ca sau và ghi cảnh báo', () => {
    // Một ca có 3 môn đông 10, 10, 10 nhưng chỉ có 1 phòng sức chứa 10 → 2 môn phải sang ca phụ.
    const config = cfg({ rooms: [{ id: 'R1', capacity: 10 }] });
    const colors = new Map([['A', 0], ['B', 0], ['C', 0], ['D', 1]]);
    const { schedule, warnings } = buildSchedule(colors, regsOf({ A: 10, B: 10, C: 10, D: 5 }), config);
    const slotOf = (c) => {
      const e = schedule.find((x) => x.course === c);
      return `${e.date}#${e.slot}`;
    };
    expect(slotOf('A')).toBe('2026-12-21#0');
    expect(slotOf('B')).toBe('2026-12-21#1'); // ca phụ 1
    expect(slotOf('C')).toBe('2026-12-21#2'); // ca phụ 2
    expect(slotOf('D')).toBe('2026-12-22#0'); // bị đẩy lùi
    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain('Môn B');
    expect(warnings[0]).toContain('ca phụ');
  });

  it('không phòng nào bị hai môn dùng trong cùng ngày và ca', () => {
    const regs = regsOf({ A: 3, B: 5, C: 10, D: 7, E: 2 });
    const colors = new Map([['A', 0], ['B', 0], ['C', 0], ['D', 0], ['E', 0]]);
    const { schedule } = buildSchedule(colors, regs, cfg());
    const used = new Set();
    for (const e of schedule) {
      for (const r of e.rooms) {
        const key = `${e.date}#${e.slot}#${r}`;
        expect(used.has(key)).toBe(false);
        used.add(key);
      }
    }
  });

  it('báo lỗi khi một môn đông hơn tổng sức chứa mọi phòng', () => {
    expect(() => buildSchedule(new Map([['A', 0]]), regsOf({ A: 19 }), cfg())).toThrow(DataError);
  });

  it('báo lỗi khi thiếu màu của một môn', () => {
    expect(() => buildSchedule(new Map(), regsOf({ A: 1 }), cfg())).toThrow(/chưa được tô màu/);
  });

  it('cảnh báo khi còn sinh viên thi quá số môn mỗi ngày', () => {
    // 3 môn mà 1 sinh viên học cả ba, 3 ca mỗi ngày, giới hạn 2 môn/ngày, chỉ còn 1 ngày thi → vi phạm không tránh được.
    const regs = ['A', 'B', 'C'].map((c) => ({ studentId: 'S1', courseId: c }));
    const colors = new Map([['A', 0], ['B', 1], ['C', 2]]);
    const { warnings } = buildSchedule(colors, regs, cfg({ maxExamsPerStudentPerDay: 2 }));
    expect(warnings.some((w) => w.includes('S1'))).toBe(true);
  });

  it('sắp xếp kết quả theo ngày, ca, mã môn', () => {
    const colors = new Map([['B', 1], ['A', 0]]);
    const { schedule } = buildSchedule(colors, regsOf({ A: 1, B: 1 }), cfg());
    expect(schedule.map((e) => e.course)).toEqual(['A', 'B']);
  });
});

describe('Tích hợp: đăng ký → đồ thị → DSATUR → lịch thi', () => {
  it('không sinh viên nào trùng ca trên dữ liệu ngẫu nhiên có seed', () => {
    const regs = generateRegistrations(42, { students: 60, courses: 14, coursesPerStudent: 4 });
    const colors = dsatur(buildGraph(regs));
    const config = cfg({
      rooms: [{ id: 'P1', capacity: 15 }, { id: 'P2', capacity: 20 }, { id: 'P3', capacity: 30 }],
    });
    const { schedule } = buildSchedule(colors, regs, config);
    expect(schedule.length).toBe(countStudentsPerCourse(regs).size);
    expect(studentClashes(schedule, regs)).toEqual([]);
  });

  it('cùng dữ liệu cho cùng lịch', () => {
    const regs = generateRegistrations(7, { students: 40, courses: 10, coursesPerStudent: 3 });
    const colors = dsatur(buildGraph(regs));
    const config = cfg({ maxExamsPerStudentPerDay: 2 });
    expect(buildSchedule(colors, regs, config)).toEqual(buildSchedule(colors, regs, config));
  });
});