import { Line } from "react-chartjs-2";
import { colours } from "./colours";

export const SentimentChart = ({ data = {}, speakerOrder = {} }) => {
  return (
    <Line
      data={{
        labels: [1, 2, 3, 4],
        datasets: Object.keys(data).map((speakerId) => {
          return {
            label: speakerOrder[speakerId],
            backgroundColor: colours[speakerOrder[speakerId]],
            borderColor: colours[speakerOrder[speakerId]],
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

const options = {
  scales: {
    xAxes: {
      display: true,
      title: { text: "Quarter", display: true },
    },

    yAxes: {
      display: true,
      min: -5,
      max: 5,
      title: { text: "Score", display: true },
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
    },
  },
};
