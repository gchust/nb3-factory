import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import TrainingProvider from './training.js';
import UserRolesProvider from './user-roles.js';

export { trainingServiceToken, TrainingError } from './training.js';
export {
  TRAINING_ADMIN_ROLE,
  TRAINING_INSTRUCTOR_ROLE,
  TRAINING_LEARNER_ROLE,
  TRAINING_STUDENT_ROLE,
  TRAINING_FILE_ACCESS_PATH,
  TRAINING_FILE_MAX_COUNT,
  TRAINING_FILE_MAX_SIZE,
  TRAINING_FILE_RESOURCE,
  type CompletionStat,
  type CourseSummary,
  type FileAttachmentView,
  type GradingTodoItem,
  type LearningSession,
  type MaterialView,
  type SessionDetail,
  type SessionSummary,
  type SubmissionReviewView,
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
