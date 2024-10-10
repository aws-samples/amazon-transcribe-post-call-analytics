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
    <form onSubmit={onSubmit}>
      <Grid gridDefinition={[{ colspan: { default: 12, xxs: 9 } }, { default: 12, xxs: 3 }]}>
        <Input
          placeholder={t("chatInputPlaceholder")}
          onChange={({ detail }) => setInputQuery(detail.value)}
          value={inputQuery}
        />
          <Button type="submit">
          {t("submit")}
          </Button>
      </Grid>
    </form>
  );
};