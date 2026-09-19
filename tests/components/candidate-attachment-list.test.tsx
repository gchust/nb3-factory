import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CandidateFile } from '../../client/pages/recruitment/api.js';
import { CandidateAttachmentList } from '../../client/pages/recruitment/candidate-files.js';

function candidateFile(
  id: string,
  filename: string,
  category: CandidateFile['category'],
  extra: Partial<CandidateFile> = {},
): CandidateFile {
  const ext = filename.split('.').pop() ?? '';
  return {
    id,
    candidateId: 'candidate-1',
    category,
    filename,
    ext,
    mimeType: 'application/pdf',
    size: 2048,
    version: null,
    superseded: false,
    uploadedByUsername: 'recruiter.li',
    uploadedByName: '李娜',
    disk: 'local',
    key: `objects/${id}`,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    contentUrl: `/main/uploads/recruitment-files/${id}.${ext}`,
    ...extra,
  };
}

/**
 * The interview view is the interviewer's only window onto candidate material.
 * It must show the resume and portfolio, and must never render offer materials.
 */
describe('CandidateAttachmentList', () => {
  it('shows resume and portfolio while hiding offer materials', () => {
    const files = [
      candidateFile('resume-2', 'resume-v2.pdf', 'resume', { version: 2 }),
      candidateFile('resume-1', 'resume-v1.pdf', 'resume', {
        version: 1,
        superseded: true,
      }),
      candidateFile('work-1', 'portfolio.png', 'portfolio', {
        mimeType: 'image/png',
      }),
      candidateFile('offer-1', 'offer-letter.pdf', 'offer'),
    ];

    render(
      <CandidateAttachmentList
        files={files}
        onError={() => undefined}
        resumeNote='Resume referenced: v2'
      />,
    );

    expect(screen.getByText('resume-v2.pdf')).toBeInTheDocument();
    expect(screen.getByText('resume-v1.pdf')).toBeInTheDocument();
    expect(screen.getByText('portfolio.png')).toBeInTheDocument();
    expect(screen.queryByText('offer-letter.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Resume referenced: v2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'recruitment.files.preview: resume-v2.pdf',
      }),
    ).toBeInTheDocument();
  });
});
