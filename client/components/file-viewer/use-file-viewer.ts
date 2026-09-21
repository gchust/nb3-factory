import { useCallback, useState } from 'react';

import type { DeliveryFile } from '@/lib/delivery-api';

export interface FileViewerController {
  readonly open: boolean;
  readonly files: readonly DeliveryFile[];
  readonly index: number;
  readonly show: (files: readonly DeliveryFile[], index?: number) => void;
  readonly hide: () => void;
}

/** Small state holder pages use to open the viewer for a specific file list. */
export function useFileViewer(): FileViewerController {
  const [state, setState] = useState<{
    open: boolean;
    files: readonly DeliveryFile[];
    index: number;
  }>({ open: false, files: [], index: 0 });
  const show = useCallback((files: readonly DeliveryFile[], index = 0) => {
    setState({ open: true, files, index });
  }, []);
  const hide = useCallback(() => {
    setState((value) => ({ ...value, open: false }));
  }, []);
  return { ...state, show, hide };
}
