import { useState } from "react";
import { useParams } from "react-router";
import useSWR from "swr";
import { get, swap } from "../../api/api";
import { Formatter } from "../../format";
import { TranscriptSegment } from "./TranscriptSegment";
import { Entities } from "./Entities";
import { ValueWithLabel } from "../../components/ValueWithLabel";
import { SentimentIcon } from "../../components/SentimentIcon";
import { Placeholder } from "../../components/Placeholder";
import { Button, Card, Col, Row, Stack } from "react-bootstrap";
import { SentimentChart } from "./SentimentChart";
import { ListItems } from "./ListItems";
import { useDangerAlert } from "../../hooks/useAlert";

import "./dashboard.css";
import { VisuallyHidden } from "../../components/VisuallyHidden";

const Sentiment = ({ score }) => {
  return (
    <span>
      <SentimentIcon score={score} />
      {Formatter.Percentage(score)}
    </span>
  );
};

function Dashboard({ setAlert }) {
  const { key } = useParams();

  const { data, error } = useSWR(`/get/${key}`, () => get(key));

  useDangerAlert(error, setAlert);

  const [speakerOrder, setSpeakerOrder] = useState({
    spk_0: "Agent",
    spk_1: "Caller",
  });

  const swapAgent = async () => {
    try {
      await swap(key);
      window.location.reload(false);
    } catch (err) {
      console.error(err);
      setAlert({
        heading: "Something went wrong",
        variant: "danger",
        text: "Unable to swap agent. Please try again later",
      });
    }
  };

  const getSentimentScore = (d, target) => {
    const id = Object.entries(speakerOrder).find(([_, v]) => v === target)[0];
    const targetObj = d?.ConversationAnalytics?.SentimentTrends[id];
    return targetObj?.SentimentScore;
  };

  const setAudioCurrentTime = (e) => {
    const a = document.getElementsByTagName("audio")[0];
    a.currentTime = e.target.dataset.currenttime;
  };

  const callDetailColumns = [
    [
      {
        label: "Timestamp",
        value: (d) => d?.ConversationAnalytics?.ConversationTime,
      },
      { label: "Guid", value: (d) => d?.ConversationAnalytics?.GUID },
      { label: "Agent", value: (d) => d?.ConversationAnalytics?.Agent },
      {
        label: "Call Duration",
        value: (d) => Formatter.Time(d.ConversationAnalytics.Duration),
      },
    ],
    [
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
        value: (d) => <Sentiment score={getSentimentScore(d, "Agent")} />,
      },
      {
        label: "Customer Sentiment",
        value: (d) => <Sentiment score={getSentimentScore(d, "Caller")} />,
      },
    ],
  ];

  const transcribeDetailColumns = [
    [
      {
        label: "Type",
        value: (d) =>
          d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.TranscribeApiType === "analytics"
            ? "Transcribe Call Analytics"
            : "Transcribe",
      },
      {
        label: "Job Id",
        value: (d) =>
          d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.TranscriptionJobName,
      },
      {
        label: "File Format",
        value: (d) =>
          d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
            ?.MediaFormat,
      },
    ],
    [
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
        label: "Vocabulary Filter",
        value: (d) =>
          d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
            ?.VocabularyFilter,
      },
      {
        label: "Average Word Confidence",
        value: (d) =>
          Formatter.Percentage(
            d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
              ?.AverageWordConfidence
          ),
      },
    ],
  ];

  return (
    <Stack direction="vertical" gap={4}>
      <div>
        <h3 className="d-inline">Contact Summary</h3>
        <Button onClick={swapAgent} className="float-end">
          Swap Agent/Caller
        </Button>
      </div>
      <Card>
        <Card.Header>Call Details</Card.Header>
        <Card.Body>
          <Row>
            {callDetailColumns.map((col) => (
              <Col>
                {col.map((entry, i) => (
                  <ValueWithLabel key={i} label={entry.label}>
                    {!data && !error ? (
                      <Placeholder />
                    ) : (
                      entry.value(data) || "-"
                    )}
                  </ValueWithLabel>
                ))}
              </Col>
            ))}
          </Row>
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>Transcribe Details</Card.Header>
        <Card.Body>
          <Row>
            {transcribeDetailColumns.map((col) => (
              <Col>
                {col.map((entry, i) => (
                  <ValueWithLabel key={i} label={entry.label}>
                    {!data && !error ? (
                      <Placeholder />
                    ) : (
                      entry.value(data) || "-"
                    )}
                  </ValueWithLabel>
                ))}
              </Col>
            ))}
            <Col>
              <ValueWithLabel label="Sentiment Chart">
                <SentimentChart
                  data={data?.SpeechSegments}
                  speakerOrder={speakerOrder}
                />
              </ValueWithLabel>
            </Col>
          </Row>
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>Entities</Card.Header>
        <Card.Body>
          {!data && !error ? (
            <Placeholder />
          ) : (
            <Entities data={data?.ConversationAnalytics?.CustomEntities} />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>Categories</Card.Header>
        <Card.Body>
          {!data && !error ? (
            <Placeholder />
          ) : (
            <ListItems
              data={data?.ConversationAnalytics?.CategoriesDetected.map(
                (category) => category.Name
              )}
            />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header>Issues</Card.Header>
        <Card.Body>
          {!data && !error ? (
            <Placeholder />
          ) : (
            <ListItems
              data={data?.ConversationAnalytics?.IssuesDetected.map(
                (issue) => issue.Text
              )}
            />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Header className="sticky-top pt-3 bg-light">
          <div className="d-inline-flex pb-3">Transcript</div>
          {data && (
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
        </Card.Header>
        <Card.Body className="pt-4">
          {!data && !error ? (
            <Placeholder />
          ) : (
            (data?.SpeechSegments || []).map((s, i) => (
              <TranscriptSegment
                key={i}
                name={speakerOrder[s.SegmentSpeaker]}
                segmentStart={s.SegmentStartTime}
                text={s.DisplayText}
                onClick={setAudioCurrentTime}
                highlightLocations={s.EntitiesDetected.map((e) => ({
                  start: e.BeginOffset,
                  end: e.EndOffset,
                  fn: (match, key) => (
                    <span
                      key={key}
                      className={`highlight ${e.Type.toLowerCase()}`}
                    >
                      <VisuallyHidden>Entity - {e.Type}</VisuallyHidden>
                      {match}
                    </span>
                  ),
                }))}
                score={s.SentimentIsPositive - s.SentimentIsNegative}
                interruption={s.SegmentInterruption}
                aboveText={
                  s.CategoriesDetected.length ? (
                    <span className="text-muted">
                      {" "}
                      Categories Detetected: {s.CategoriesDetected}
                    </span>
                  ) : null
                }
              />
            ))
          )}
        </Card.Body>
      </Card>
    </Stack>
  );
}

export default Dashboard;
