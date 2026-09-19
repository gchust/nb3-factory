import { ApiClientError } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import { expenseErrorMessage } from '../../client/pages/expenses/errors.js';

const TRANSLATIONS: Readonly<Record<string, string>> = {
  'expenses.errors.NOT_APPROVED': '只有已批准的报销单才能付款。',
  'expenses.errors.NO_MANAGER':
    '你的员工资料未配置直属经理，暂时无法提交，请联系管理员。',
};

function translate(key: string): string {
  return TRANSLATIONS[key] ?? key;
}

function apiError(code: string, message: string): ApiClientError {
  return new ApiClientError(message, {
    status: 409,
    payload: { error: { code, message } },
    method: 'post',
    url: '/main/api/expenses/reports/rpt-1/pay',
  });
}

describe('expense error messages', () => {
  it('shows a localized message for a known server error code', () => {
    expect(
      expenseErrorMessage(
        apiError('NOT_APPROVED', 'Only an approved reimbursement can be paid.'),
        'fallback',
        translate,
      ),
    ).toBe('只有已批准的报销单才能付款。');
  });

  it('keeps the server message when the code has no translation', () => {
    expect(
      expenseErrorMessage(
        apiError('SOMETHING_NEW', 'A server-side explanation.'),
        'fallback',
        translate,
      ),
    ).toBe('A server-side explanation.');
    expect(
      expenseErrorMessage(apiError('NOT_APPROVED', 'Server text.'), 'fallback'),
    ).toBe('Server text.');
  });

  it('falls back for errors without a server payload', () => {
    expect(expenseErrorMessage(new Error('boom'), 'fallback', translate)).toBe(
      'boom',
    );
    expect(expenseErrorMessage(null, 'fallback', translate)).toBe('fallback');
  });
});
