import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
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

/** Swapped per test so one mock can serve any signed-in role. */
let currentViewer: Record<string, unknown> = viewer;
let assignmentResponse: unknown = null;

const request = vi.fn(
  async (options: { path: string; query?: Record<string, string> }) => {
    if (options.path === 'training/me') return { data: currentViewer };
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
    if (options.path === 'training/assignments/1' && assignmentResponse) {
      return { data: assignmentResponse };
    }
    return { data: [] };
  },
);

vi.mock('@nocobase/app-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  useApiClient: () => ({ request }),
  useService: () => ({
    repository: () => ({
      uploadMany: vi.fn(),
      deleteOne: vi.fn(async () => ({})),
    }),
  }),
}));

vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: Symbol('training-file-repository'),
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
    currentViewer = viewer;
    assignmentResponse = null;
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

  it('shows the instructor every attempt and names the attempt under review', async () => {
    currentViewer = {
      userId: 'instructor-1',
      name: '李讲师',
      email: 'instructor.li@example.com',
      isAdmin: false,
      isInstructor: true,
      isStudent: false,
    };
    assignmentResponse = buildAssignmentDetail();
    const { default: AssignmentPage } =
      await import('../../client/pages/training/assignment-detail.js');
    render(
      <MemoryRouter initialEntries={['/training/assignments/1']}>
        <Routes>
          <Route
            path='/training/assignments/:assignmentId'
            element={<AssignmentPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('第一版内容')).toBeInTheDocument();
    expect(screen.getByText('第二版内容')).toBeInTheDocument();
    // The first round is labelled as history; the newest one is the target of
    // the review form, and both attempts keep their own attachments.
    expect(
      screen.getByText('training.review.historyAttempt'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('training.review.targetAttempt').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('初稿.txt')).toBeInTheDocument();
    expect(screen.getByText('修订稿.pdf')).toBeInTheDocument();
    expect(screen.getByText('退回批注.pdf')).toBeInTheDocument();
    // The earlier verdict stays visible next to the attempt it judged.
    expect(screen.getByText(/请补充细节/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'training.review.grade' }),
    ).toBeInTheDocument();
  });
});

function buildAssignmentDetail(): unknown {
  const attachment = (
    id: string,
    filename: string,
    ext: string,
    mimeType: string,
  ) => ({
    id,
    filename,
    ext,
    mimeType,
    size: 12,
    contentUrl: `/uploads/training/${id}.${ext}`,
    uploadedById: 'student-1',
    createdAt: '2026-08-15T08:00:00.000Z',
  });
  const session = {
    id: 1,
    code: 'SES-101-A',
    title: '2026 秋季新员工一班',
    courseId: 1,
    courseCode: 'TRN-101',
    courseTitle: '新员工入职培训',
    instructorId: 'instructor-1',
    instructorName: '李讲师',
    startAt: '2026-08-01T01:00:00.000Z',
    endAt: '2026-09-30T09:00:00.000Z',
    capacity: 30,
    location: '线上直播',
    status: 'in_progress',
    enrolledCount: 1,
  };
  const assignment = {
    id: 1,
    sessionId: 1,
    title: '入职第一周学习心得',
    description: null,
    dueAt: '2099-01-01T00:00:00.000Z',
    maxScore: 100,
    status: 'published',
    publishedAt: '2026-08-01T00:00:00.000Z',
    submissionCount: 1,
    gradedCount: 0,
    pendingCount: 1,
    returnedCount: 0,
    mySubmission: null,
  };
  return {
    assignment,
    session,
    submissions: [
      {
        id: 11,
        assignmentId: 1,
        studentId: 'student-1',
        studentName: '赵一',
        attempt: 1,
        content: '第一版内容',
        status: 'returned',
        isLate: false,
        submittedAt: '2026-08-13T08:00:00.000Z',
        score: null,
        feedback: '请补充细节',
        maxScore: 100,
        reviewedById: 'instructor-1',
        reviewedAt: '2026-08-16T03:00:00.000Z',
        files: [attachment('f1', '初稿.txt', 'txt', 'text/plain')],
        reviews: [
          {
            id: 1,
            attempt: 1,
            decision: 'returned',
            score: null,
            feedback: '请补充细节',
            reviewerId: 'instructor-1',
            reviewerName: '李讲师',
            createdAt: '2026-08-16T03:00:00.000Z',
            files: [
              {
                ...attachment('f2', '退回批注.pdf', 'pdf', 'application/pdf'),
                uploadedById: 'instructor-1',
              },
            ],
          },
        ],
      },
      {
        id: 12,
        assignmentId: 1,
        studentId: 'student-1',
        studentName: '赵一',
        attempt: 2,
        content: '第二版内容',
        status: 'submitted',
        isLate: true,
        submittedAt: '2026-08-18T08:00:00.000Z',
        score: null,
        feedback: null,
        maxScore: 100,
        reviewedById: null,
        reviewedAt: null,
        files: [attachment('f3', '修订稿.pdf', 'pdf', 'application/pdf')],
        reviews: [],
      },
    ],
  };
}
