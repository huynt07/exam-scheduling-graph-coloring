import { describe, it, expect } from 'vitest';
import {
  DataError,
  normalizeHeader,
  normalizeCode,
  parseRegistrationsExcel,
  validateRegistrations,
  summarizeRegistrations,
} from '../src/core/dataLoader.js';
import { loadFixture, makeXlsx } from './helpers/fixtures.js';

const parse = (aoa) => parseRegistrationsExcel(makeXlsx(aoa));

describe('chuẩn hóa', () => {
  it('nhận tên cột tiếng Việt, không phân biệt hoa thường, bỏ khoảng trắng', () => {
    expect(normalizeHeader(' Mã SV ')).toBe('masv');
    expect(normalizeHeader('MSSV')).toBe('mssv');
    expect(normalizeHeader('Mã môn')).toBe('mamon');
    expect(normalizeHeader('StudentId')).toBe('studentid');
  });

  it('chuẩn hóa mã: cắt khoảng trắng, viết hoa, giữ số 0 đầu', () => {
    expect(normalizeCode('  it001 ')).toBe('IT001');
    expect(normalizeCode('0123')).toBe('0123');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('parseRegistrationsExcel', () => {
  it('đọc bộ nhỏ', () => {
    const regs = loadFixture('small.xlsx');
    expect(regs).toHaveLength(19);
    expect(regs[0]).toEqual({ studentId: 'SV01', courseId: 'CTDL' });
  });

  it('đọc file kiểu Việt Nam: cột MSSV/Mã môn, khoảng trắng thừa, chữ thường, dòng trống, số 0 đầu', () => {
    expect(loadFixture('vietnamese.xlsx')).toEqual([
      { studentId: '0123', courseId: 'IT001' },
      { studentId: '0123', courseId: 'IT002' },
      { studentId: '0456', courseId: 'IT001' },
    ]);
  });

  it('giữ tiếng Việt có dấu trong mã', () => {
    expect(parse([['MSSV', 'Mã môn'], ['SV01', 'Giải tích']])).toEqual([{ studentId: 'SV01', courseId: 'GIẢI TÍCH' }]);
  });

  it('ô kiểu số vẫn đọc thành chuỗi; bỏ qua cột thừa', () => {
    expect(parse([['hoTen', 'Mã SV', 'Mã môn'], ['An', 123, 'IT002']])).toEqual([{ studentId: '123', courseId: 'IT002' }]);
  });

  it('bỏ các dòng trống phía trên tiêu đề', () => {
    expect(parse([[], [], ['studentId', 'courseId'], ['SV01', 'A']])).toEqual([{ studentId: 'SV01', courseId: 'A' }]);
  });

  it('chỉ đọc sheet đầu tiên', () => {
    const data = makeXlsx({ DauTien: [['studentId', 'courseId'], ['SV01', 'A']], ThuHai: [['studentId', 'courseId'], ['SV99', 'Z']] });
    expect(parseRegistrationsExcel(data)).toEqual([{ studentId: 'SV01', courseId: 'A' }]);
  });

  it('báo lỗi thiếu cột', () => {
    expect(() => parse([['studentId', 'tenMon'], ['SV01', 'Toan']])).toThrow(/thiếu cột mã môn/);
  });

  it('báo lỗi ô trống kèm số dòng đúng như trong Excel', () => {
    expect(() => parse([['studentId', 'courseId'], ['SV01', 'CTDL'], [], ['SV02', '']])).toThrow(/Dòng 4: thiếu mã môn/);
  });

  it('báo lỗi đăng ký trùng, chỉ ra cả dòng đầu tiên', () => {
    try {
      parse([['studentId', 'courseId'], ['SV01', 'CTDL'], ['SV02', 'GT'], ['sv01 ', ' ctdl']]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataError);
      expect(e.message).toMatch(/Dòng 4: .*SV01.*CTDL.*dòng 2/);
      expect(e.details).toHaveLength(1);
      expect(e.details[0].line).toBe(4);
    }
  });

  it('gom nhiều lỗi vào một thông báo', () => {
    try {
      parse([['studentId', 'courseId'], ['', 'CTDL'], ['SV02', ''], ['SV03', 'GT']]);
      expect.unreachable();
    } catch (e) {
      expect(e.details.map((d) => d.line)).toEqual([2, 3]);
      expect(e.message).toMatch(/có 2 lỗi/);
    }
  });

  it('báo lỗi sheet rỗng, chỉ có tiêu đề, file hỏng', () => {
    expect(() => parse([])).toThrow(/không có dữ liệu/);
    expect(() => parse([['studentId', 'courseId']])).toThrow(/Không có dòng đăng ký/);
    expect(() => parseRegistrationsExcel(new Uint8Array([1, 2, 3, 4]))).toThrow(DataError);
  });
});

describe('validateRegistrations (nhập trực tiếp)', () => {
  it('chuẩn hóa và bỏ dòng trống', () => {
    const regs = validateRegistrations([
      { studentId: ' sv01', courseId: 'ctdl ' },
      { studentId: '', courseId: '' },
      { studentId: 'SV02', courseId: 'GT' },
    ]);
    expect(regs).toEqual([
      { studentId: 'SV01', courseId: 'CTDL' },
      { studentId: 'SV02', courseId: 'GT' },
    ]);
  });

  it('báo số dòng trên bảng nhập khi thiếu mã hoặc trùng', () => {
    expect(() => validateRegistrations([{ studentId: 'SV01' }])).toThrow(/Dòng 1: thiếu mã môn/);
    expect(() =>
      validateRegistrations([
        { studentId: 'SV01', courseId: 'GT' },
        { studentId: 'SV01', courseId: 'GT' },
      ]),
    ).toThrow(/Dòng 2:.*trùng với dòng 1/);
  });

  it('hai cách nhập cho cùng kết quả', () => {
    const fromFile = loadFixture('small.xlsx');
    expect(validateRegistrations(fromFile.map((r) => ({ ...r })))).toEqual(fromFile);
  });

  it('từ chối đầu vào không phải mảng hoặc toàn dòng trống', () => {
    expect(() => validateRegistrations(null)).toThrow(DataError);
    expect(() => validateRegistrations([{ studentId: '', courseId: '' }])).toThrow(/Không có dòng/);
  });
});

describe('summarizeRegistrations', () => {
  it('đếm số sinh viên, số môn, số dòng của bộ nhỏ', () => {
    expect(summarizeRegistrations(loadFixture('small.xlsx'))).toEqual({ students: 10, courses: 8, rows: 19 });
  });
});
