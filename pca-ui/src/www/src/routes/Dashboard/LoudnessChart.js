import { colours } from "./colours";
import { Bar } from "react-chartjs-2";

export const LoudnessChart = ({ data, caller }) => {
  return (
    console.log({ data }) || (
      <Bar
        data={{
          labels: data.map((i) => i.x),
          datasets: [
            {
              label: "Loudness",
              data: data,
              backgroundColor: colours[caller],
              borderColor: colours[caller],
            },
            {
              data: data
                .filter((d) => d.interruption)
                .map((d) => ({ y: d.interruption, x: d.x })),
              label: "interruption",
              backgroundColor: "yellow",
              skipNull: true,
              type: "bar",
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
    )
  );
};
