/**
 * randomData.js — Sinh dữ liệu đăng ký có seed cho kiểm thử và thực nghiệm (người C).
 *
 * CHỈ dùng nội bộ trong tests/ và script thực nghiệm: không được import từ src/,
 * không nạp vào ứng dụng, không đưa vào Release.
 */

/**
 * Bộ sinh số giả ngẫu nhiên mulberry32: cùng seed luôn cho cùng dãy số trong [0, 1).
 * Math.random không đặt được seed nên không dùng được cho test lặp lại.
 * @param {number} seed  số nguyên
 * @returns {() => number}
 */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sinh danh sách đăng ký: mỗi sinh viên chọn ngẫu nhiên một số môn khác nhau.
 *
 * @param {number} seed
 * @param {{students: number, courses: number, coursesPerStudent: number | [number, number]}} options
 *        coursesPerStudent: số môn mỗi sinh viên, hoặc khoảng [min, max]
 * @returns {{studentId: string, courseId: string}[]}
 */
export function generateRegistrations(seed, options) {
  const { students, courses } = options;
  const [minK, maxK] = Array.isArray(options.coursesPerStudent)
    ? options.coursesPerStudent
    : [options.coursesPerStudent, options.coursesPerStudent];
  if (!(students > 0 && courses > 0 && minK >= 1 && maxK >= minK && maxK <= courses)) {
    throw new Error('Tham số sinh dữ liệu không hợp lệ.');
  }
  const rand = createRandom(seed);
  const width = String(courses).length;
  const courseIds = Array.from({ length: courses }, (_, i) => `M${String(i + 1).padStart(width, '0')}`);
  const sWidth = String(students).length;
  const registrations = [];

  for (let s = 1; s <= students; s++) {
    const studentId = `SV${String(s).padStart(sWidth, '0')}`;
    const k = minK + Math.floor(rand() * (maxK - minK + 1));
    // Xáo trộn một phần (Fisher–Yates) để lấy k môn khác nhau.
    const pool = [...courseIds];
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rand() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      registrations.push({ studentId, courseId: pool[i] });
    }
  }
  return registrations;
}
