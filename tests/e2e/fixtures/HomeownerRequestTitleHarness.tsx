import { useState } from 'react';

import { HomeownerRequestTitleField } from '../../../src/features/requests/HomeownerRequestTitleField';

export function HomeownerRequestTitleHarness() {
  const [value, setValue] = useState('');

  return (
    <HomeownerRequestTitleField
      className="request-title-harness"
      generatedDefault="Plumbing help needed"
      inputProps={{}}
      onValueBlur={setValue}
      onValueChange={setValue}
      value={value}
    />
  );
}
