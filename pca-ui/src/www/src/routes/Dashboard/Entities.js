import { Badge, ListGroup, Tab, Tabs } from "react-bootstrap";

export const Entities = ({ data }) => (
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
        <ListGroup variant="flush">
          {e.Values.map((v, i) => (
            <ListGroup.Item key={i}>
              <p>{v}</p>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Tab>
    ))}
  </Tabs>
);
