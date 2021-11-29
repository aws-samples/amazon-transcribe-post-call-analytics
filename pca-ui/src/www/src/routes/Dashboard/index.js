import { useState, useEffect } from "react";
import { useParams } from "react-router";
import useSWR from "swr";
import { get, swap } from "../../api/api";
import { Formatter } from "../../format";
import { TranscriptSegment } from "./TranscriptSegment";
import { Entities } from "./Entities";
import { ValueWithLabel } from "../../components/ValueWithLabel";
import { SentimentIcon } from "../../components/SentimentIcon";
import { Placeholder } from "../../components/Placeholder";
import { TrendIcon } from "../../components/TrendIcon";
import { Button, Card, Col, Row, Stack } from "react-bootstrap";
import { SentimentChart } from "./SentimentChart";
import { ListItems } from "./ListItems";
import { useDangerAlert } from "../../hooks/useAlert";

import "./dashboard.css";
import { VisuallyHidden } from "../../components/VisuallyHidden";
import { SpeakerTimeChart } from "./SpeakerTimeChart";
import { getEntityColor } from "./colours";

const Sentiment = ({ score, trend }) => {
  return (
    <span className="d-flex gap-2 align-items-center">
      Sentiment: <SentimentIcon score={score} />
      Trend: <TrendIcon trend={trend} />
    </span>
  );
};

const getSentimentTrends = (d, target, labels) => {
  const id = Object.entries(labels).find(([_, v]) => v === target)?.[0];
  if (!id) return {};
  return d?.ConversationAnalytics?.SentimentTrends[id];
};

function Dashboard({ setAlert }) {
  const { key } = useParams();

  const { data, error } = useSWR(`/get/${key}`, () => get(key));
  const isTranscribeCallAnalyticsMode =
    data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
      ?.TranscribeApiType === "analytics";

  useDangerAlert(error, setAlert);

  const [speakerLabels, setSpeakerLabels] = useState({
    NonTalkTime: "Silence",
  });

  useEffect(() => {
    const labels = data?.ConversationAnalytics?.SpeakerLabels || [];
    labels.map(({ Speaker, DisplayText }) => {
      console.log({ Speaker, DisplayText });
      return setSpeakerLabels((s) => ({ ...s, [Speaker]: DisplayText }));
    });
  }, [data]);

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

  const setAudioCurrentTime = (e) => {
    const a = document.getElementsByTagName("audio")[0];
    a.currentTime = e.target.dataset.currenttime;
  };

  const callDetailColumn = [
    {
      label: "Timestamp",
      value: (d) => d?.ConversationAnalytics?.ConversationTime.substring(0, 19),
    },
    { label: "Guid", value: (d) => d?.ConversationAnalytics?.GUID },
    { label: "Agent", value: (d) => d?.ConversationAnalytics?.Agent },
    {
      label: "Call Duration",
      value: (d) => Formatter.Time(d.ConversationAnalytics.Duration),
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
      value: (d) => (
        <Sentiment
          score={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentScore}
          trend={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentChange}
        />
      ),
    },
    {
      label: "Customer Sentiment",
      value: (d) => (
        <Sentiment
          score={
            getSentimentTrends(d, "Customer", speakerLabels)?.SentimentScore
          }
          trend={
            getSentimentTrends(d, "Customer", speakerLabels)?.SentimentChange
          }
        />
      ),
    },
  ];

  const transcribeDetailColumn = [
    {
      label: "Type",
      value: (d) =>
        isTranscribeCallAnalyticsMode
          ? "Transcribe Call Analytics"
          : "Transcribe",
    },
    {
      label: "Job Id",
      value: (d) => (
        <div className="text-break">
          {
            d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
              ?.TranscriptionJobName
          }
        </div>
      ),
    },
    {
      label: "File Format",
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaFormat,
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
  ];

  return (
    <Stack direction="vertical" gap={4}>
      <div>
        <h3 className="d-inline">Contact Summary</h3>
        <Button onClick={swapAgent} className="float-end">
          Swap Agent/Caller
        </Button>
      </div>
      <div className="d-flex  gap-2 flex-wrap flex-lg-nowrap">
        <Card className="call-details-col flex-fill flex-lg-nofill">
          <Card.Header>Call Details</Card.Header>
          <Card.Body>
            <Row>
              <Col>
                {callDetailColumn.map((entry, j) => (
                  <ValueWithLabel key={j} label={entry.label}>
                    {!data && !error ? (
                      <Placeholder />
                    ) : (
                      entry.value(data) || "-"
                    )}
                  </ValueWithLabel>
                ))}
              </Col>
            </Row>
          </Card.Body>
        </Card>
        <Card className="transcribe-col flex-fill flex-lg-nofill flex-grow-1">
          <Card.Header>Transcribe Details</Card.Header>
          <Card.Body>
            <Row>
              <Col>
                {transcribeDetailColumn.map((entry, i) => (
                  <ValueWithLabel key={i} label={entry.label}>
                    {!data && !error ? (
                      <Placeholder />
                    ) : (
                      entry.value(data) || "-"
                    )}
                  </ValueWithLabel>
                ))}
              </Col>
            </Row>
          </Card.Body>
        </Card>
        <Card className="flex-grow-1 charts flex-fill flex-lg-nofill">
          <Card.Body>
            <Row>
              <Col>
                <div>
                  <h5 className="text-muted">Sentiment</h5>
                  <SentimentChart
                    data={data?.ConversationAnalytics?.SentimentTrends}
                    speakerOrder={speakerLabels}
                  />
                </div>
                <div>
                  <h5 className="text-muted">Speaker Time</h5>
                  <SpeakerTimeChart
                    data={Object.entries(
                      data?.ConversationAnalytics?.SpeakerTime || {}
                    ).map(([key, value]) => ({
                      value: value.TotalTimeSecs,
                      label: speakerLabels[key],
                    }))}
                    speakerOrder={speakerLabels}
                  />
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </div>
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
      {isTranscribeCallAnalyticsMode && (
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
      )}
      {isTranscribeCallAnalyticsMode && (
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
      )}
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
                name={speakerLabels[s.SegmentSpeaker]}
                segmentStart={s.SegmentStartTime}
                text={s.DisplayText}
                onClick={setAudioCurrentTime}
                highlightLocations={s.EntitiesDetected.map((e) => ({
                  start: e.BeginOffset,
                  end: e.EndOffset,
                  fn: (match, key) => (
                    <span
                      key={key}
                      className={`highlight`}
                      style={{
                        "--highlight-colour": getEntityColor(e.Type),
                      }}
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
