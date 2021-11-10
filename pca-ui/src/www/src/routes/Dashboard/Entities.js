import { Tab, Tabs } from "react-bootstrap";
import { ListItems } from "./ListItems";
import "./Entities.css";

const Box = ({ children, className }) => (
  <div className={`box ${className}`}>{children}</div>
);

export const Entities = ({ data }) =>
  data.length ? (
    <Tabs
      defaultActiveKey={data[0].Name}
      id="entitities-tab-group"
      className="mb-3"
    >
      {data.map((e, i) => (
        <Tab
          key={i}
          eventKey={e.Name}
          title={
            <span>
              {e.Name}{" "}
              <Box className={`ms-1 highlight ${e.Name.toLowerCase()}`}>
                {e.Instances}
              </Box>
            </span>
          }
        >
          <ListItems data={e.Values} />
        </Tab>
      ))}
    </Tabs>
  ) : (
    <p>No entities detected</p>
  );
