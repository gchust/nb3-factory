import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import {
  FilePreviewContent,
  type FileRecord,
} from '../../client/extensions/nocobase-file-component-ui/index';

function imageFile(): FileRecord {
  return {
    id: 'attachment',
    filename: 'photo.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 10,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    contentUrl: '/main/api/project-attachments/attachment/content',
  };
}

it('reports a damaged image instead of leaving a broken thumbnail', () => {
  render(
    <FilePreviewContent
      file={imageFile()}
      kind='image'
      url='/main/api/project-attachments/attachment/content'
    />,
  );
  const image = document.querySelector('img');
  expect(image).not.toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.error(image!);

  expect(screen.getByRole('alert')).toHaveTextContent(
    'This image could not be displayed. The file may be damaged or in an unsupported format.',
  );
});

it('shows the supplied preview error as the failure message', () => {
  render(
    <FilePreviewContent
      file={imageFile()}
      kind='image'
      url='/main/api/project-attachments/attachment/content'
      error='The file is unreadable.'
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The file is unreadable.',
  );
  expect(document.querySelector('img')).toBeNull();
});
