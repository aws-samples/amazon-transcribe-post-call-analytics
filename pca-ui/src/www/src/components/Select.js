import ReactSelect from "react-select";

export const Select = ({ options, onChange, ...props }) => {
  return <ReactSelect options={options} onChange={onChange} {...props} />;
};
