import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { get } from "../api/api";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";

// TODO
// * Add rest of overview
// * Add entities
// * Add Transcipts

const ValueWithLabel = ({ label, children }) => (
  <div class="mb-3">
    <h5 class="mb-1" color="text-label">
      {label}
    </h5>
    <div>{children}</div>
  </div>
);

function Dashboard() {
  const { key } = useParams();

  const [data, setData] = useState({});

  useEffect(() => {
    const getData = async () => {
      const d = await get(key);
      setData(d);
    };
    getData();
  }, [key]);
  return (
    <div>
      <h3>Dashboard</h3>
      <h4>{key}</h4>

      <Stack direction="vertical" gap={4}>
        <Card>
          <Card.Body>
            <Container>
              <Card.Title>Overview</Card.Title>
              <Row>
                <Col>
                  <ValueWithLabel label={"Timestamp"}>
                    {data.ConversationAnalytics?.ConversationTime}
                  </ValueWithLabel>
                  <ValueWithLabel label={"Entity Recognizer Name"}>
                    TODO
                  </ValueWithLabel>
                  <ValueWithLabel label={"Entity Recognizer Name"}>
                    TODO
                  </ValueWithLabel>
                </Col>

                <Col></Col>
                <Col></Col>
              </Row>
            </Container>
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Card.Title>Entities</Card.Title>
            <Card.Text>
              Some quick example text to build on the card title and make up the
              bulk of the card's content.
            </Card.Text>
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Card.Title>Transcript</Card.Title>
            <Card.Text>
              Some quick example text to build on the card title and make up the
              bulk of the card's content.
            </Card.Text>
          </Card.Body>
        </Card>
      </Stack>
    </div>
  );
}

export default Dashboard;
