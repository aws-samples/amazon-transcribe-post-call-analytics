// Accuracy graph for posterity
/*
var ctx = document.getElementById("detail_accuracyGraph").getContext("2d");
if(accuracyGraph != null) {
    accuracyGraph.destroy();
}

accuracyGraph = new Chart(ctx, {
    // The type of chart we want to create
    type: "scatter",

    // The data for our dataset
    data: {
        datasets: speakers.map((speaker, i) => {
            return {
                label: speaker,
                //backgroundColor: colours[i],
                borderColor: colours[i],
                data: data.SpeechSegments.reduce((out, part) => {
                    if(part.SegmentSpeaker == speaker) {
                        part.WordConfidence.forEach(word => {
                            out.push({
                                x: part.SegmentStartTime,
                                y: word.Confidence
                            });
                        });
                    }

                    return out;
                }, []),
            };
        })
    },

    options: {
        scales: {
            xAxes: [{
                type: "linear",
                position: "bottom",
                scaleLabel: {
                    labelString: "Time (seconds)",
                    display: true
                }
            }],

            yAxes: [{
                scaleLabel: {
                    labelString: "Accuracy",
                    display: true
                }
            }]
        },

        title: {
            text: "Accuracy During Transcription",
            display: true
        }
    }
});
*/
