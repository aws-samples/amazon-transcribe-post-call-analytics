import React from "react";
import { useState } from "react";

import { Button,  Grid, Input } from '@cloudscape-design/components';

import { useTranslation } from 'react-i18next';

export const ChatInput = ({submitQuery}) => {
  const [inputQuery, setInputQuery] = useState("");
  const { t } = useTranslation();

  const onSubmit = (e) => {
    submitQuery(inputQuery);
    setInputQuery('');
    e.preventDefault();
    return true;
  }

  return (
    <form onSubmit={onSubmit} style={{ width: '100%', margin: '0 auto' }}>
      <Grid 
        gridDefinition={[
          { colspan: { default: 11, xxs: 11 } }, 
          { colspan: { default: 1, xxs: 1 } }
        ]}
        disableGutters={true}
      >
        <Input
          placeholder={t("chatInputPlaceholder")}
          onChange={({ detail }) => setInputQuery(detail.value)}
          value={inputQuery}
        />
        <Button type="submit" fullWidth>
          {t("submit")}
        </Button>
      </Grid>
    </form>
  );
};