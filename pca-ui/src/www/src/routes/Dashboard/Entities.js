import { ValueWithLabel } from "../../components/ValueWithLabel";
import { Tag } from "../../components/Tag";
import "./Entities.css";

export const Entities = ({ data }) => {
  return data.length ? (
    data.map((e, i) => (
      <ValueWithLabel key={i} label={<span>{toSentenceCase(e.Name)}</span>}>
        {e.Values.map((x) => (
          <Tag
            className="me-2 mb-1"
            color={`var(--entity-${e.Name.toLowerCase()}`}
          >
            {x}
          </Tag>
        ))}
      </ValueWithLabel>
    ))
  ) : (
    <p>No entities detected</p>
  );
};

const toSentenceCase = (word) => {
  if (!word) {
    return "";
  }
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
};
