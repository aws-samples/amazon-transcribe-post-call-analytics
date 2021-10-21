import { SentimentIcon } from "../../components/SentimentIcon";
import { Formatter } from "../../format";
import { Col, Row } from "react-bootstrap";

export const TranscriptSegment = ({
  name,
  segmentStart,
  text,
  onClick,
  highlightLocations,
  highlightFunc,
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
      <p>{text}</p>
    </Col>
  </Row>
);
