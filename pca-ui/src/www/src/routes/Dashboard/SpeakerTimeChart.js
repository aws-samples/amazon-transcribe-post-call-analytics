import { Bar } from "react-chartjs-2";
import { colours } from "./colours";
import { Formatter } from "../../format";

export const SpeakerTimeChart = ({ data = [] }) => {
  const options = {
    aspectRatio: 1.5,
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
      legend: {
        onClick: null,
        labels :{
          padding:10,
          boxWidth:15
        },
      },
    },
  };

  const totalTime = Math.ceil(data.reduce((prev, curr) => curr.value + prev, 0));

  return (
    <Bar
      data={{
        labels: ["Proportion speaking"],
        datasets: data.map((entry) => ({
          label: entry.label,
          data: [entry.value / totalTime],
          backgroundColor: colours[entry.channel],
        })),
      }}
      options={options}
    ></Bar>
  );
};
