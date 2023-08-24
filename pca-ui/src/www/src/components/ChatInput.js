import React from "react";
import { useState } from "react";

import { Button,  Grid, Input } from '@cloudscape-design/components';


export const ChatInput = ({submitQuery}) => {
  const [inputQuery, setInputQuery] = useState("");
  
  const onSubmit = (e) => {
    submitQuery(inputQuery);
    setInputQuery('');
    e.preventDefault();
    return true;
  }

  return (
    <form onSubmit={onSubmit}>
      <Grid gridDefinition={[{ colspan: { default: 12, xxs: 9 } }, { default: 12, xxs: 3 }]}>
        <Input
          placeholder="Enter a question about the call."
          onChange={({ detail }) => setInputQuery(detail.value)}
          value={inputQuery}
        />
          <Button type="submit">
          Submit
          </Button>
      </Grid>
    </form>
  );
};