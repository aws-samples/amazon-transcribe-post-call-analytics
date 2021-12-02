import { colours } from "./colours";
import { Bar } from "react-chartjs-2";

export const LoudnessChart = ({ data, caller }) => {

  const interruptions = data
    .filter((d) => d.interruption)
    .map((d) => ({ y: d.interruption, x: d.x }));

  return (
    <Bar
      data={{
        labels: data.map((i) => i.x),
        datasets: [
          {
            label: "Loudness",
            data: data,
            backgroundColor: colours[caller],
            borderColor: colours[caller],
            barThickness: 20,
            order: 1,
          },
          {
            data: interruptions,
            label: "Interruption",
            backgroundColor: "rgba(252,232,83,0.6)",
            skipNull: true,
            type: "bar",
            barThickness: 30,
            order: 1,
          },
        ],
      }}
      options={{
        scales: {
          x: {
            stacked: true,
            display: true,
            position: "left",
            title: { text: "Minute", display: true },
          },

          y: {
            display: true,
            stacked: false,
            position: "left",
            title: { text: "Decibels", display: true },
          },
        },
        plugins: { legend: { display: false } },
      }}
    />
  );
};
