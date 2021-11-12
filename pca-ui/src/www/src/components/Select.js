import ReactSelect from "react-select";

export const Select = ({ options, onChange }) => {
  return <ReactSelect options={options} onChange={onChange} />;
};
