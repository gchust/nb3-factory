import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DateTimeField } from '../../client/pages/recruitment/date-time-field';

/**
 * The scheduling dialog used to embed a browser-native `datetime-local`
 * picker, whose popup lives outside the dialog and dismissed it. These tests
 * pin the replacement's behaviour: every part of choosing a date and time is
 * an ordinary in-document control.
 */
describe('DateTimeField', () => {
  it('selects a day from the inline month grid and keeps the time', () => {
    const onChange = vi.fn();
    render(
      <DateTimeField
        label='Scheduled at'
        onChange={onChange}
        value='2026-09-01T09:00'
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '2026-09-25' }));

    expect(onChange).toHaveBeenCalledWith('2026-09-25T09:00');
  });

  it('composes hour and minute changes with the selected day', () => {
    const onChange = vi.fn();
    render(
      <DateTimeField
        label='Scheduled at'
        onChange={onChange}
        value='2026-09-25T09:00'
      />,
    );

    const [hour, minute] = screen.getAllByRole('combobox');
    fireEvent.change(hour, { target: { value: '14' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-09-25T14:00');

    fireEvent.change(minute, { target: { value: '30' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-09-25T09:30');
  });

  it('moves between months without a native picker', () => {
    render(<DateTimeField label='Scheduled at' onChange={vi.fn()} value='' />);

    // The value is empty, so the control shows the current month and no day is
    // pressed; navigating still exposes day buttons for another month.
    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(
      screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ })[0],
    ).toBeInTheDocument();
  });
});
