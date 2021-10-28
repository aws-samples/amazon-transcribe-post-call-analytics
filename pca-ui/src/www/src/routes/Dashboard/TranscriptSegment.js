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
      {highlightLocations.map(({ start, end, fn }) =>
        replaceAt(text, start, end, fn)
      )}
    </Col>
  </Row>
);

export const replaceAt = (string, beginOffset, endOffset, fn) => {
  let before = string.slice(0, beginOffset);
  let after = string.slice(endOffset);

  const target = string.slice(beginOffset, endOffset);
  const replaced = fn(target);
  return [before, replaced, after];
};
