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

// TODO
// * Display type
// * Add graph

// highlightAt takes a string to highlight and an array of location objects that
// describe the startOffset, endOffset and highlight style for that span
// Assumes location array is in ascending offset order.
const highlightAt = (text, locations) => {
  console.log(locations);
  return locations.reverse().reduce((t, loc) => {
    const ret = `${t.slice(
      0,
      loc.start
    )}<span style="border: solid red">${t.slice(
      loc.start,
      loc.end + 1
    )}</span>${t.slice(loc.end)}`;
    console.log(ret);
    return ret;
  }, text);
};

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

  if (error) {
    console.error(error);
    setAlert({
      variant: "danger",
      text: "Unable to load data. Please try again later",
    });
  }

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
      value: (d) => Formatter.Time(d.ConversationAnalytics.Duration),
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
      label: "Word Accuracy",
      value: (d) =>
        Formatter.Percentage(
          d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
            ?.AverageAccuracy
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
      <Card>
        <Card.Body>
          <Card.Title>Overview</Card.Title>
          <Row>
            <Col>
              {firstCol.map((entry, i) => (
                <ValueWithLabel key={i} label={entry.label}>
                  {!data && !error ? <Placeholder /> : entry.value(data) || "-"}
                </ValueWithLabel>
              ))}
            </Col>

            <Col>
              {secondCol.map((entry, i) => (
                <ValueWithLabel key={i} label={entry.label}>
                  {!data && !error ? <Placeholder /> : entry.value(data) || "-"}
                </ValueWithLabel>
              ))}
            </Col>
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
        <Card.Body>
          <Card.Title>Entities</Card.Title>
          {!data && !error ? (
            <Placeholder />
          ) : (
            <Entities data={data?.ConversationAnalytics?.CustomEntities} />
          )}
        </Card.Body>
      </Card>
      <Card>
        <Card.Body className="pt-0">
          <Card.Title className="sticky-top pt-3 pb-3 bg-white">
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
          </Card.Title>

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
                  style: "red",
                }))}
                highlightFunc={highlightAt}
                score={s.SentimentIsPositive - s.SentimentIsNegative}
              />
            ))
          )}
        </Card.Body>
      </Card>
    </Stack>
  );
}

export default Dashboard;
