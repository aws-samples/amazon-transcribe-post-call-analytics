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
import { Button, ContentLayout, Link, Header, Grid, Container, SpaceBetween, Input, FormField, TextContent } from '@cloudscape-design/components';

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
    sentiment: (segment.SentimentIsNegative ? -5 : (segment.SentimentIsPositive && segment.LoudnessScores[i] > 0 ? 5 : 0)),
    silence: (segment.LoudnessScores[i] === 0 ? true : false)
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

  const hasTranscribeStreamingSession =
    data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
      ?.StreamingSession;

  const usedCustomLanguageModel =
    data?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
        ?.CLMName;

  useDangerAlert(error, setAlert);

  const [speakerLabels, setSpeakerLabels] = useState({});

  const [loudnessData, setLoudnessData] = useState({});

  const [isSwapping, setIsSwapping] = useState(false);

  const [genAiQuery, setGenAiQuery] = useState("");

  const getValueFor = (input) =>
    Object.entries(speakerLabels).find(([_, label]) => label === input)?.[0];

  useEffect(() => {
    const labels = data?.ConversationAnalytics?.SpeakerLabels || [];
    const newSpeakerLabels = {
      NonTalkTime: "Silence",
      Interruptions: "Interruptions",
      Positive: "Positive",
      Negative: "Negative",
      Neutral: "Neutral"
    };
    labels.map(({ Speaker, DisplayText }) => {
      newSpeakerLabels[Speaker] = DisplayText;
    });
    setSpeakerLabels(newSpeakerLabels);
  }, [data]);
  
  useEffect(() => {
    const loudness = {};
    let interruptions = [];
    let silence = [];
    let positive = [];
    let negative = [];
    let neutral = [];

    Object.keys(speakerLabels).forEach(key => {
      let keyLoudness = (data?.SpeechSegments || [])
      .filter((segment) => segment.SegmentSpeaker === key)
      .map(createLoudnessData)
      .flat();
      
      loudness[key] = keyLoudness;
      let newInterruptions = keyLoudness.filter((d) => d.interruption)
        .map((d) => ({ y: d.interruption, x: d.x }))
      interruptions = interruptions.concat(newInterruptions)

      let newSilence = keyLoudness.filter((d) => d.silence)
        .map((d) => ({ x: d.x, y: 100 }))
      silence = silence.concat(newSilence);

      keyLoudness.forEach((item) => {
        let sentimentItem = {
          x: item.x,
          y: 10,
          sentiment: item.sentiment
        };
        if (item.sentiment > 0) positive.push(sentimentItem)
        else if (item.sentiment < 0) negative.push(sentimentItem)
        else neutral.push(sentimentItem);
      });

    });
    loudness['Interruptions'] = interruptions;
    loudness['NonTalkTime'] = silence;
    loudness['Positive'] = positive;
    loudness['Neutral'] = neutral;
    loudness['Negative'] = negative;
    
    setLoudnessData(loudness);
  }, [speakerLabels])

  /*
  const agentLoudness = (data?.SpeechSegments || [])
    .filter((segment) => segment.SegmentSpeaker === getValueFor("Agent"))
    .map(createLoudnessData)
    .flat();

  const customerLoudness = (data?.SpeechSegments || [])
    .filter((segment) => segment.SegmentSpeaker === getValueFor("Customer"))
    .map(createLoudnessData)
    .flat();*/

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
      label: "Language Model",
      value: (d) =>
          usedCustomLanguageModel
            ? d?.ConversationAnalytics?.LanguageCode + " [" +
              d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo?.CLMName + "]"
            : d?.ConversationAnalytics?.LanguageCode
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
          ? hasTranscribeStreamingSession
            ? "Transcribe Streaming Call Analytics"
            : "Transcribe Call Analytics"
          : hasTranscribeStreamingSession
            ? "Transcribe Streaming"
            : "Transcribe"
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
      label: "PII Redaction",
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.RedactedTranscript === true
          ? "Enabled"
          : "Disabled"
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

  const onAudioPlayTimeUpdate = () => {
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

  const issuesTab = () => {
    return <div>
      {data?.ConversationAnalytics?.IssuesDetected?.length > 0 ? 
        data?.ConversationAnalytics?.IssuesDetected?.map((issue, j) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "yellow",
            }}
          >
            {issue.Text}
          </Tag>
        )) : <>No issues detected.</>
      }
    </div>
  }
  const actionItemsTab = () => {
    return <div>
      {data?.ConversationAnalytics?.ActionItemsDetected?.length > 0 ? 
      data?.ConversationAnalytics?.ActionItemsDetected?.map(
        (actionItem, j) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "LightPink",
            }}
          >
            {actionItem.Text}
          </Tag>
        )
        ) : <>No action items detected.</>
      }
    </div>
  }

  const outcomesTab = () => {
    return <div>
      {data?.ConversationAnalytics?.OutcomesDetected?.length > 0 ?
        data?.ConversationAnalytics?.OutcomesDetected?.map(
        (outcome, j ) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "Aquamarine",
            }}
          >
            {outcome.Text}
          </Tag>
        )
        ): <>No outcomes detected.</>
    }
    </div>
  }

  

  return (
    <ContentLayout 
    header={
      <Header
          variant="h1"
          actions={[
            <Button onClick={swapAgent} disabled={isSwapping} className="float-end">
              {isSwapping ? "Swapping..." : "Swap Agent/Caller"}
            </Button>
          ]}
        info={<Link variant="info" ariaLabel="Info goes here.">Info</Link>}>
          Call Details
      </Header>
    }>
    <Grid
      gridDefinition={[
        { colspan: { l: 4, m: 4, default: 12 } },
        { colspan: { l: 4, m: 4, default: 12 } },
        { colspan: { l: 4, m: 4, default: 12 } },
        { colspan: { l: 12, m: 12, default: 12 } },
        { colspan: { l: 6, m: 6, default: 12 } },
        { colspan: { l: 6, m: 6, default: 12 } },
        { colspan: { l: 6, m: 6, default: 12 } },
        { colspan: { l: 6, m: 6, default: 12 } },
        { colspan: { l: 12, m: 12, default: 12 } },
      ]}
      >

        <Container
          fitHeight={true}
          header={
            <Header variant="h2">
              Call Metadata
            </Header>
          }
        >
          <SpaceBetween size="l">
            {callDetailColumn.map((entry, j) => (
              <ValueWithLabel key={j} label={entry.label}>
                {!data && !error ? (
                  <Placeholder />
                ) : (
                  entry.value(data) || "-"
                )}
              </ValueWithLabel>
            ))}
          </SpaceBetween>
        </Container>
        <Container
          fitHeight={true}
          header={
            <Header variant="h2">
              Transcribe Details
            </Header>
          }
        >
          <SpaceBetween size="l">
            {transcribeDetailColumn.map((entry, i) => (
              <ValueWithLabel key={i} label={entry.label}>
                {!data && !error ? (
                  <Placeholder />
                ) : (
                  entry.value(data) || "-"
                )}
              </ValueWithLabel>
            ))}
          </SpaceBetween>
        </Container>
        <Container>
            <h2 className="text-muted">Sentiment</h2>
            <SentimentChart
              data={data?.ConversationAnalytics?.SentimentTrends}
              speakerOrder={speakerLabels}
            />
            <h2 className="text-muted">Speaker Time</h2>
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
        </Container>
        <Container
          header={
            <Header variant="h2">
              Loudness/Sentiment
            </Header>
          }
        >
          {!loudnessData && !error ? (
            <div>No Speakers</div>
          ) : (
              <LoudnessChart loudnessData={loudnessData} speakerLabels={speakerLabels} />
          )}
        </Container>
        <Container 
          fitHeight={true}
          header={
            <Header variant="h2">
              Entities
            </Header>
          }
        >
          {!data && !error ? (
            <Placeholder />
          ) : (
            <Entities data={data?.ConversationAnalytics?.CustomEntities} />
          )}
        </Container>

        {isTranscribeCallAnalyticsMode && (
          <Container
            fitHeight={true}
            header={
              <Header variant="h2">
                Categories
              </Header>
          }>
            {!data && !error ? (
              <Placeholder />
            ) : (
              <ListItems
                data={data?.ConversationAnalytics?.CategoriesDetected.map(
                  (category) => category.Name
                )}
              />
            )}
          </Container>
        )}
        
        <Container
          fitHeight={true}
          header={
            <Header variant="h2">
              GenAI Summary
            </Header>
          }
          footer={
            <Grid gridDefinition={[{ colspan: {default: 12, xxs: 9} }, {default: 12, xxs: 3}]}>
              <Input
              placeholder="Enter a question about the call."
              onChange={({ detail }) => setGenAiQuery(detail.value)}
              value={genAiQuery} />
              <Button>
                Submit
              </Button>
            </Grid>
          }
        >
          <TextContent>The caller called about their rewards card, and the agent looked up the information.</TextContent>
        </Container>
        {isTranscribeCallAnalyticsMode && (
          <Container
            
            fitHeight={true}
            header={
                <Header variant="h2">
                  Call Analytics Summary
                </Header>
            }
          >
            {!data && !error ? (
              <h4>No summary available.</h4>
            ) : (
                <SpaceBetween size="l">
                  <ValueWithLabel label="Issue">
                    {issuesTab()}
                  </ValueWithLabel>
                  <ValueWithLabel label="Action Items">
                    {actionItemsTab()}
                  </ValueWithLabel>
                  <ValueWithLabel label="Outcomes">
                    {outcomesTab()}
                  </ValueWithLabel>
                </SpaceBetween>
          )}
        </Container>
        )}
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween
                  direction="horizontal"
                  size="xs"
                >
                  {data && (
                    <audio
                      ref={audioElem}
                      className="float-end"
                      controls
                      src={
                        data?.ConversationAnalytics?.SourceInformation[0]
                          ?.TranscribeJobInfo?.MediaFileUri
                      }
                      onTimeUpdate={onAudioPlayTimeUpdate}
                    >
                      Your browser does not support the
                      <code>audio</code> element.
                    </audio>
                  )}
                </SpaceBetween>
              }
            >
              Transcript
            </Header>
        }>
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
        </Container>
      </Grid>
    </ContentLayout>

  );
}

export default Dashboard;
