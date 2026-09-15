import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

import { PhotoGallery } from '../../client/components/inspection/photo-gallery.js';
import type { Photo } from '../../client/components/inspection/types.js';

const PHOTOS: readonly Photo[] = [
  {
    fileId: 'file-a',
    filename: 'file-a.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 2048,
    contentUrl: '/main/uploads/inspection-photos/file-a.png',
  },
  {
    fileId: 'file-b',
    filename: 'file-b.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 4096,
    contentUrl: '/main/uploads/inspection-photos/file-b.png',
  },
];

describe('PhotoGallery', () => {
  it('renders one thumbnail per photo', () => {
    render(<PhotoGallery photos={PHOTOS} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute(
      'src',
      '/main/uploads/inspection-photos/file-a.png',
    );
  });

  it('shows an empty state without photos', () => {
    render(<PhotoGallery photos={[]} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('inspection.detail.photosEmpty')).toBeVisible();
  });

  it('opens a large preview when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={PHOTOS} />);
    await user.click(
      screen.getByRole('button', {
        name: 'inspection.gallery.preview:file-b.png',
      }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('file-b.png')).toBeVisible();
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      '/main/uploads/inspection-photos/file-b.png',
    );
  });

  it('offers no delete control when the caller may not delete', () => {
    render(<PhotoGallery photos={PHOTOS} />);
    expect(
      screen.queryByRole('button', {
        name: 'inspection.gallery.delete:file-a.png',
      }),
    ).toBeNull();
  });

  it('deletes a single photo without touching its sibling', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PhotoGallery canDelete onDelete={onDelete} photos={PHOTOS} />);
    await user.click(
      screen.getByRole('button', {
        name: 'inspection.gallery.delete:file-a.png',
      }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('file-a');
    expect(
      screen.getByRole('button', {
        name: 'inspection.gallery.preview:file-b.png',
      }),
    ).toBeVisible();
  });
});
