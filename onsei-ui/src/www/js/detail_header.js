import * as format from "./format.js";
import * as util from "./util.js";

const link = util.Get("detail_link");
const loading = util.Get("audio_loading");
const audio = util.Get("audio");
const detail_sentiment = util.Get("detail_sentiment");

function audio_failed() {
    audio.style.display = "none";
    loading.style.display = "flex";
    loading.className = "";
    loading.innerHTML = "Audio not available";
}

audio.onerror = audio_failed;
link.onerror = audio_failed;

export default function (data, speakers) {
    const header = data.ConversationAnalytics;
    const source = header.SourceInformation[0].TranscribeJobInfo;

    // Heading
    util.Set("detail_jobName", source.TranscriptionJobName);
    util.Set("detail_language", header.LanguageCode);
    util.Set("detail_entity_recogniser", header.EntityRecognizerName);
    util.Set("detail_fileFormat", source.MediaFormat);
    util.Set("detail_sampleRate", source.MediaSampleRateHertz);
    util.Set(
        "detail_duration",
        format.Time(
            data.SpeechSegments.reduce((max, part) => {
                return Math.max(max, part.SegmentEndTime);
            }, 0)
        )
    );
    util.Set("detail_vocabulary", source.VocabularyName);
    util.Set(
        "detail_averageAccuracy",
        format.Percentage(source.AverageAccuracy)
    );
    util.Set("detail_parsed", format.Date(header.ConversationTime, header.ConversationLocation));

    // Audio control
    if (source.MediaFileUri != null) {
        audio.style.display = "flex";
        loading.style.display = "none";

        link.src = source.MediaFileUri;
        link.type = "audio/mpeg";

        audio.load();
    } else {
        audio_failed();
    }

    // Sentiment trends
    util.Set("detail_sentiment", "");
    header.SentimentTrends.forEach((trend) => {
        let tr = util.Make("tr");

        tr.appendChild(util.Make("th", `${speakers[trend.Speaker]} Sentiment`));

        let td = util.Make("td");

        let summary = "Overall ";

        // Average
        let avg = util.Make("img");
        avg.className = "icon";
        if (trend.AverageSentiment < 0) {
            avg.alt = "-";
            avg.src = "images/frown.png";
            summary += "negative; ";
        } else if (trend.AverageSentiment > 0) {
            avg.alt = "+";
            avg.src = "images/smile.png";
            summary += "positive; ";
        } else {
            avg.alt = "=";
            avg.src = "images/neutral.png";
            summary += "neutral; ";
        }
        td.appendChild(avg);

        td.appendChild(document.createTextNode(" "));

        // Change
        let change = util.Make("span");
        change.className = "icon";
        if (trend.SentimentChange < 0) {
            change.innerHTML = "&searr;";
            change.className += " negative";
            summary += "trending down.";
        } else if (trend.SentimentChange > 0) {
            change.innerHTML = "&nearr;";
            change.className += " positive";
            summary += "trending up.";
        } else {
            change.innerHTML = "&rarr;";
            change.className += " neutral";
            summary += "no overall change.";
        }
        td.appendChild(change);

        td.appendChild(document.createTextNode(" "));

        td.appendChild(document.createTextNode(summary));

        tr.appendChild(td);

        detail_sentiment.appendChild(tr);
    });
}
