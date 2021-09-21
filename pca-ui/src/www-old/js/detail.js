import * as api from "./api.js";
import * as format from "./format.js";
import * as search from "./search.js";
import * as summary from "./summary.js";
import * as util from "./util.js";
import loadDetailEntities from "./detail_entities.js";
import loadDetailHeader from "./detail_header.js";
import loadDetailSentimentGraph from "./detail_sentiment_graph.js";
import loadDetailTranscript from "./detail_transcript.js";

const nextButton = util.Get("next");
const prevButton = util.Get("prev");
const swapButton = util.Get("swap");

function getNext(list, current) {
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];

        if (entry.key == current.key) {
            if (i < list.length - 1) {
                return list[i + 1];
            }

            break;
        }
    }

    return null;
}

function getPrev(list, current) {
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];

        if (entry.key == current.key) {
            if (i > 0) {
                return list[i - 1];
            }

            break;
        }
    }

    return null;
}

function summaryNav(key) {
    const header = api.head(key);

    nextButton.innerHTML = "Next entry &rarr;";
    prevButton.innerHTML = "&larr; Previous entry";

    summary.next(header).then(nextHeader => {
        if(nextHeader != null) {
            nextButton.disabled = false;

            nextButton.onclick = function () {
                history.pushState({}, "", `/#${nextHeader.key}`);
                init(nextHeader.key);
            };
        }
    });

    summary.prev(header).then(prevHeader => {
        if(prevHeader != null) {
            prevButton.disabled = false;

            prevButton.onclick = function () {
                history.pushState({}, "", `/#${prevHeader.key}`);
                init(prevHeader.key);
            };
        }
    });
}

function searchNav(searchIndex) {
    nextButton.innerHTML = "Next result &rarr;";
    prevButton.innerHTML = "&larr; Previous result";

    const nextHeader = search.results[searchIndex + 1];
    const prevHeader = search.results[searchIndex - 1];

    nextButton.disabled = nextHeader == null;
    prevButton.disabled = prevHeader == null;

    nextButton.onclick = function () {
        history.pushState({}, "", `/#${nextHeader.key}`);
        init(nextHeader.key, searchIndex + 1);
    };

    prevButton.onclick = function () {
        history.pushState({}, "", `/#${prevHeader.key}`);
        init(prevHeader.key, searchIndex - 1);
    };
}

export async function init(key, searchIndex) {
    util.loading();

    nextButton.disabled = true;
    prevButton.disabled = true;
    if (searchIndex == null) {
        summaryNav(key);
    } else {
        searchNav(searchIndex);
    }

    swapButton.onclick = function () {
        swapButton.disabled = true;

        api.swap(key).then(function () {
            api.invalidate(key);
            init(key, searchIndex);
            swapButton.disabled = false;
        });
    };

    const data = await api.get(key);

    // Figure out which way round the speakers are
    let speakers = data.ConversationAnalytics.SpeakerLabels.reduce(
        (out, label) => {
            out[label.Speaker] = label.DisplayText;
            return out;
        },
        {}
    );

    loadDetailHeader(data, speakers);
    loadDetailSentimentGraph(data, speakers);
    loadDetailEntities(data);
    loadDetailTranscript(data, speakers);

    util.ready("detail");
}
