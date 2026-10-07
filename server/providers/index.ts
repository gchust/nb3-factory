import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import ProjectsProvider from './projects.js';
import ProjectRemindersProvider from './project-reminders.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  ProjectsProvider,
  ProjectRemindersProvider,
];

export {
  projectsServiceToken,
  createProjectsService,
  ProjectCollaborationError,
} from './projects.js';
export type {
  ProjectsService,
  ProjectView,
  ProjectDetailView,
  MemberView,
  MilestoneView,
  TaskView,
  DeliverableView,
  ShareView,
  DashboardView,
  CreateProjectInput,
  UpdateProjectInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  CreateTaskInput,
  UpdateTaskInput,
  SubmitDeliverableInput,
  MemberRole,
  ProjectStatus,
  TaskStatus,
  TaskPriority,
  DeliverableStatus,
  MilestoneStatus,
} from './projects.js';

export default serviceProviders;
