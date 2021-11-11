import { Bar } from "react-chartjs-2";
import { colours } from "./colours";
export const SpeakerTimeChart = ({ data = {}, speakerOrder = {} }) => {
  const options = {
    scales: {
      y: {
        stacked: true,
        ticks: {
          beginAtZero: true,
        },
      },
      x: {
        stacked: true,
        display: false,
      },
    },
  };

  const totalTime = Object.values(data).reduce(
    (prev, curr) => curr.TotalTimeSecs + prev,
    0
  );

  console.log(totalTime);

  return (
    <Bar
      data={{
        labels: ["Test"],
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
