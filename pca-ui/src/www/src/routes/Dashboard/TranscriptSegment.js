import { SentimentIcon } from "../../components/SentimentIcon";
import { Formatter } from "../../format";
import { Col, Row } from "react-bootstrap";

export const TranscriptSegment = ({
  name,
  segmentStart,
  text,
  onClick,
  highlightLocations,
  score,
}) => (
  <Row>
    <Col sm={1} className="pt-2">
      <SentimentIcon score={score} />
    </Col>
    <Col>
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
      <div>{applyReplacements(text, highlightLocations)}</div>
    </Col>
  </Row>
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
// replacements should be ordered from lowest start offset to highest.
// Substrings identified by start and end offsets cannot overlap
export const applyReplacements = (input, replacements) =>
  replacements.reduceRight(
    (accumulator, { start, end, fn }, i) =>
      wrapper(accumulator, start, end, fn, i),
    input
  );
