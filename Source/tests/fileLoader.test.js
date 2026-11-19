import { describe, it, expect } from 'vitest';
import { loadRegistrations } from '../src/ui/fileLoader.js';
import { fixtureBytes, makeXlsx } from './helpers/fixtures.js';

// Node.js 22 có sẵn lớp File giống trình duyệt nên kiểm thử được fileLoader ngoài trình duyệt.
describe('loadRegistrations', () => {
  it('đọc file .xlsx (đuôi viết hoa cũng được)', async () => {
    expect(await loadRegistrations(new File([fixtureBytes('small.xlsx')], 'DangKy.XLSX'))).toHaveLength(19);
    const bytes = makeXlsx([['MSSV', 'Mã môn'], ['0123', 'IT001']]);
    expect(await loadRegistrations(new File([bytes], 'dangky.xlsx'))).toEqual([{ studentId: '0123', courseId: 'IT001' }]);
  });

  it('từ chối .csv, .xls kèm hướng dẫn lưu lại bằng .xlsx', async () => {
    await expect(loadRegistrations(new File(['a,b'], 'data.csv'))).rejects.toThrow(/Chỉ nhận file Excel .xlsx.*Save As/);
    await expect(loadRegistrations(new File(['x'], 'data.xls'))).rejects.toThrow(/Save As/);
  });

  it('từ chối đuôi khác, file rỗng, chưa chọn file', async () => {
    await expect(loadRegistrations(new File(['x'], 'data.txt'))).rejects.toThrow(/Chỉ nhận file Excel .xlsx/);
    await expect(loadRegistrations(new File([], 'a.xlsx'))).rejects.toThrow(/rỗng/);
    await expect(loadRegistrations(undefined)).rejects.toThrow(/Chưa chọn file/);
  });
});
