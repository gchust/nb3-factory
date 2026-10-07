import { useTranslation } from '@nocobase/i18n/client';
import { useRef, type ReactElement } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';

import { ProjectForm } from './forms.js';
import type { Project, ProjectsOutletContext } from './types.js';

/**
 * The "new project" form, reached at `/projects/new` and presented as a dialog over the list. Creating navigates on
 * to the project the user just made, so they can add members and tasks without another trip through the list.
 */
export default function NewProjectPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { reload } = useOutletContext<ProjectsOutletContext>();
  // A ref, not state: the guard reads it inside the close handler and nothing renders from it.
  const submittingRef = useRef(false);

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      description={t('projects.create.hint')}
      title={t('projects.create.action')}
    >
      <ProjectForm
        formId='project-new-form'
        onCancel={() =>
          void navigate(
            { pathname: '..', search: location.search, hash: '' },
            { relative: 'route', replace: true },
          )
        }
        onSubmitted={(project: Project) => {
          reload();
          void navigate(`/projects/${project.id}`, { replace: true });
        }}
        onSubmittingChange={(submitting) => {
          submittingRef.current = submitting;
        }}
      />
    </RouteDialog>
  );
}
