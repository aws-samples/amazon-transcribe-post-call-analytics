import { Line } from "react-chartjs-2";

export const SentimentChart = ({ data, speakerOrder }) => {
  function ColourMap(keys, s, l) {
    s = s || 100;
    l = l || 50;

    const start = 45;
    const range = 315;

    let out = {};

    keys.forEach((key, i) => {
      out[key] = `hsl(${Math.floor(
        start + (i * range) / keys.length
      )}, ${s}%, ${l}%)`;
    });

    return out;
  }

  const colours = ColourMap(["Agent", "Caller"]);
  // Find first and last utterances from each speaker
  let first = {};
  let last = {};

  Object.keys(speakerOrder).forEach((speaker) => {
    data.SpeechSegments.forEach((part, i) => {
      if (part.SegmentSpeaker === speaker) {
        if (first[speaker] == null) {
          first[speaker] = i;
        }

        last[speaker] = i;
      }
    });
  });

  return (
    <Line
      data={{
        labels: data.SpeechSegments.map((part) => {
          return Math.floor(part.SegmentStartTime);
        }),

        datasets: Object.keys(speakerOrder).map((speaker) => {
          return {
            label: speakerOrder[speaker],
            borderColor: colours[speakerOrder[speaker]],
            fill: false,
            spanGaps: true,
            data: data.SpeechSegments.map((part, i) => {
              if (part.SegmentSpeaker !== speaker) {
                return null;
              }

              if (part.SentimentIsPositive) {
                return part.SentimentScore;
              }

              if (part.SentimentIsNegative) {
                return -part.SentimentScore;
              }

              if (i === first[speaker] || i === last[speaker]) {
                return 0;
              }

              return null;
            }),
          };
        }),
      }}
      option={options}
    />
  );
};

const options = {
  scales: {
    xAxes: [
      {
        display: false,
      },
    ],
    yAxes: [
      {
        display: true,
      },
    ],
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
