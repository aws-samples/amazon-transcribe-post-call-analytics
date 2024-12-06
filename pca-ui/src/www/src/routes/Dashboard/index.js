import { useState, useEffect, Fragment, useRef } from "react";
import { useParams } from "react-router";
import useSWR, { useSWRConfig } from "swr";
import { get, genaiquery, swap, genairefresh } from "../../api/api";
import { Formatter } from "../../format";
import { TranscriptSegment } from "./TranscriptSegment";
import { Entities } from "./Entities";
import { ValueWithLabel } from "../../components/ValueWithLabel";
import { Placeholder } from "../../components/Placeholder";
import { Tag } from "../../components/Tag";
import { SentimentChart } from "./SentimentChart";
import { LoudnessChart } from "./LoudnessChart";
import { ComprehendSentimentChart } from "./ComprehendSentimentChart";
import { SpeakerTimeChart } from "./SpeakerTimeChart";
import { ListItems } from "./ListItems";
import { useDangerAlert } from "../../hooks/useAlert";
import "./dashboard.css";
import { getEntityColor } from "./colours";
import { TranscriptOverlay } from "./TranscriptOverlay";
import { range } from "../../util";
import { Sentiment } from "../../components/Sentiment";
import { ChatInput } from "../../components/ChatInput";
import { Button, ContentLayout, Spinner, Link, Header, Grid, Container, SpaceBetween, Input, FormField, TextContent } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

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
    sentimentScore: segment.SentimentScore,
    silence: (segment.LoudnessScores[i] === 0 ? true : false)
  }));
};

const createSentimentData = (segment) => {
  const start = Math.floor(segment.SegmentStartTime);
  const end = Math.floor(segment.SegmentEndTime);
  const r = range(start, end);
  return r.map((item, i) => ({
    x: item,
    y: (segment.SentimentIsNegative === 1 ? segment.SentimentScore * -1 : segment.SentimentScore)
  }));
}

