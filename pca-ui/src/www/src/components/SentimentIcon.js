import { FiSmile, FiMeh, FiFrown } from "react-icons/fi";

export const SentimentIcon = ({ score, size = "1.5em" }) => {
  if (score > 0) {
    return <FiSmile color="green" size={size} />;
  }

  if (score < 0) {
    return <FiFrown color="red" size={size} />;
  }

  return <FiMeh color="grey" size={size} />;
};
