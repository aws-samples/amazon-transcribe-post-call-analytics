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
            borderColor: colours[speakerOrder[speakerId]],
            fill: false,
            spanGaps: true,
            data: data[speakerId]?.SentimentPerQuarter.map((part, i) => {
              return part.Score;
            }),
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
};
