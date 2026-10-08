import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import {
  FilePreviewBody,
  FilePreviewContent,
} from '../../client/extensions/nocobase-file-component-ui/index';
import type { FileRecord } from '../../client/extensions/nocobase-file-component-ui/index';

function png(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'c1b2c3d4-0001-4000-8000-000000000001',
    filename: '现场照片.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 199,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    contentUrl:
      '/main/projectMaterialFiles/c1b2c3d4-0001-4000-8000-000000000001.png',
    ...overrides,
  };
}

it('renders the real image bytes for a PNG attachment (B01)', () => {
  render(<FilePreviewBody file={png()} />);

  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    '/main/projectMaterialFiles/c1b2c3d4-0001-4000-8000-000000000001.png',
  );
});

it('explains a corrupted or unavailable image instead of showing a broken one (B06)', () => {
  const { container } = render(
    <FilePreviewContent
      file={png({ filename: '损坏图片.png' })}
      kind='image'
      url='/main/projectMaterialFiles/broken.png'
    />,
  );

  // A decoded-but-invalid PNG fires `error` on the element; the browser does not
  // report why, so the message names both common causes rather than guessing.
  fireEvent.error(container.querySelector(':scope img') as HTMLImageElement);

  expect(
    screen.getByText(
      'This image could not be displayed. The file may be corrupted or temporarily unavailable.',
    ),
  ).toBeInTheDocument();
  // The failed preview element is gone; what remains is the fallback's own
  // thumbnail, which falls back to a type icon when the bytes cannot decode.
  expect(
    container.querySelector('img:not([data-slot="file-thumbnail"])'),
  ).toBeNull();
});
