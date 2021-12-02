import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";

export const Sentiment = ({ score, trend }) => {
  return (
    <span className="d-flex gap-2 align-items-center">
      Sentiment: <SentimentIcon score={score} />
      Trend: <TrendIcon trend={trend} />
    </span>
  );
};
