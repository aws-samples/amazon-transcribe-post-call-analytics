import * as api from "./api.js";
import * as detail from "./detail.js";
import * as format from "./format.js";
import * as util from "./util.js";

let headers = [];

async function loadPage() {
    util.Get("load_more").disabled = true;

    let query = {
        count: config.api.pageSize,
    };

    if (headers.length > 0) {
        // We're appending
        const last = headers[headers.length - 1];

        query.startKey = last.key;
        query.startTimestamp = last.timestamp;
    }

    const newHeaders = await api.list(query);
    console.debug("Loaded headers:", newHeaders);

    if (newHeaders.length < config.api.pageSize) {
        // No more to load
        util.Get("load_more").style.display = "none";
    } else {
        util.Get("load_more").disabled = false;
    }

    newHeaders.forEach((entry, index) => {
        loadListEntry(entry);
    });

    headers.push(...newHeaders);
    console.debug(headers.length);

    return newHeaders;
}

export async function init() {
    util.loading();

    util.Get("load_more").onclick = loadPage;

    if(headers.length == 0) {
        await loadPage();
    }

    util.ready("summary");
}

export function loadListEntry(header, searchIndex) {
    let tr = util.Make("tr");

    let node = util.Get(
        searchIndex != null ? "search_results_data" : "list_data"
    );

    tr.appendChild(util.Make("td", node.childNodes.length + 1));
    tr.appendChild(util.Make("td", header.jobName));
    tr.appendChild(util.Make("td", format.Date(parseInt(header.timestamp), header.location)));
    tr.appendChild(util.Make("td", format.Percentage(header.accuracy)));
    tr.appendChild(util.Make("td", header.lang));
    tr.appendChild(util.Make("td", format.Time(header.duration)));

    tr.onclick = function () {
        history.pushState({}, "", `/#${header.key}`);
        detail.init(header.key, searchIndex);
    };

    node.appendChild(tr);
}

export async function next(current) {
    current = await current;

    let list = await api.list({
        startKey: current.key,
        startTimestamp: current.timestamp,
        count: 1,
    });
    console.debug("Next list:", list);

    if (list.length == 0) {
        return null;
    }

    return list[0];
}

export async function prev(current) {
    current = await current;

    let list = await api.list({
        startKey: current.key,
        startTimestamp: current.timestamp,
        count: 1,
        reverse: true,
    });
    console.debug("Prev list:", list);

    if (list.length == 0) {
        return null;
    }

    return list[0];
}

export { headers };
