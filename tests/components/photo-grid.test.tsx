import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { PhotoGrid } from '@/components/equipment/photo-grid';
import type { FileRecord } from '@/extensions/nocobase-file-component-ui';

function makePhoto(filename: string): FileRecord {
  return {
    id: `photo-${filename}`,
    disk: 'local',
    key: `objects/photo-${filename}`,
    filename,
    ext: 'png',
    mimeType: 'image/png',
    size: 10,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    contentUrl: `/main/uploads/inspection-photos/photo-${filename}`,
  };
}

describe('PhotoGrid', () => {
  it('renders the empty text when there are no photos', () => {
    render(
      <PhotoGrid
        name='inspection-photos'
        photos={[]}
        emptyText='暂无现场照片'
      />,
    );
    expect(screen.getByText('暂无现场照片')).toBeInTheDocument();
  });

  it('renders one thumbnail button per photo with a preview label', () => {
    const photos = [makePhoto('a.png'), makePhoto('b.png')];
    render(
      <PhotoGrid
        name='inspection-photos'
        photos={photos}
        emptyText=''
        previewLabel='预览'
      />,
    );
    expect(
      screen.getByRole('button', { name: '预览: a.png' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '预览: b.png' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(list.getAttribute('aria-label')).toBe('inspection-photos');
    expect(list.querySelectorAll('li')).toHaveLength(2);
  });

  it('calls onDelete with the photo for the matching remove button', () => {
    const onDelete = vi.fn();
    const photo = makePhoto('a.png');
    render(
      <PhotoGrid
        name='inspection-photos'
        photos={[photo]}
        emptyText=''
        removeLabel='删除'
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '删除: a.png' }));
    expect(onDelete).toHaveBeenCalledWith(photo);
  });

  it('does not render remove buttons when onDelete is absent', () => {
    render(
      <PhotoGrid
        name='inspection-photos'
        photos={[makePhoto('a.png')]}
        emptyText=''
        removeLabel='删除'
      />,
    );
    expect(
      screen.queryByRole('button', { name: '删除: a.png' }),
    ).not.toBeInTheDocument();
  });
});
