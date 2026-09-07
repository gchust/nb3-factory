import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export interface FormFieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function FormField({
  label,
  required = false,
  children,
  className,
}: FormFieldProps): ReactNode {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>
        {label}
        {required ? <span className='ml-0.5 text-destructive'>*</span> : null}
      </Label>
      {children}
    </div>
  );
}
