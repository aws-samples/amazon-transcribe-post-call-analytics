import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { get } from "../api/api";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";

// TODO
// * Add rest of overview
// * Add entities
// * Add Transcipts

const ValueWithLabel = ({ label, children }) => (
  <div className="mb-3">
    <h5 className="mb-1" color="text-label">
      {label}
    </h5>
    <div>{children}</div>
  </div>
);

const TranscriptSegment = ({ name, segmentStart, text }) => (
  <div>
    <span>
      {name} - {segmentStart}
    </span>
    <p>{text}</p>
  </div>
);
function Dashboard() {
  const { key } = useParams();

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [speakerOrder, setSpeakerOrder] = useState({
    spk_0: "Agent",
    spk_1: "Caller",
  });

  useEffect(() => {
    const getData = async () => {
      try {
        const d = await get(key);
        setData(d);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    getData();
  }, [key]);

  const firstCol = [
    {
      label: "Timestamp",
      value: (d) => d.ConversationAnalytics?.ConversationTime,
    },
    {
      label: "Entity Recognizer Name",
      value: (d) => "TODO",
    },
    {
      label: "Language Code",
      value: (d) => d.ConversationAnalytics?.LanguageCode,
    },
    {
      label: "Agent Sentiment",
      value: (d) => "TODO",
    },
    {
      label: "Customer Sentiment",
      value: (d) => "TODO",
    },
  ];

  const secondCol = [
    { label: "Type", value: (d) => "TODO" },
    { label: "Job Name", value: (d) => key },
    {
      label: "File Format",
      value: (d) =>
        d.data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaFormat,
    },

    { label: "Call Duration", value: (d) => "TODO" },

    {
      label: "Sample Rate",
      value: (d) =>
        d.data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaSampleRateHertz,
    },

    { label: "Custom Vocabulary", value: (d) => "TODO" },
    {
      label: "Word Accuracy",
      value: (d) =>
        d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
          ?.AverageAccuracy,
    },
    {
      label: "Accuracy",
      value: (d) =>
        d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
          ?.AverageAccuracy,
    },
  ];

  return (
    <div>
      <h3>Dashboard</h3>
      <Stack direction="vertical" gap={4}>
        <Card>
          <Card.Body>
            <Container>
              <Card.Title>Overview</Card.Title>
              <Row>
                <Col>
                  {firstCol.map((entry, i) => (
                    <ValueWithLabel key={i} label={entry.label}>
                      {loading ? (
                        <Spinner size="sm" animation="border" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </Spinner>
                      ) : (
                        entry.value(data)
                      )}
                    </ValueWithLabel>
                  ))}
                </Col>

                <Col>
                  {secondCol.map((entry, i) => (
                    <ValueWithLabel key={i} label={entry.label}>
                      {loading ? (
                        <Spinner size="sm" animation="border" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </Spinner>
                      ) : (
                        entry.value(data)
                      )}
                    </ValueWithLabel>
                  ))}
                </Col>
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
              {(data?.SpeechSegments || []).map((s, i) => (
                <TranscriptSegment
                  key={i}
                  name={speakerOrder[s.SegmentSpeaker]}
                  segmentStart={s.SegmentStartTime}
                  text={s.DisplayText}
                />
              ))}
            </Card.Text>
          </Card.Body>
        </Card>
      </Stack>
    </div>
  );
}

export default Dashboard;
