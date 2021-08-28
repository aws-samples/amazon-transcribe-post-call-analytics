import * as format from "./format.js";
import * as util from "./util.js";

const detail_data = util.Get("detail_data");
const audio = util.Get("audio");

export default function (data, speakers) {
    util.Clear("detail_data");

    data.SpeechSegments.forEach((part) => {
        const segment = util.Make("row");

        // Sentiment
        const sentiment = part.SentimentIsPositive - part.SentimentIsNegative;
        const sentimentImg = util.Make("img");
        sentimentImg.className = "icon";
        sentimentImg.title = format.Percentage(part.SentimentScore);

        if (sentiment > 0) {
            sentimentImg.src = "images/smile.png";
            sentimentImg.title += " positive";
        } else if (sentiment < 0) {
            sentimentImg.src = "images/frown.png";
            sentimentImg.title += " negative";
        } else {
            sentimentImg.src = "images/neutral.png";
            sentimentImg.title = "Neutral";
        }
        segment.appendChild(sentimentImg);

        // Content
        const content = util.Make("div");
        const info = util.Make("row");
        const text = util.Make("p");
        content.appendChild(info);
        content.appendChild(text);
        segment.appendChild(content);

        // Speaker
        const speaker = util.Make("strong", speakers[part.SegmentSpeaker]);
        info.appendChild(speaker);

        // Start time
        const start = util.Make("a");
        start.href = "#";
        start.innerHTML = format.Time(part.SegmentStartTime);
        start.onclick = function () {
            audio.currentTime = part.SegmentStartTime;
            audio.play();
            return false;
        };
        info.appendChild(start);

        let entityColours = util.ColourMap(
            data.ConversationAnalytics.CustomEntities.map(
                (entity) => entity.Name
            ),
            100,
            87.5
        );

        if ("EntitiesDetected" in part) {
            let offset = 0;

            part.WordConfidence.forEach((word) => {
                part.EntitiesDetected.forEach((entity) => {
                    if (
                        (entity.BeginOffset >= offset &&
                            entity.BeginOffset <= offset + 1) ||
                        (entity.EndOffset >= offset - 1 + word.Text.length &&
                            entity.EndOffset <= offset + word.Text.length)
                    ) {
                        word.Entity = entity.Type;
                    }
                });

                offset += word.Text.length;
            });
        }

        // Transcript
        part.WordConfidence.forEach((word) => {
            let head = word.Text.replace(/^(\W*)*.*?$/, "$1");
            let tail = word.Text.replace(/^.*?(\W*\s*)$/, "$1");
            let body = word.Text.replace(/^\W*(.*?)\W*\s*$/, "$1");

            const span = util.Make("span", body);

            span.title = format.Percentage(word.Confidence) + " confidence";

            if (word.Confidence < 0.5) {
                span.className = "low";
            } else if (word.Confidence < 0.9) {
                span.className = "medium";
            }

            if (/\[$/.test(head) && body == "PII" && /^\]/.test(tail)) {
                span.className += " pii";
                span.innerHTML = "redacted";
            }

            if (word.Entity) {
                span.className += " entity";
                span.title += " - detected " + word.Entity;
                span.style["background-color"] = entityColours[word.Entity];
            }

            text.appendChild(document.createTextNode(head));
            text.appendChild(span);
            text.appendChild(document.createTextNode(tail));
        });

        detail_data.appendChild(segment);
    });
}
