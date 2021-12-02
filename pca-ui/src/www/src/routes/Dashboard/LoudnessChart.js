import { colours } from "./colours";
import { Bar } from "react-chartjs-2";

export const LoudnessChart = ({ data, caller }) => {
  return (
    <Bar
      data={{
        labels: data.map((i) => i.x),
        datasets: [
          {
            data: data,
            backgroundColor: colours[caller],
            borderColor: colours[caller],
          },
        ],
      }}
      options={{
        scales: {
          xAxes: {
            display: true,
            title: { text: "Minute", display: true },
          },

          yAxes: {
            display: true,
            title: { text: "Decibels", display: true },
          },
        },
        plugins: { legend: { display: false } },
      }}
    />
  );
};
