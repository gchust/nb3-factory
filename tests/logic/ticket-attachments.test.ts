import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasImageSignature,
  isDecodableImage,
} from '../../client/pages/tickets/attachments.js';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function fileOf(
  bytes: readonly number[],
  name = 'screenshot.png',
  type = 'image/png',
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

afterEach(() => vi.unstubAllGlobals());

describe('image signature', () => {
  it('accepts the header of each supported raster format', () => {
    expect(hasImageSignature(new Uint8Array(PNG_HEADER))).toBe(true);
    expect(hasImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    );
    expect(
      hasImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe(true);
    expect(hasImageSignature(new Uint8Array([0x42, 0x4d, 0x00]))).toBe(true);
    expect(
      hasImageSignature(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe(true);
  });

  it('rejects text and a RIFF container that is not a WebP', () => {
    expect(hasImageSignature(new TextEncoder().encode('not an image'))).toBe(
      false,
    );
    expect(
      hasImageSignature(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49]),
      ),
    ).toBe(false);
  });
});

describe('image decoding', () => {
  it('rejects a file whose extension lies and never asks the decoder to read it', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);

    await expect(
      isDecodableImage(fileOf([0x68, 0x65, 0x6c, 0x6c, 0x6f])),
    ).resolves.toBe(false);
    expect(decode).not.toHaveBeenCalled();
  });

  it('accepts a file the browser can decode', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close }));

    await expect(
      isDecodableImage(fileOf([...PNG_HEADER, 1, 2, 3, 4])),
    ).resolves.toBe(true);
    expect(close).toHaveBeenCalled();
  });

  it('rejects a file that carries the header but the decoder cannot read', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('broken image')),
    );

    await expect(
      isDecodableImage(fileOf([...PNG_HEADER, 1, 2, 3, 4])),
    ).resolves.toBe(false);
  });
});
