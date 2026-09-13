import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Default', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  account: {
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    delivery: 'Project delivery',
    deliveryDashboard: 'Delivery board',
    deliveryProjects: 'Projects',
    deliveryMilestones: 'Milestones',
    deliveryTasks: 'Tasks',
    deliveryTimesheets: 'Timesheets',
  },

  delivery: {
    loading: 'Loading…',
    unassigned: 'Unassigned',
    none: 'None',
    allProjects: 'All projects',
    actions: {
      retry: 'Retry',
      refresh: 'Refresh',
      edit: 'Edit',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      upload: 'Upload',
    },
    errors: {
      validation: 'The submitted values are not valid.',
      duplicateTimesheet:
        'This member already registered hours for that task on that day.',
      taskLocked: 'A completed task status cannot be changed.',
      forbidden: 'You are not allowed to do that.',
      notFound: 'The requested record was not found.',
      taskHasTimesheets: 'A task with timesheet records cannot be deleted.',
      fileTooLarge: 'The file exceeds the 10 MB limit.',
      fileRequired: 'Select a file to upload.',
      unknown: 'Something went wrong. Please try again.',
    },
    fields: {
      name: 'Name',
      project: 'Project',
      client: 'Client',
      manager: 'Project manager',
      startDate: 'Start date',
      endDate: 'End date',
      budgetHours: 'Budget hours',
      status: 'Status',
      actions: 'Actions',
      task: 'Task',
      assignee: 'Assignee',
      plannedDate: 'Planned date',
      actualDate: 'Actual date',
      milestone: 'Milestone',
      priority: 'Priority',
      description: 'Description',
      member: 'Member',
      workDate: 'Work date',
      hours: 'Hours',
      workContent: 'Work content',
    },
    status: {
      project: {
        planning: 'Planning',
        active: 'In progress',
        delivered: 'Delivered',
        paused: 'Paused',
      },
      milestone: {
        not_started: 'Not started',
        in_progress: 'In progress',
        completed: 'Completed',
      },
      task: {
        todo: 'To do',
        in_progress: 'In progress',
        completed: 'Completed',
      },
    },
    priority: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    },
    timeliness: {
      on_time: 'On time',
      overdue: 'Overdue',
    },
    dashboard: {
      title: 'Delivery board',
      description:
        'Hours, task completion and overdue work across every project.',
      totalHours: 'Total hours',
      projectCount: 'Projects',
      overdueCount: 'Overdue tasks',
      byProject: 'By project',
      hours: 'Hours',
      tasks: 'Tasks',
      completionRate: 'Completion rate',
      overdueTasks: 'Overdue task list',
      noData: 'No project data yet.',
      noOverdue: 'No overdue tasks.',
    },
    projects: {
      title: 'Projects',
      description:
        'Track client projects, their budgets and their deliverables.',
      create: 'New project',
      createTitle: 'New project',
      editTitle: 'Edit project',
      filterStatus: 'Filter by status',
      allStatuses: 'All statuses',
      empty: 'No projects yet.',
    },
    milestones: {
      title: 'Milestones',
      description: 'Plan delivery checkpoints for each project.',
      create: 'New milestone',
      createTitle: 'New milestone',
      editTitle: 'Edit milestone',
      empty: 'No milestones yet.',
    },
    tasks: {
      title: 'Tasks',
      description: 'Assign work, record dates and follow completion.',
      create: 'New task',
      createTitle: 'New task',
      editTitle: 'Edit task',
      timeliness: 'Timeliness',
      updateStatus: 'Update status',
      completedHint:
        'This task is completed. Its status is final and cannot be changed.',
      empty: 'No tasks yet.',
    },
    timesheets: {
      title: 'Timesheets',
      description: 'Register the hours worked on each task.',
      create: 'Log hours',
      createTitle: 'Log hours',
      empty: 'No timesheet records yet.',
      ownOnly: 'You can view and register only your own hours.',
      rules:
        'Hours must be a multiple of 0.5 and no more than 24. One entry per task per day.',
    },
    attachments: {
      button: 'Deliverables',
      title: 'Deliverables for {{name}}',
      empty: 'No deliverables uploaded yet.',
      filename: 'File',
      size: 'Size (bytes)',
      download: 'Download',
      upload: 'Upload a deliverable',
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
