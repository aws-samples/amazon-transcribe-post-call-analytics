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

  return (
    <Bar
      data={{
        labels: ["Test"],
        datasets: Object.keys(data).map((speakerId) => ({
          label: speakerOrder[speakerId],
          data: [data[speakerId].TotalTimeSecs],
          backgroundColor: colours[speakerOrder[speakerId]],
        })),
      }}
      options={options}
    ></Bar>
  );
};
