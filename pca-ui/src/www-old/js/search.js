import * as util from "./util.js";
import * as api from "./api.js";
import { loadListEntry } from "./summary.js";

const from_date = new Pikaday({ field: util.Get("search_date_from") });
const to_date = new Pikaday({ field: util.Get("search_date_to") });

const searchButton = util.Get("search_button");

// Init
let results = [];

let ready = false;

function selectEntity(entity) {
    const span = util.Make("span", entity);
    span.onclick = function () {
        span.remove();
    };

    util.Get("search_selected_entities").appendChild(span);

    util.Get("search_entities").value = "";
}

async function performSearch() {
    util.loading();

    searchButton.disabled = true;

    let query = {};

    // Entities
    let entities = Array.prototype.slice
        .call(util.Get("search_selected_entities").childNodes)
        .map((node) => {
            return node.innerHTML;
        });

    if (entities.length > 0) {
        query.entity = entities.join(",");
    }

    // Dates
    if (util.Get("search_date_from").value.trim() != "") {
        query.timestampFrom = from_date.getMoment().unix() * 1000;
    }

    if (util.Get("search_date_to").value.trim() != "") {
        let to = to_date.getMoment().unix();
        to += 24 * 60 * 60; // + 24h

        query.timestampTo = to * 1000;
    }

    // Language
    let language = util.Get("search_language").value;
    if(language != "-") {
        query.language = language;
    }

    // Sentiment
    let who = util.Get("search_sentiment_who").value;
    let what = util.Get("search_sentiment_what").value;
    let direction = util.Get("search_sentiment_direction").value;

    if (who != "-" && what != "-" && direction != "-") {
        query.sentimentWho = who == "Agent" ? "agent" : "caller";
        query.sentimentWhat = what;
        query.sentimentDirection = direction;
    }

    results = await api.search(query);
    console.debug("Search results:", results);

    util.Clear("search_results_data");
    results.map((entry, i) => loadListEntry(entry, i));

    searchButton.disabled = false;

    util.ready("search");
}

async function initEntities() {
    let entities = await api.entities();

    entities.forEach((entity) => {
        const option = util.Make("option", entity);
        util.Get("search_entities_list").appendChild(option);
    });

    util.Get("search_entities").oninput = function () {
        if (entities.includes(this.value)) {
            selectEntity(this.value);
        }
    };
}

async function initLanguages() {
    let languages = await api.languages();

    languages.forEach((language) => {
        const option = util.Make("option", language);
        util.Get("search_language").appendChild(option);
    });
}

export async function init() {
    util.loading();

    if(!ready) {
        // Prepare the sentiment buttons
        function checkSentiment() {
            if (this.value == "-") {
                util.Get("search_sentiment_who").value = "-";
                util.Get("search_sentiment_what").value = "-";
                util.Get("search_sentiment_direction").value = "-";
            }
        }

        util.Get("search_sentiment_who").onchange = checkSentiment;
        util.Get("search_sentiment_what").onchange = checkSentiment;
        util.Get("search_sentiment_direction").onchange = checkSentiment;

        // Assign the search button
        searchButton.onclick = performSearch;

        await Promise.all([initEntities(), initLanguages()]);

        ready = true;
    }

    util.ready("search");
}

export { results };
