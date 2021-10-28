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
}) => {
  const t = highlightLocations.reduceRight(
    (accumulator, { start, end, fn }, i) =>
      replaceAt(accumulator, start, end, fn),
    text
  );
  return (
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
        <div>
          {highlightLocations.length
            ? highlightLocations.reduceRight(
                (accumulator, { start, end, fn }, i) =>
                  replaceAt(accumulator, start, end, fn),
                text
              )
            : text}
        </div>
      </Col>
    </Row>
  );
};

export const helper = (string, beginOffset, endOffset, fn) => {
  let before = string.slice(0, beginOffset);
  let after = string.slice(endOffset);

  const target = string.slice(beginOffset, endOffset);
  const replaced = fn(target);
  return [before, replaced, after].flat();
};

const replaceAt = (input, ...opts) => {
  if (!Array.isArray(input)) input = [input];

  return input
    .map((chunk) =>
      typeof chunk === "string" ? helper(chunk, ...opts) : chunk
    )
    .flat();
};
