import { useState, useEffect, Fragment, useRef } from "react";
import { useParams } from "react-router";
import useSWR, { useSWRConfig } from "swr";
import { get, swap } from "../../api/api";
import { Formatter } from "../../format";
import { TranscriptSegment } from "./TranscriptSegment";
import { Entities } from "./Entities";
import { ValueWithLabel } from "../../components/ValueWithLabel";
import { Placeholder } from "../../components/Placeholder";
import { Tag } from "../../components/Tag";
import { Button, Card, Col, Row, Stack } from "react-bootstrap";
import { SentimentChart } from "./SentimentChart";
import { LoudnessChart } from "./LoudnessChart";
import { SpeakerTimeChart } from "./SpeakerTimeChart";
import { ListItems } from "./ListItems";
import { useDangerAlert } from "../../hooks/useAlert";
import "./dashboard.css";
import { getEntityColor } from "./colours";
import { TranscriptOverlay } from "./TranscriptOverlay";
import { range } from "../../util";
import { Sentiment } from "../../components/Sentiment";
import { Tabs, Tab } from "react-bootstrap";

const getSentimentTrends = (d, target, labels) => {
  const id = Object.entries(labels).find(([_, v]) => v === target)?.[0];
  if (!id) return {};
  return d?.ConversationAnalytics?.SentimentTrends[id];
};

const createLoudnessData = (segment) => {
  const start = Math.floor(segment.SegmentStartTime);
  const end = Math.floor(segment.SegmentEndTime);
  const r = range(start, end);
  return r.map((item, i) => ({
    x: item,
    y: segment.LoudnessScores[i],
    interruption: segment.SegmentInterruption && item === start ? 100 : null,
  }));
};

