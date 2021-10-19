import Smile from "../images/smile.png";
import Frown from "../images/frown.png";
import Neutral from "../images/neutral.png";

export const SentimentIcon = ({ score }) => {
  let icon;
  let alt;
  if (score > 0) {
    icon = Smile;
    alt = "positive sentiment";
  } else if (score < 0) {
    icon = Frown;
    alt = "negative sentiment";
  } else {
    alt = "neutral sentiment";
    icon = Neutral;
  }
  return (
    <img
      src={icon}
      alt={alt}
      style={{ display: "inline", width: "2rem", marginRight: "1rem" }}
    />
  );
};
