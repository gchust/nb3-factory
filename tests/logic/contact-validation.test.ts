// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  isContactDepartment,
  normalizeContactInput,
} from '../../server/providers/contacts.ts';

describe('contact validation', () => {
  it('accepts a complete contact and trims its text fields', () => {
    const result = normalizeContactInput({
      name: '  陈晨  ',
      department: 'rd',
      phone: ' 13800138001 ',
      notes: '  后端开发  ',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: '陈晨',
        department: 'rd',
        phone: '13800138001',
        notes: '后端开发',
      },
    });
  });

  it('stores an absent phone and notes as null', () => {
    const result = normalizeContactInput({
      name: '张敏',
      department: 'rd',
    });

    expect(result).toEqual({
      ok: true,
      value: { name: '张敏', department: 'rd', phone: null, notes: null },
    });
  });

  it('stores a blank phone and notes as null', () => {
    const result = normalizeContactInput({
      name: '张敏',
      department: 'rd',
      phone: '   ',
      notes: '',
    });

    expect(result).toEqual({
      ok: true,
      value: { name: '张敏', department: 'rd', phone: null, notes: null },
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '', department: 'rd' }],
    ['whitespace only', { name: '   ', department: 'rd' }],
    ['not a string', { name: 42, department: 'rd' }],
  ])('rejects a %s name', (_label, raw) => {
    expect(normalizeContactInput(raw)).toEqual({
      ok: false,
      code: 'CONTACT_NAME_REQUIRED',
    });
  });

  it('rejects a name longer than 100 characters', () => {
    expect(
      normalizeContactInput({ name: '名'.repeat(101), department: 'rd' }),
    ).toEqual({ ok: false, code: 'CONTACT_NAME_TOO_LONG' });
  });

  it.each([undefined, null, 'engineering', 3])(
    'rejects the department %s',
    (department) => {
      expect(normalizeContactInput({ name: '李娜', department })).toEqual({
        ok: false,
        code: 'CONTACT_DEPARTMENT_INVALID',
      });
    },
  );

  it.each(['12345', '1380013800a', '138 0013 8001', '138001380012'])(
    'rejects the phone %s',
    (phone) => {
      expect(
        normalizeContactInput({ name: '王强', department: 'admin', phone }),
      ).toEqual({ ok: false, code: 'CONTACT_PHONE_INVALID' });
    },
  );

  it('rejects notes longer than 500 characters', () => {
    expect(
      normalizeContactInput({
        name: '王强',
        department: 'admin',
        notes: '备'.repeat(501),
      }),
    ).toEqual({ ok: false, code: 'CONTACT_NOTES_TOO_LONG' });
  });

  it('normalizes a non-object payload to the missing-name failure', () => {
    expect(normalizeContactInput(null)).toEqual({
      ok: false,
      code: 'CONTACT_NAME_REQUIRED',
    });
  });

  it('recognizes only the three department codes', () => {
    expect(isContactDepartment('rd')).toBe(true);
    expect(isContactDepartment('sales')).toBe(true);
    expect(isContactDepartment('admin')).toBe(true);
    expect(isContactDepartment('RD')).toBe(false);
    expect(isContactDepartment('')).toBe(false);
    expect(isContactDepartment(null)).toBe(false);
  });
});
