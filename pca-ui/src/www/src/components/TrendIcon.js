import { FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { MdTrendingFlat } from "react-icons/md";

export const TrendIcon = ({ trend, size = "2.5em" }) => {
  if (trend >= 0.4) {
    return <FiTrendingUp color="green" size={size} />;
  }

  if (trend <= -0.4) {
    return <FiTrendingDown color="red" size={size} />;
  }
  return <MdTrendingFlat color="grey" size={size} />;
};
