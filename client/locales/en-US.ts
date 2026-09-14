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
    dashboard: 'Recruiting dashboard',
    requisitions: 'Job requisitions',
    candidates: 'Candidates',
    interviews: 'Interviews',
    offers: 'Offers',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
  },

  recruiting: {
    actions: {
      retry: 'Retry',
      edit: 'Edit',
      delete: 'Delete',
    },
    state: {
      loading: 'Loading…',
      error: 'Something went wrong.',
      saving: 'Saving…',
    },
    filters: {
      status: 'Status',
      stage: 'Stage',
      requisition: 'Requisition',
      all: 'All',
    },
    fields: {
      title: 'Job title',
      department: 'Department',
      headcount: 'Headcount',
      requirements: 'Requirements',
      expectedArrivalDate: 'Expected start date',
      priority: 'Priority',
      status: 'Status',
      actions: 'Actions',
      name: 'Name',
      phone: 'Phone',
      email: 'Email',
      requisition: 'Job requisition',
      source: 'Source',
      stage: 'Stage',
      overallScore: 'Overall score',
      resume: 'Resume',
      candidate: 'Candidate',
      round: 'Round',
      scheduledAt: 'Interview time',
      interviewer: 'Interviewer',
      locationOrLink: 'Location or meeting link',
      evaluation: 'Evaluation',
      technicalScore: 'Technical score (1-5)',
      communicationScore: 'Communication score (1-5)',
      conclusion: 'Conclusion',
      comments: 'Comments',
      position: 'Position',
      salary: 'Proposed salary',
      expectedStartDate: 'Expected start date',
    },
    enums: {
      requisitionStatus: {
        open: 'Open',
        paused: 'Paused',
        completed: 'Completed',
      },
      priority: { high: 'High', medium: 'Medium', low: 'Low' },
      stage: {
        screening: 'Screening',
        invited: 'Invited',
        interviewing: 'Interviewing',
        pending: 'Pending',
        hired: 'Hired',
        rejected: 'Rejected',
      },
      source: {
        referral: 'Internal referral',
        job_board: 'Job board',
        headhunter: 'Headhunter',
        campus: 'Campus recruiting',
      },
      round: {
        initial: 'First round',
        second: 'Second round',
        final: 'Final round',
      },
      interviewStatus: {
        scheduled: 'Scheduled',
        completed: 'Completed',
        cancelled: 'Cancelled',
      },
      conclusion: { pass: 'Pass', pending: 'Pending', fail: 'Fail' },
      offerStatus: {
        pending: 'Pending confirmation',
        accepted: 'Accepted',
        declined: 'Declined',
      },
    },
    dashboard: {
      title: 'Recruiting dashboard',
      description:
        'Open positions, the candidate pipeline per requisition, and scheduled interviews.',
      openRequisitions: 'Open requisitions',
      scheduledInterviews: 'Scheduled interviews',
      totalCandidates: 'Candidates',
      byRequisition: 'Pipeline by requisition',
      stages: 'Stage distribution',
      empty: 'No requisitions yet.',
      unassigned: '{{count}} candidate(s) are not linked to a requisition.',
    },
    requisitions: {
      title: 'Job requisitions',
      description: 'Open roles, headcount, and hiring status.',
      new: 'New requisition',
      edit: 'Edit requisition',
      empty: 'No requisitions match the current filter.',
      saved: 'Requisition saved.',
      deleted: 'Requisition deleted.',
      confirmDelete: 'Delete this requisition?',
    },
    candidates: {
      title: 'Candidates',
      description: 'Candidate profiles, application stage, and resumes.',
      new: 'New candidate',
      edit: 'Edit candidate',
      empty: 'No candidates match the current filter.',
      saved: 'Candidate saved.',
      back: 'Back to candidates',
      currentResume: 'Current resume: {{filename}}',
      scorePending: 'Not scored yet',
      downloadResume: 'Download resume',
      noResume: 'No resume uploaded',
    },
    interviews: {
      title: 'Interviews',
      description:
        'Scheduled interviews. Scheduling moves the candidate to the interviewing stage.',
      new: 'Schedule interview',
      empty: 'No interviews yet.',
      scheduled: 'Interview scheduled.',
      evaluate: 'Submit evaluation',
      editEvaluation: 'Edit evaluation',
      notEvaluated: 'Not evaluated',
      evaluationSaved:
        'Evaluation saved. Candidate overall score is now {{score}}.',
    },
    offers: {
      title: 'Offers',
      description: 'One offer per candidate; a duplicate is rejected.',
      new: 'New offer',
      empty: 'No offers yet.',
      saved: 'Offer saved.',
      accept: 'Accept',
      decline: 'Decline',
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
