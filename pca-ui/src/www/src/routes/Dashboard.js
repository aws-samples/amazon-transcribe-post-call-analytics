import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { get, swap } from "../api/api";
import { Percentage, Time } from "../format";

import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import Col from "react-bootstrap/Col";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Tabs from "react-bootstrap/Tabs";
import Tab from "react-bootstrap/Tab";
import ListGroup from "react-bootstrap/ListGroup";

import Smile from "../images/smile.png";
import Frown from "../images/frown.png";
import Neutral from "../images/neutral.png";

// TODO
// * Display type
// * Add graph

const ValueWithLabel = ({ label, children }) => (
  <div className="mb-3">
    <h5 className="mb-1" color="text-label">
      {label}
    </h5>
    <div>{children}</div>
  </div>
);

const TranscriptSegment = ({ name, segmentStart, text, onClick }) => (
  <div>
    <span style={{ color: "#808080" }}>
      {name} -{" "}
      <span
        data-currenttime={segmentStart}
        onClick={onClick}
        style={{
          color: "cadetblue",
          cursor: "pointer",
        }}
      >
        {Time(segmentStart)}
      </span>
    </span>
    <p>{text}</p>
  </div>
);

const Sentiment = ({ score }) => {
  let icon;
  let alt;
  if (score > 0) {
    icon = Smile;
    alt = "positive";
  } else if (score < 0) {
    icon = Frown;
    alt = "negative";
  } else {
    alt = "neutral";
    icon = Neutral;
  }
  return (
    <span>
      <img
        src={icon}
        alt={alt}
        style={{ display: "inline", width: "2rem", marginRight: "1rem" }}
      />
      {Percentage(score)}
    </span>
  );
};

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

  const swapAgent = async () => {
    try {
      const resp = await swap(key);
      window.location.reload(false);
    } catch (err) {
      console.error(err);
      setError(err);
    }
  };

  const getAverageSentiment = (d, target) => {
    const id = Object.entries(speakerOrder).find(([_, v]) => v === target);
    const targetObj = d?.ConversationAnalytics?.SentimentTrends.find(
      (s) => s.Speaker === id[0]
    );

    return targetObj?.AverageSentiment;
  };

  const setAudioCurrentTime = (e) => {
    const a = document.getElementsByTagName("audio")[0];
    a.currentTime = e.target.dataset.currenttime;
  };

  const firstCol = [
    {
      label: "Timestamp",
      value: (d) => d?.ConversationAnalytics?.ConversationTime,
    },
    { label: "Agent", value: (d) => d?.ConversationAnalytics?.Agent },
    {
      label: "Entity Recognizer Name",
      value: (d) => d?.ConversationAnalytics?.EntityRecognizerName,
    },
    {
      label: "Language Code",
      value: (d) => d?.ConversationAnalytics?.LanguageCode,
    },
    {
      label: "Agent Sentiment",
      value: (d) => <Sentiment score={getAverageSentiment(d, "Agent")} />,
    },
    {
      label: "Customer Sentiment",
      value: (d) => <Sentiment score={getAverageSentiment(d, "Caller")} />,
    },
  ];

  const secondCol = [
    { label: "Type", value: (d) => "TODO" },
    { label: "Guid", value: (d) => d?.ConversationAnalytics?.GUID },
    { label: "Job Id", value: (d) => key },
    {
      label: "File Format",
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaFormat,
    },

    {
      label: "Call Duration",
      value: (d) => Time(d.ConversationAnalytics.Duration),
    },

    {
      label: "Sample Rate",
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaSampleRateHertz,
    },

    {
      label: "Custom Vocabulary",
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.VocabularyName,
    },
    {
      label: "Vocabularly Filter",
      value: (d) =>
        d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
          ?.VocabularyFilter,
    },
    {
      label: "Word Accuracy",
      value: (d) =>
        Percentage(
          d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
            ?.AverageAccuracy
        ),
    },
  ];

  return (
    <Container>
      <Stack direction="vertical" gap={4}>
        <div>
          <h3 className="d-inline">Dashboard</h3>
          <Button onClick={swapAgent} className="float-end">
            Swap Agent/Caller
          </Button>
        </div>
        <Card>
          <Card.Body>
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
                      entry.value(data) || "-"
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
                      entry.value(data) || "-"
                    )}
                  </ValueWithLabel>
                ))}
              </Col>
              <Col></Col>
            </Row>
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Card.Title>Entities</Card.Title>
            {loading ? (
              <Spinner size="sm" animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            ) : (
              <Tabs
                defaultActiveKey={
                  data?.ConversationAnalytics?.CustomEntities[0].Name
                }
                id="entitities-tab-group"
                className="mb-3"
              >
                {data?.ConversationAnalytics?.CustomEntities.map((e, i) => (
                  <Tab
                    eventKey={e.Name}
                    title={
                      <span>
                        {e.Name}{" "}
                        <Badge bg="secondary" pill={true}>
                          {e.Count}
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
            )}
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Card.Title
              className="sticky-top"
              style={{
                marginBottom: "1rem",
                background: "white",
              }}
            >
              <div style={{ display: "inline-flex", paddingBottom: "1rem" }}>
                Transcript
              </div>
              {!loading && (
                <audio
                  style={{ float: "right" }}
                  controls
                  src={
                    data?.ConversationAnalytics?.SourceInformation[0]
                      ?.TranscribeJobInfo?.MediaFileUri
                  }
                >
                  Your browser does not support the
                  <code>audio</code> element.
                </audio>
              )}
            </Card.Title>

            {loading ? (
              <Spinner size="sm" animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            ) : (
              (data?.SpeechSegments || []).map((s, i) => (
                <TranscriptSegment
                  key={i}
                  name={speakerOrder[s.SegmentSpeaker]}
                  segmentStart={s.SegmentStartTime}
                  text={s.DisplayText}
                  onClick={setAudioCurrentTime}
                />
              ))
            )}
          </Card.Body>
        </Card>
      </Stack>
    </Container>
  );
}

export default Dashboard;