function Dashboard({ setAlert }) {
  const { key } = useParams();
  const { mutate } = useSWRConfig();
  const audioElem = useRef();
  const transcriptElem = useRef();

  const { t } = useTranslation();

  const { data, error } = useSWR(`/get/${key}`, () => get(key), {
    revalidateIfStale: true,
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
  const [comprehendSentimentData, setComprehendSentimentData] = useState({});

  const [isSwapping, setIsSwapping] = useState(false);

  const [genAiQueries, setGenAiQueries] = useState([]);
  const [genAiQuery, setGenAiQuery] = useState("");
  const [genAiQueryStatus, setGenAiQueryStatus] = useState(false);

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

    /*setGenAiQueries(
      (data?.ConversationAnalytics?.GenAiQuery ?
        Object.entries(data?.ConversationAnalytics?.GenAiQuery).map(([key, value]) => {
          return {
            label: key,
            value: (value instanceof Array ? value.join(', ') : value)
          }
        }) : [])
    );*/
  }, [data]);
  
  useEffect(() => {
    const loudness = {};

    if (isTranscribeCallAnalyticsMode) {
      // TCA mode
      let interruptions = [];
      let silence = [];
      let positive = [];
      let negative = [];
      let neutral = [];
      let nonSilence = [];

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
          nonSilence[item.x.toString()] = sentimentItem;
        });

      });
      
      // generate the rest of the silence
      if (data) {
        const r = range(0, parseInt(data?.ConversationAnalytics.Duration));
        r.map((item, i) => {
          if (!(i in nonSilence)) {
            silence = silence.concat({ x: i, y: 100 });
          }
        });
      }

      loudness['Interruptions'] = interruptions;
      loudness['NonTalkTime'] = silence;
      loudness['Positive'] = positive;
      loudness['Neutral'] = neutral;
      loudness['Negative'] = negative;
    } else {
      // this is transcribe standard
      Object.keys(speakerLabels).forEach(key => {
        if (key.indexOf('spk_') >= 0) {
          let keyLoudness = (data?.SpeechSegments || [])
          .filter((segment) => segment.SegmentSpeaker === key)
          .map(createSentimentData)
          .flat();
          console.log('keyloudness', keyLoudness);
          loudness[key] = keyLoudness;
        }
      });
    }
    console.log('Loudness', loudness);
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
  
  const getElementByIdAsync = id => new Promise(resolve => {
    const getElement = () => {
      const element = document.getElementById(id);
      if(element) {
        resolve(element);
      } else {
        requestAnimationFrame(getElement);
      }
    };
    getElement();
  });

  const scrollToBottomOfChat = async () => {
    const chatDiv = await getElementByIdAsync("chatDiv");
    chatDiv.scrollTop = chatDiv.scrollHeight + 200;
  }

  const submitQuery = (query) => {
    if (genAiQueryStatus === true) {
      return;
    }

    setGenAiQueryStatus(true);
    
    let responseData = {
      label: query,
      value: '...'
    }
    const currentQueries = genAiQueries.concat(responseData);
    setGenAiQueries(currentQueries);
    scrollToBottomOfChat(); 

    let query_response = genaiquery(key, query);
    query_response.then((data) => {
      const queries = currentQueries.map(query => {
        if (query.value !== '...') {
          return query;
        } else {
          return {
            label: query.label,
            value: data.response
          }
        }
      });
      setGenAiQueries(queries);
      scrollToBottomOfChat();
    });
    setGenAiQueryStatus(false);
  }

  const SummaryRefresh = () => {
    const [disabled, setDisabled] = useState(false);

    const onSubmit = async (e) => {
      e.preventDefault();
      setDisabled(true);
      await genairefresh(key);
      setDisabled(false);
      mutate(`/get/${key}`);

      return true;
    }

    return (
        <form onSubmit={onSubmit} style={{marginTop:"10px"}}>
          <Grid gridDefinition={[{ colspan: { default: 12, xxs: 9 } }, { default: 12, xxs: 3 }]}>
            {disabled ? <Spinner size="big" variant="disabled"/> : <Button disabled={disabled} iconName="refresh" variant="normal" ariaLabel="refresh">
            </Button>}
          </Grid>
        </form>
    );
  };

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
      label: t("contactTable.timestamp"),
      value: (d) => d?.ConversationAnalytics?.ConversationTime.substring(0, 19),
    },
    { label: t("contactTable.guid"), value: (d) => d?.ConversationAnalytics?.GUID },
    { label: t("contactTable.agent"), value: (d) => d?.ConversationAnalytics?.Agent },
    {
      label: t("contactTable.callDuration"),
      value: (d) => Formatter.Time(d.ConversationAnalytics.Duration),
    },
    {
      label: t("contactTable.entityRecognizer"),
      value: (d) => d?.ConversationAnalytics?.EntityRecognizerName,
    },
    {
      label: t("contactTable.language"),
      value: (d) =>
          usedCustomLanguageModel
            ? d?.ConversationAnalytics?.LanguageCode + " [" +
              d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo?.CLMName + "]"
            : d?.ConversationAnalytics?.LanguageCode
    },
    {
      label: t("contactTable.agentSentiment"),
      value: (d) => (
        <Sentiment
          score={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentScore}
          trend={getSentimentTrends(d, "Agent", speakerLabels)?.SentimentChange}
        />
      ),
    },
    {
      label: t("contactTable.customerSentiment"),
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
      label: t("transcribeDetail.type"),
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
      label: t("transcribeDetail.jobId"),
      value: (d) => (
        <div key='jobIdKey' className="text-break">
          {
            d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
              ?.TranscriptionJobName
          }
        </div>
      ),
    },
    {
      label: t("transcribeDetail.fileFormat"),
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaFormat,
    },
    {
      label: t("transcribeDetail.sampleRate"),
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.MediaSampleRateHertz,
    },
    {
      label: t("transcribeDetail.piiRedaction"),
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.RedactedTranscript === true
          ? t("enabled")
          : t("disabled"),
    },
    {
      label: t("transcribeDetail.vocabulary"),
      value: (d) =>
        d?.ConversationAnalytics?.SourceInformation[0]?.TranscribeJobInfo
          ?.VocabularyName,
    },
    {
      label: t("transcribeDetail.vocabularyFilter"),
      value: (d) =>
        d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
          ?.VocabularyFilter,
    },
    {
      label: t("transcribeDetail.averageConfidence"),
      value: (d) =>
        Formatter.Percentage(
          d.ConversationAnalytics.SourceInformation[0]?.TranscribeJobInfo
            ?.AverageWordConfidence
        ),
    },
  ];

  let genAiSummary = (data?.ConversationAnalytics?.Summary ?
    Object.entries(data?.ConversationAnalytics?.Summary).map(([key, value]) => {
      return {
        label: data?.ConversationAnalytics?.SummaryKeyValue[key] || key,
        value: (value instanceof Array ? value.join(', ') : value)
      }
    }) : []);

    let VOCSummary = (data?.ConversationAnalytics?.VOCSummary ?
      Object.entries(data?.ConversationAnalytics?.VOCSummary).map(([key, value]) => {
        
      return {
        label: data?.ConversationAnalytics?.SummaryKeyValue[key] || key,
        value: (value instanceof Array ? value.join(', ') : value)
      }
      }) : []);
  
  if (data?.ConversationAnalytics?.ContactSummary?.AutoGenerated?.OverallSummary?.Content) {
    // we also have a TCA summary
    genAiSummary = [{
      label: "Contact Summary",
      value: data?.ConversationAnalytics?.ContactSummary?.AutoGenerated?.OverallSummary?.Content
    }].concat(genAiSummary)
  };
  
  const tcaSummary = (data?.ConversationAnalytics?.ContactSummary?.AutoGenerated?.OverallSummary?.Content ?? "");

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
    return <div key='issuesTab' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {data?.ConversationAnalytics?.IssuesDetected?.length > 0 ? 
        data?.ConversationAnalytics?.IssuesDetected?.map((issue, j) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "yellow",
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            {issue.Text}
          </Tag>
        )) : <div tag='no-issue' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>No issues detected.</div>
      }
    </div>
  }
  const actionItemsTab = () => {
    return <div key='actionItemsTab' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {data?.ConversationAnalytics?.ActionItemsDetected?.length > 0 ? 
      data?.ConversationAnalytics?.ActionItemsDetected?.map(
        (actionItem, j) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "LightPink",
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            {actionItem.Text}
          </Tag>
        )
      ) : <div tag='no-action-items' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>No action items detected.</div>
    }
    </div>
  }

  const outcomesTab = () => {
    return <div key='outcomesTab' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      {data?.ConversationAnalytics?.OutcomesDetected?.length > 0 ?
        data?.ConversationAnalytics?.OutcomesDetected?.map(
        (outcome, j ) => (
          <Tag key={j}
            style={{
              "--highlight-colour": "Aquamarine",
              fontFamily: 'Helvetica, Arial, sans-serif'
            }}
          >
            {outcome.Text}
          </Tag>
        )
      ): <div tag='no-outcomes' style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>No outcomes detected.</div>
    }
    </div>
  }

  
  return (
    <ContentLayout 
    header={
      <Header
          variant="h2"
          actions={[
            <Button key='swapAgent' onClick={swapAgent} disabled={isSwapping} className="float-end">
              {isSwapping ? t("swapping") : t("swapAgent")}
            </Button>
          ]}
      >
        <span id="header-text">{t("callDetail")}</span>
      </Header>
    }>
    <Grid
        gridDefinition={
          (
            window.pcaSettings.genai.query && isTranscribeCallAnalyticsMode ?
            [
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
            ] : !window.pcaSettings.genai.query && isTranscribeCallAnalyticsMode ?
            [
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
            ] : window.pcaSettings.genai.query && !isTranscribeCallAnalyticsMode ?
            [
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
            ] : [
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 4, m: 4, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 6, m: 6, default: 12 } },
              { colspan: { l: 12, m: 12, default: 12 } },
            ]
          )}
      >

        <Container
          fitHeight={true}
          header={
            <Header variant="h2" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
              {t("callMetadata")}
            </Header>
          }
        >
          <SpaceBetween size="m" style={{ fontFamily: 'Helvetica' }}>
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
              {t("transcribeDetail.title")}
            </Header>
          }
        >
          <SpaceBetween size="m">
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
        <Container
          header={
            <Header variant="h2">
              {t("callSentiment")}
            </Header>
          }>
            <SentimentChart
              data={data?.ConversationAnalytics?.SentimentTrends}
              speakerOrder={speakerLabels}
            />
            <Header variant="h2">{t("speakerTime")}</Header>
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
        {isTranscribeCallAnalyticsMode && (
          <Container
            header={
              <Header variant="h2">
                Loudness/Sentiment
              </Header>
            }
          >
            {!loudnessData && !error ? (
              <div key='noSpeakers'>No Speakers</div>
            ) : (
              <LoudnessChart loudnessData={loudnessData} speakerLabels={speakerLabels} />
            )}
          </Container>
        )}
        {!isTranscribeCallAnalyticsMode && (
          <Container
            header={
              <Header variant="h2">
                {t("comprehendSentiment")}
              </Header>
            }
          >
            {!loudnessData && !error ? (
              <div key='noSpeakers'>No Speakers</div>
            ) : (
              <ComprehendSentimentChart comprehendSentimentData={loudnessData} speakerLabels={speakerLabels} />
            )}
          </Container>
        )}
        <Container 
          fitHeight={true}
          header={
            <Header variant="h2">
              {t("entities")}
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
              {t("genaiInsights")}
              <SpaceBetween direction="horizontal" size="xs">
                <SummaryRefresh/>
              </SpaceBetween>
            </Header>
          }

        >
          <SpaceBetween size="m">
            {genAiSummary.length > 0 ? genAiSummary.map((entry, i) => (
              <ValueWithLabel key={i} label={entry.label}>
                { entry.value }
              </ValueWithLabel>
            )) : <ValueWithLabel key='nosummary'>No Summary Available</ValueWithLabel>}
          </SpaceBetween>
        </Container>
      {/* modified to include TCA summary */}
       <Container
          fitHeight={true}
          header={
            <Header variant="h2">
              {t("VOCInsights")}
              <SpaceBetween direction="horizontal" size="xs">
                <SummaryRefresh/>
              </SpaceBetween>
            </Header>
          }
        >
          <SpaceBetween size="m">
            {VOCSummary.length > 0 ? VOCSummary.map((entry, i) => (
              <ValueWithLabel key={i} label={entry.label}>
                { entry.value }
              </ValueWithLabel>
            )) : <ValueWithLabel key='nosummary'>No Summary Available</ValueWithLabel>}
          </SpaceBetween>
        </Container>

        {isTranscribeCallAnalyticsMode && (
          <Container
            fitHeight={false}
            header={
                <Header variant="h2">
                  {t("callSummary")}
                </Header>
            }
            
          >
          <div style={{ minHeight: '38em', fontFamily: 'Helvetica, Arial, sans-serif' }}>
            {!data && !error ? (
                <h4 style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>No summary available.</h4>
              ) : (
                  <SpaceBetween size="l">
                  <ValueWithLabel key='outcomes' label="Outcomes" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                    {issuesTab()}
                    </ValueWithLabel>
                    <ValueWithLabel key='outcomes' label="Outcomes" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                    {actionItemsTab()}
                    </ValueWithLabel>
                    <ValueWithLabel key='outcomes' label="Outcomes" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                    {outcomesTab()}
                    </ValueWithLabel>
                  </SpaceBetween>
              )}
            </div>
        </Container>
        )}
        
        {window.pcaSettings.genai.query && (
          <Container
            fitHeight={false}
            style={{ maxWidth: "100%!important" }}

            header={
              <Header variant="h2">
                {t("genaiQuery")}
              </Header>
            }
            /* For future use. :) */
            footer={
              <ChatInput submitQuery={submitQuery} />
            }
          >
            <div id="chatDiv" style={{overflow: "hidden", overflowY:'auto', height:'30em'}}>
              <SpaceBetween size="m">
                {genAiQueries.length > 0 ? genAiQueries.map((entry, i) => (
                  <ValueWithLabel key={i} index={i} label={entry.label}>
                      {entry.value === '...' ? <div style={{height:'30px'}}><Spinner/></div> : entry.value}
                    </ValueWithLabel>
                )) : <ValueWithLabel key='nosummary'>{t("question")}</ValueWithLabel>}
              </SpaceBetween>
            </div>
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
                      key='audoiElem'
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
              {t("transcript")}
            </Header>
        }>
          <div ref={transcriptElem}>
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
          )}</div>
        </Container>
      </Grid>
    </ContentLayout>

  );
}

export default Dashboard;
