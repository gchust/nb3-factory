import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '../../client/pages/home';

/**
 * The acceptance flow needs a way to try every recruitment role. The home page
 * names the seeded fictitious accounts, their role, and the shared password.
 */
describe('HomePage role trials', () => {
  it('lists the demo accounts and their shared password', () => {
    render(<HomePage />);

    for (const username of [
      'hr.manager',
      'recruiter.li',
      'recruiter.wang',
      'interviewer.chen',
      'interviewer.zhang',
    ]) {
      expect(screen.getByText(username)).toBeInTheDocument();
    }
    expect(screen.getByText('Recruit123!')).toBeInTheDocument();
  });
});
