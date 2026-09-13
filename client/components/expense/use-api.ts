import { apiClientToken, useService } from '@nocobase/app-client';
import { useMemo } from 'react';

import { createExpenseApi, type ExpenseApi } from '@/lib/expense-api';

export function useExpenseApi(): ExpenseApi {
  const client = useService(apiClientToken);
  return useMemo(() => createExpenseApi(client), [client]);
}
