import { SentimentIcon } from "../../components/SentimentIcon";
import { Formatter } from "../../format";
import { Badge } from "react-bootstrap";

export const TranscriptSegment = ({
  name,
  segmentStart,
  text,
  onClick,
  highlightLocations,
  score,
  interruption,
  aboveText,
  allSegments,
  idx,
  hmode  
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
      <div>{hmode && applyReplacements(text, highlightLocations)}</div>
      <div>{!hmode && getSpansForSegment(allSegments, idx)}</div>
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

const getSpansForSegment = (allSegments, key) => {
  const flag = allSegments?.length && allSegments[0]?.WordConfidence?.length
  if (!flag) {
    return
  }
  let start = 0
  if (key > 0){
    for (let i = 0; i < key; i++){
      start += allSegments[i]['WordConfidence'].length
    }
  }
  let spans = []
  for (const segItem of allSegments[key]?.WordConfidence) {
    spans.push(segItem?.Text)
  }
  return spans.map((w, i) => {
    return <span className="ap-word" id={`ts${start + i}`}>{w + ' '}</span>
  })
}