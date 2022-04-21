import { SentimentIcon } from "../../components/SentimentIcon";
import { Formatter } from "../../format";
import { Badge } from "react-bootstrap";

const getTranscriptDetails = (allSegments) => {
  let offsetStartValue = 0;
  let offsetEndValue = 0;
  return allSegments.reduce((accumulator, item) => {
    if(item?.EndOffsetMillis) {
      offsetStartValue = offsetEndValue === 0 ? offsetEndValue : offsetEndValue + 1;
      offsetEndValue = offsetStartValue + item?.Content.length;
      
      accumulator =[...accumulator,{content: item.Content, start:item.BeginOffsetMillis/1000, end:item.EndOffsetMillis/1000, offsetStart: offsetStartValue, offsetEnd: offsetEndValue}];
    } else {
      offsetStartValue = offsetEndValue;
      offsetEndValue = offsetStartValue + item?.Content.length;

      accumulator =[...accumulator,{content: item.Content, start: null, end: null, offsetStart: offsetStartValue, offsetEnd: offsetEndValue}];
    }
    return accumulator;
  },[]);
}

const generateTranscriptElement = (text, allSegments, highlightLocations) => {
  if (!allSegments.length) {
    return applyReplacements(text, highlightLocations);
  }
  const transcript = getTranscriptDetails(allSegments);
  
  return  transcript.map((segment, i) => {
    const addHighlight = highlightLocations.filter(highlight => highlight.start === segment.offsetStart || highlight.end === segment.offsetEnd || (highlight.start <= segment.offsetStart && highlight.end >= segment.offsetEnd));
    const content = segment.content + (transcript[i+1]?.start === null ? "" : " " );
    const key = "segment-"+ segment.offsetStart;

    if(addHighlight.length) {
      return addHighlight[0].fn(content, key, segment.start, segment.end, segment.offsetStart, segment.offsetEnd);
    }
    return <span data-start={segment.start} data-end={segment.end} data-offset-start={segment.offsetStart} data-offset-end={segment.offsetEnd} key={key}>{content}</span>
  });
}

export const TranscriptSegment = ({
  name,
  allSegments,
  segmentStart,
  text,
  onClick,
  highlightLocations,
  score,
  interruption,
  aboveText,
}) => (
  <div className="mb-4 d-flex flex-row flex-nowrap gap-3">
    <div className="d-flex align-items-center">
      <SentimentIcon score={score} size="2em" />
    </div>
    <div className="flex-grow-1">
      <span className={"text-muted segment"}>
        {name} -{" "}
        <span
          className="audio-start"
          data-currenttime={segmentStart}
          onClick={onClick}
        >
          {Formatter.Time(segmentStart)}
        </span>
      </span>
      {interruption && (
        <Badge bg="warning" text="dark" className="ms-2">
          Interruption
        </Badge>
      )}
      {aboveText && <div>{aboveText}</div>}
      <div>{generateTranscriptElement(text, allSegments, highlightLocations)}</div>
    </div>
  </div>
);

// substituteAt replaces a subset of a string with the value of the fn provided.
// it returns an array containing string and react elements
const substituteAt = (input, beginOffset, endOffset, fn, key) => {
  let before = input.slice(0, beginOffset);
  let after = input.slice(endOffset);

  const target = input.slice(beginOffset, endOffset);
  const replaced = fn(target, key);
  return [before, replaced, after];
};

const wrapper = (input, ...opts) => {
  if (!Array.isArray(input)) input = [input];

  return input
    .map((chunk, i) =>
      typeof chunk === "string" && i === 0
        ? substituteAt(chunk, ...opts)
        : chunk
    )
    .flat();
};

// applyReplacements applies a series of string replacements to the input.
// each replacement should consist of a start offset, end offset and
// function that transforms the target string
// Substrings identified by start and end offsets cannot overlap
export const applyReplacements = (input, replacements) =>
  replacements
    .sort(sortFn)
    .reduceRight(
      (accumulator, { start, end, fn }, i) =>
        wrapper(accumulator, start, end, fn, i),
      input
    );

const sortFn = (a, b) => {
  if (a.start > b.start) return 1;
  if (a.start < b.start) return -1;
  return 0;
};
