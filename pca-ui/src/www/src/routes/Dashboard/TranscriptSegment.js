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
      <span style={{ color: "#808080" }}>
        {name} -{" "}
        <span
          data-currenttime={segmentStart}
          onClick={onClick}
          style={{
            color: "cadetblue",
            cursor: "pointer",
          }}
        >
          {Formatter.Time(segmentStart)}
        </span>
      </span>
      <p>{text}</p>
    </Col>
  </Row>
);
