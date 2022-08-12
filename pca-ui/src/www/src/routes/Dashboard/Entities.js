import { Tag } from "../../components/Tag";
import { Tabs, Tab } from "react-bootstrap";
import "./Entities.css";
import { getEntityColor } from "./colours";

export const Entities = ({ data }) => {
  return data.length ? (
    <Tabs defaultActiveKey={data[0].Name}>
      {data.map((e, i) => (
        <Tab title={toSentenceCase(e.Name)} eventKey={e.Name} className="pt-4" key={i}>
          {e.Values.map((x, j) => (
            <Tag
              key={j}
              className="me-2 mb-1"
              style={{ "--highlight-colour": getEntityColor(e.Name) }}
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
