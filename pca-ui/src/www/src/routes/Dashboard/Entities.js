import { Badge, Tab, Tabs } from "react-bootstrap";
import { ListItems } from "./ListItems";

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
              <Badge bg="secondary" pill={true}>
                {e.Instances}
              </Badge>
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
