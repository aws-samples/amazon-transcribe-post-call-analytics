import { Tag } from "../../components/Tag";
import { Tabs, Tab } from "react-bootstrap";
import "./Entities.css";

export const Entities = ({ data }) => {
  return data.length ? (
    <Tabs defaultActiveKey={data[0].Name}>
      {data.map((e, i) => (
        <Tab title={toSentenceCase(e.Name)} eventKey={e.Name} className="pt-2">
          {e.Values.map((x, j) => (
            <Tag
              key={j}
              className="me-2 mb-1"
              color={`var(--entity-${e.Name.toLowerCase()}`}
            >
              {x}
            </Tag>
          ))}
        </Tab>
      ))}
    </Tabs>
  ) : (
    <p>No entities detected</p>
  );
};

const toSentenceCase = (word) => {
  if (typeof word !== "string") {
    return "";
  }

  if (word.length <= 1) {
    return word.toUpperCase();
  }

  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
};
