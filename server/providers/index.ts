import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TrainingProvider from './training.js';
import UserRolesProvider from './user-roles.js';

export { trainingServiceToken, TrainingError } from './training.js';
export {
  TRAINING_ADMIN_ROLE,
  TRAINING_INSTRUCTOR_ROLE,
  TRAINING_STUDENT_ROLE,
  type CompletionStat,
  type CourseSummary,
  type GradingTodoItem,
  type LearningSession,
  type SessionDetail,
  type SessionSummary,
  type SubmissionView,
  type TrainingService,
  type TrainingUserOption,
  type TrainingViewer,
} from './training.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  UserRolesProvider,
  TrainingProvider,
];

export default serviceProviders;
