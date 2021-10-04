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

import Smile from "../images/smile.png";
import Frown from "../images/frown.png";
import Neutral from "../images/neutral.png";

// TODO
// * Display type
// * Format Timestamp
// * Add graph

const ValueWithLabel = ({ label, children }) => (
  <div className="mb-3">
    <h5 className="mb-1" color="text-label">
      {label}
    </h5>
    <div>{children}</div>
  </div>
);

const TranscriptSegment = ({ name, segmentStart, text, primary }) => (
  <div>
    <span style={{ color: "#808080" }}>
      {name} - {Time(segmentStart)}
    </span>
    <p>{text}</p>
  </div>
);

const Entity = ({ type, count, color }) => {
  const colors = [
    "primary",
    "secondary",
    "success",
    "warning",
    "info",
    "light",
  ];

  const c = colors[color % colors.length];

  return (
    <Badge bg={c}>
      {type} x {count}
    </Badge>
  );
};

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

  const firstCol = [
    {
      label: "Timestamp",
      value: (d) => d?.ConversationAnalytics?.ConversationTime,
    },
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
    { label: "Job Name", value: (d) => key },
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
      label: "Word Accuracy",
      value: (d) =>
        Percentage(
          d?.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
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
              <Stack gap={2} direction="horizontal">
                {data?.ConversationAnalytics?.CustomEntities.map((e, i) => (
                  <Entity color={i} key={i} count={e.Count} type={e.Name} />
                ))}
              </Stack>
            )}
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Card.Title>
              Transcript
              {!loading && (
                <audio
                  className="float-end"
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
