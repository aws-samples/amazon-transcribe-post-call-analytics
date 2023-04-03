import { colours } from "./colours";
import { Bar } from "react-chartjs-2";
import { Placeholder } from "react-bootstrap";

const getRenderOrder = (key) => {
  console.log('order:', key);
  if (key === 'Interruptions') return 1;
  if (key.indexOf('Customer') >= 0) return 2;
  else return 10;
}

export const LoudnessChart = ({ loudnessData, speakerLabels }) => {
  if (loudnessData === undefined) {
    console.log("NO LOUDNESS DATA");
    return <Placeholder />
  } else {
    console.log("Loudness data:");
    console.log(loudnessData);
  }

  /*const interruptions = loudnessData[0]
    .filter((d) => d.interruption)
    .map((d) => ({ y: d.interruption, x: d.x }));*/

  const datasets = [];
  Object.keys(speakerLabels).map((key, index) => {
    console.log("Generating chart data for", key);
    if (key in loudnessData) {
      let dataset = {
        label: speakerLabels[key],
        data: loudnessData[key],
        backgroundColor: colours[key],
        borderColor: colours[key],
        /*barThickness: 1,*/
        barPercentage: 1.0,
        categoryPercentage: 1.0,
        /*borderSkipped: true,*/
        order: getRenderOrder(speakerLabels[key]),
        type: "bar",
        xAxisID:'x'
      }
      datasets.push(dataset);
    }
  });
  console.log("output of chart dataset:");
  console.log(datasets);

  return (
    <Bar
      height={60}
      data={{
        /*labels: Object.keys(speakerLabels),*/
        datasets: datasets,
        /*datasets: [
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
        ],*/
      }}
      options={{
        scales: {
          x: {
            type: "linear",
            stacked: true,
            offset: false,
            display: true,
            position: "left",
            title: { text: "Minute", display: true },
          },
          y: {
            display: true,
            stacked: false,
            offset: false,
            position: "left",
            title: { text: "Decibels", display: true },
          },
        },
        plugins: { legend: { display: true } },
      }}
    />
  );
};
