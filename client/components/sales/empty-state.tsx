import type { ReactNode } from 'react';

import { Inbox } from 'lucide-react';

export function EmptyState({ message }: { message: string }): ReactNode {
  return (
    <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center'>
      <Inbox className='size-10 text-muted-foreground/60' />
      <p className='text-sm text-muted-foreground'>{message}</p>
    </div>
  );
}
