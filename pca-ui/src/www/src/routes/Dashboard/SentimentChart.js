import { Line } from "react-chartjs-2";
import { colours } from "./colours";
import { useTranslation } from 'react-i18next';

export const SentimentChart = ({ data = {}, speakerOrder = {} }) => {
  const { t } = useTranslation();
  const options = {
    aspectRatio: 1.7,
    scales: {
      xAxes: {
        display: true,
        title: { text: t("charts.callQuarter"), display: true },
      },
  
      yAxes: {
        display: true,
        min: -5,
        max: 5,
        title: { text: t("charts.score"), display: true },
        ticks: {
          callback: (value) => (value % 5 === 0 ? value : null),
        },
      },
    },
    legend: {
      display: true,
    },
    title: {
      text: "Call Sentiment over time",
      display: true,
      position: "bottom",
    },
    plugins: {
      legend: {
        onClick: null,
        labels :{
          padding:10,
          boxWidth:30
        },
      },
    },
  };

  return (
    <Line
      aria-label="This is a chart showing speaker and caller sentiment by quartile."
      data={{
        labels: ["Q1", "Q2", "Q3", "Q4"],
        datasets: Object.keys(data).map((speakerId) => {
          return {
            label: (data?.[speakerId]?.NameOverride ? data?.[speakerId]?.NameOverride : speakerOrder[speakerId] ),
            backgroundColor: colours[speakerId],
            borderColor: colours[speakerId],
            fill: false,
            spanGaps: true,
            tension: 0.5,
            data: (data?.[speakerId]?.SentimentPerQuarter || []).map(
              (part, i) => {
                return part.Score;
              }
            ),
          };
        }),
      }}
      options={options}
    />
  );
};