function Dashboard({ setAlert }) {
  const { key } = useParams();
  const { mutate } = useSWRConfig();
  const audioElem = useRef();
  const transcriptElem = useRef();

  const { data, error } = useSWR(`/get/${key}`, () => get(key), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
  const isTranscribeCallAnalyticsMode =
    data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
      ?.TranscribeApiType === "analytics";

  useDangerAlert(error, setAlert);

  const [speakerLabels, setSpeakerLabels] = useState({
    NonTalkTime: "Silence",
  });

  const [isSwapping, setIsSwapping] = useState(false);

  const getValueFor = (input) =>
    Object.entries(speakerLabels).find(([_, label]) => label === input)?.[0];

  useEffect(() => {
    const labels = data?.ConversationAnalytics?.SpeakerLabels || [];
    labels.map(({ Speaker, DisplayText }) => {
      return setSpeakerLabels((s) => ({ ...s, [Speaker]: DisplayText }));
    });
  }, [data]);

  const agentLoudness = (data?.SpeechSegments || [])
    .filter((segment) => segment.SegmentSpeaker === getValueFor("Agent"))
    .map(createLoudnessData)
    .flat();

  const customerLoudness = (data?.SpeechSegments || [])
    .filter((segment) => segment.SegmentSpeaker === getValueFor("Customer"))
    .map(createLoudnessData)
    .flat();

  const swapAgent = async () => {
    try {
      setIsSwapping(true);
      await swap(key);
      mutate(`/get/${key}`);
    } catch (err) {
      console.error(err);
      setAlert({
        heading: "Something went wrong",
        variant: "danger",
        text: "Unable to swap agent. Please try again later",
      });
    } finally {
      setIsSwapping(false);
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

  const audioEndTimestamps = (data?.SpeechSegments || [])
  .map(({WordConfidence}) => WordConfidence)
  .flat()
  .reduce((accumulator, item) => ([...accumulator, item.EndTime]),[]);

  const onAudioPLayTimeUpdate = () => {
    let elementEndTime = undefined;
    for (let i = 0; i < audioEndTimestamps.length; i++) {
      if (audioElem.current.currentTime < audioEndTimestamps[i]) {
        elementEndTime = audioEndTimestamps[i];
        break;
      }
    }

    [...transcriptElem.current.getElementsByClassName('playing')].map(elem => elem.classList?.remove("playing"));
    transcriptElem.current.querySelector('span[data-end="'+elementEndTime+'"]')?.classList?.add("playing");
  };

  return (
    <Stack direction="vertical" gap={4}>
      <div>
        <h3 className="d-inline">Call Details </h3>
        <Button onClick={swapAgent} disabled={isSwapping} className="float-end">
          {isSwapping ? "Swapping..." : "Swap Agent/Caller"}
        </Button>
      </div>
      <div className="d-flex gap-2 flex-wrap flex-lg-nowrap">
        <Card className="call-details-col">
          <Card.Header>Record Details</Card.Header>
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
        <Card className="transcribe-col">
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
        <Card className="charts">
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
                      channel: key
                    }))}
                    speakerOrder={speakerLabels}
                  />
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </div>
      {data?.ConversationAnalytics?.CombinedAnalyticsGraph ? (
        <Card>
          {!data && !error ? (
            <Placeholder />
          ) : (
            <img
              src={data?.ConversationAnalytics.CombinedAnalyticsGraph}
              alt="Chart displaying the loudness of the agent and customer over time (available with Transcribe Call Analytics only)"
            ></img>
          )}
        </Card>
      ) : null}
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
          <Card.Header>Summary</Card.Header>
          <Card.Body>
            {!data && !error ? (
              <Placeholder />
            ) : (
              <Tabs>
                  { data?.ConversationAnalytics?.IssuesDetected? (
                    <Tab title="Issues" eventKey="Issues" className="pt-4">
                      {data?.ConversationAnalytics?.IssuesDetected?.map(
                          (issue, j) => (
                            <Tag key={j}
                              style={{
                                "--highlight-colour": "yellow",
                              }}
                            >
                              {issue.Text}
                            </Tag>
                          )
                        )}
                    </Tab>
                  ) : 
                    (<Fragment/>)
                  }
                  { data?.ConversationAnalytics?.ActionItemsDetected? (
                    <Tab title="Action Items"  eventKey="ActionItems" className="pt-4">
                      {data?.ConversationAnalytics?.ActionItemsDetected?.map(
                          (actionItem, j) => (
                            <Tag key={j}
                              style={{
                                "--highlight-colour": "LightPink",
                              }}
                            >
                              {actionItem.Text}
                            </Tag>
                          )
                      )}
                    </Tab>
                    ) : (<Fragment/>)
                  }
                  {data?.ConversationAnalytics?.OutcomesDetected? (
                    <Tab title="Outcomes" eventKey="Outcomes" className="pt-4">
                      {data?.ConversationAnalytics?.OutcomesDetected?.map(
                        (outcome, j ) => (
                          <Tag key={j}
                            style={{
                              "--highlight-colour": "Aquamarine",
                            }}
                          >
                            {outcome.Text}
                          </Tag>
                        )
                      )}
                  </Tab>
                  ) : (<Fragment/>)}
              </Tabs>
              
            )}
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Header className="sticky-top pt-3 bg-light">
          <div className="d-inline-flex pb-3">Transcript</div>
          {data && (
            <audio
              ref={audioElem}
              className="float-end"
              controls
              src={
                data?.ConversationAnalytics?.SourceInformation[0]
                  ?.TranscribeJobInfo?.MediaFileUri
              }
              onTimeUpdate={onAudioPLayTimeUpdate}
            >
              Your browser does not support the
              <code>audio</code> element.
            </audio>
          )}
        </Card.Header>
        <Card.Body className="pt-4" ref={transcriptElem}>
          {!data && !error ? (
            <Placeholder />
          ) : (
            (data?.SpeechSegments || []).map((s, i) => (
              <TranscriptSegment
                key={i}
                name={speakerLabels[s.SegmentSpeaker]}
                allSegments={s?.WordConfidence || []}
                segmentStart={s.SegmentStartTime}
                text={s.DisplayText}
                onClick={setAudioCurrentTime}
                highlightLocations={[
                  ...s.EntitiesDetected.map((e) => ({
                    start: e.BeginOffset,
                    end: e.EndOffset,
                    fn: (match, key, start, end, offsetStart, offsetEnd) => (
                      <TranscriptOverlay
                        key={key}
                        colour={getEntityColor(e.Type)}
                        visuallyHidden={`Entity - ${e.Type}`}
                        data-start={start}
                        data-end={end}
                        data-offset-start={offsetStart}
                        data-offset-end={offsetEnd}
                        content={match}
                        type={""}
                        entityOffsetStart={e.BeginOffset}
                        entityOffsetEnd={e.EndOffset}
                        entityClass={"text-danger"}
                        addType={offsetStart === e.BeginOffset ? true : false}
                      >
                      </TranscriptOverlay>
                    ),
                  })),
                  ...(s.IssuesDetected? s.IssuesDetected?.map((issue) => ({
                    start: issue.BeginOffset,
                    end: issue.EndOffset,
                    fn: (match, key, start, end, offsetStart, offsetEnd) => (
                      <TranscriptOverlay
                        key={key}
                        colour="#ffff00"
                        tooltip="Issue"
                        data-start={start}
                        data-end={end}
                        data-offset-start={offsetStart}
                        data-offset-end={offsetEnd}
                        content={match}
                        type={"Issue"}
                        entityOffsetStart={issue.BeginOffset}
                        entityOffsetEnd={issue.EndOffset}
                        entityClass={"text-danger"}
                        addType={offsetStart === issue.BeginOffset ? true : false}
                      >
                      </TranscriptOverlay>
                    ),
                  })) : []),
                  ...(s.ActionItemsDetected? s.ActionItemsDetected?.map((issue) => ({
                    start: issue.BeginOffset,
                    end: issue.EndOffset,
                    fn: (match, key, start, end, offsetStart, offsetEnd) => (
                      <TranscriptOverlay
                        key={key}
                        colour="lightpink"
                        tooltip="Action Item"
                        data-start={start}
                        data-end={end}
                        data-offset-start={offsetStart}
                        data-offset-end={offsetEnd}
                        content={match}
                        type={"Action Item"}
                        entityOffsetStart={issue.BeginOffset}
                        entityOffsetEnd={issue.EndOffset}
                        entityClass={"text-danger"}
                        addType={offsetStart === issue.BeginOffset ? true : false}
                      >
                      </TranscriptOverlay>
                    ),
                  })) : []),
                  ...(s.OutcomesDetected? s.OutcomesDetected?.map((issue) => ({
                    start: issue.BeginOffset,
                    end: issue.EndOffset,
                    fn: (match, key, start, end, offsetStart, offsetEnd) => (
                      <TranscriptOverlay
                        key={key}
                        colour="aquamarine"
                        tooltip="Outcome"
                        data-start={start}
                        data-end={end}
                        data-offset-start={offsetStart}
                        data-offset-end={offsetEnd}
                        content={match}
                        type={"Outcome"}
                        entityOffsetStart={issue.BeginOffset}
                        entityOffsetEnd={issue.EndOffset}
                        entityClass={"text-danger"}
                        addType={offsetStart === issue.BeginOffset ? true : false}
                      >
                      </TranscriptOverlay>
                    ),
                  })) : []),
                ]}
                score={s.SentimentIsPositive - s.SentimentIsNegative}
                interruption={s.SegmentInterruption}
                ivr={s?.IVRSegment || false}
                categoryList={s.CategoriesDetected}
              />
            ))
          )}
        </Card.Body>
      </Card>
    </Stack>
  );
}

export default Dashboard;
