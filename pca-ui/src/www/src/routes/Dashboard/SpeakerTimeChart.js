import { Bar } from "react-chartjs-2";
import { colours } from "./colours";
import { Formatter } from "../../format";

export const SpeakerTimeChart = ({ data = {}, speakerOrder = {} }) => {
  const options = {
    scales: {
      y: {
        stacked: true,
        ticks: {
          beginAtZero: true,
          callback: (value, index) => `${Formatter.Percentage(value)}`,
        },
      },
      x: {
        stacked: true,
        display: false,
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) =>
            `${context.dataset.label} ${Formatter.Percentage(
              context.parsed.y
            )}`,
        },
      },
    },
  };

  const totalTime = Object.values(data).reduce(
    (prev, curr) => curr.TotalTimeSecs + prev,
    0
  );

  return (
    <Bar
      data={{
        labels: ["Proportion speaking"],
        datasets: Object.keys(data).map((speakerId) => ({
          label: speakerOrder[speakerId],
          data: [data[speakerId].TotalTimeSecs / totalTime],
          backgroundColor: colours[speakerOrder[speakerId]],
        })),
      }}
      options={options}
    ></Bar>
  );
};
