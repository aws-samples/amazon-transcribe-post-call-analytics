import * as util from "./util.js";

const positiveThreshold = 0.6;
const negativeThreshold = 0.4;

const colours = util.ColourMap(["Agent", "Caller"]);

const ctx = util.Get("detail_sentimentGraph").getContext("2d");

let sentimentGraph;

export default function (data, speakers) {
    // Sentiment graph
    if (sentimentGraph !== undefined) {
        sentimentGraph.destroy();
    }

    // Find first and last utterances from each speaker
    let first = {};
    let last = {};

    Object.keys(speakers).forEach((speaker) => {
        data.SpeechSegments.forEach((part, i) => {
            if (part.SegmentSpeaker == speaker) {
                if (first[speaker] == null) {
                    first[speaker] = i;
                }

                last[speaker] = i;
            }
        });
    });

    sentimentGraph = new Chart(ctx, {
        // The type of chart we want to create
        type: "line",

        // The data for our dataset
        data: {
            labels: data.SpeechSegments.map((part) => {
                return Math.floor(part.SegmentStartTime);
            }),

            datasets: Object.keys(speakers).map((speaker) => {
                return {
                    label: speakers[speaker],
                    borderColor: colours[speakers[speaker]],
                    fill: false,
                    spanGaps: true,
                    data: data.SpeechSegments.map((part, i) => {
                        if (part.SegmentSpeaker != speaker) {
                            return null;
                        }

                        if (part.SentimentIsPositive) {
                            return part.SentimentScore;
                            //return 2 * ((1-(1-part.SentimentScore)/(1 - positiveThreshold))*0.5);
                        }

                        if (part.SentimentIsNegative) {
                            return -part.SentimentScore;
                            //return 2 * ((1-part.SentimentScore)/(1 - negativeThreshold)*0.5-0.5);
                        }

                        if (i == first[speaker] || i == last[speaker]) {
                            return 0;
                        }

                        return null;
                    }),
                };
            }),
        },

        options: {
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
        },
    });
}
