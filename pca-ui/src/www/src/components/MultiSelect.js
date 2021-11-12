import React, { useState } from "react";
import Select from "react-select";

export const MultiSelect = ({ options, onChange }) => {
  const [selected, setSelected] = useState([]);

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
    />
  );
};
