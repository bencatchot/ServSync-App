import type { InputHTMLAttributes } from 'react';

import { Field } from '../presentation/CorePresentation';

export function HomeownerRequestTitleField({
  className,
  generatedDefault,
  inputProps,
  onValueBlur,
  onValueChange,
  value,
}: {
  className: string;
  generatedDefault: string;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  onValueBlur: (value: string) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field label="Request title">
      <input
        className={className}
        {...inputProps}
        value={value || generatedDefault}
        onChange={event => onValueChange(event.target.value)}
        onBlur={event => onValueBlur(event.target.value)}
      />
    </Field>
  );
}
