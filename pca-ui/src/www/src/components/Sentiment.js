import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";
import { useTranslation } from 'react-i18next';

export const Sentiment = ({ score, trend }) => {
  const { t } = useTranslation();

  return (
    <span className="d-flex gap-2 align-items-center">
      {t("sentiment")} <SentimentIcon score={score} />
      {t("trend")} <TrendIcon trend={trend} />
    </span>
  );
};
