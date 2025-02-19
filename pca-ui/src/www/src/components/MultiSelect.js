import React, { useState } from "react";
import Select from "react-select";
import { useTranslation } from 'react-i18next';

export const MultiSelect = ({ options, onChange }) => {
  const [selected, setSelected] = useState([]);
  const { t } = useTranslation();

  const handleChange = (event) => {
    setSelected(event);
    onChange(event.map((selected) => selected.value));
  };
  return (
    <Select
      isMulti
      options={options}
      value={selected}
      onChange={handleChange}
      placeholder={t("search.selectEntities")}
    />
  );
};
