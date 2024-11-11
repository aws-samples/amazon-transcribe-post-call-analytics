import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";
import { useTranslation } from 'react-i18next';

export const Sentiment = ({ score, trend }) => {
  const { t } = useTranslation();
  const iconStyle = { verticalAlign: "bottom", marginRight: "4px", width: '28px', height: '28px'  };

  return (
    <span className="d-flex gap-2 align-items-center">
      {t("sentiment")} <SentimentIcon score={score} style={iconStyle}/>
      {t("trend")} <TrendIcon trend={trend} style={{ verticalAlign: "bottom" }}/>
    </span>
  );
};
