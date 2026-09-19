import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewer = {
  userId: 'student-1',
  name: '赵一',
  email: 'student.zhao@example.com',
  isAdmin: false,
  isInstructor: false,
  isStudent: true,
};

const courses = [
  {
    id: 1,
    code: 'TRN-101',
    title: '新员工入职培训',
    description: '帮助新同事了解公司文化。',
    category: '通用',
    level: '入门',
    status: 'published',
    sessionCount: 1,
    assignmentCount: 3,
  },
  {
    id: 2,
    code: 'TRN-201',
    title: '销售技能提升',
    description: null,
    category: '销售',
    level: '进阶',
    status: 'published',
    sessionCount: 1,
    assignmentCount: 4,
  },
];

const request = vi.fn(
  async (options: { path: string; query?: Record<string, string> }) => {
    if (options.path === 'training/me') return { data: viewer };
    if (options.path === 'training/categories') {
      return { data: ['通用', '销售'] };
    }
    if (options.path === 'training/catalog') {
      const search = options.query?.search;
      return {
        data: search
          ? courses.filter((course) => course.title.includes(search))
          : courses,
      };
    }
    return { data: [] };
  },
);

vi.mock('@nocobase/app-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  useApiClient: () => ({ request }),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN' },
  }),
}));

describe('training pages', () => {
  beforeEach(() => {
    request.mockClear();
  });

  it('renders the course catalog from the catalog endpoint', async () => {
    const { default: CatalogPage } =
      await import('../../client/pages/training/catalog.js');
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('新员工入职培训')).toBeInTheDocument();
    expect(screen.getByText('销售技能提升')).toBeInTheDocument();
    expect(screen.getByText('TRN-101')).toBeInTheDocument();
  });

  it('denies the statistics page to a student', async () => {
    const { default: StatsPage } =
      await import('../../client/pages/training/stats.js');
    render(
      <MemoryRouter>
        <StatsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('training.errors.instructorOnly'),
    ).toBeInTheDocument();
  });

  it('resets the catalog search and reloads the unfiltered list', async () => {
    const user = userEvent.setup();
    const { default: CatalogPage } =
      await import('../../client/pages/training/catalog.js');
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('新员工入职培训')).toBeInTheDocument();

    const search = screen.getByLabelText('training.catalog.search');
    await user.type(search, '销售');
    expect(await screen.findByText('销售技能提升')).toBeInTheDocument();
    expect(screen.queryByText('新员工入职培训')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'training.catalog.reset' }),
    );

    expect(search).toHaveValue('');
    expect(await screen.findByText('新员工入职培训')).toBeInTheDocument();
    expect(screen.getByText('销售技能提升')).toBeInTheDocument();
  });

  it('shows each role a demo account to sign in with', async () => {
    const { DemoAccounts } =
      await import('../../client/components/demo-accounts.js');
    render(<DemoAccounts />);

    expect(screen.getByText('admin.train')).toBeInTheDocument();
    expect(screen.getByText('instructor.li')).toBeInTheDocument();
    expect(screen.getByText('student.zhao')).toBeInTheDocument();
    expect(screen.getByText('demo.password')).toBeInTheDocument();
  });

  it('renders the training overview and quick links on the home page', async () => {
    const { default: HomePage } = await import('../../client/pages/home.js');
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('home.title')).toBeInTheDocument();
    expect(screen.getByText('home.linkCatalog')).toBeInTheDocument();
    expect(screen.getByText('home.linkManage')).toBeInTheDocument();
    expect(screen.getByText('admin.train')).toBeInTheDocument();
  });
});
