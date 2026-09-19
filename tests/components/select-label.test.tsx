import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../client/components/ui/select.js';

/**
 * Base UI's Select.Value reads labels from the Root `items` prop, not from the
 * rendered SelectItem children. This is the regression guard for relation
 * pickers showing a raw id instead of a person's name.
 */
describe('base ui select trigger label', () => {
  it('shows the selected item label when items are provided', () => {
    render(
      <Select
        items={[
          { value: '__none__', label: '待指派' },
          { value: 'user-1', label: '王强' },
        ]}
        value='user-1'
      >
        <SelectTrigger>
          <SelectValue placeholder='待指派' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='__none__'>待指派</SelectItem>
          <SelectItem value='user-1'>王强</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('王强')).toBeVisible();
    expect(screen.queryByText('user-1')).toBeNull();
  });

  it('falls back to the placeholder when no value is selected', () => {
    render(
      <Select items={[{ value: 'user-1', label: '王强' }]} value={null}>
        <SelectTrigger>
          <SelectValue placeholder='待指派' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='user-1'>王强</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByText('待指派')).toBeVisible();
    expect(screen.queryByText('王强')).toBeNull();
  });
});
