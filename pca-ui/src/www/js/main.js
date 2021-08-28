import * as auth from "./auth.js";
import * as detail from "./detail.js";
import * as search from "./search.js";
import * as summary from "./summary.js";
import * as util from "./util.js";

function route() {
    util.Get("loading").style.display = "flex";
    util.Get("audio").pause();

    console.debug("Hash:", window.location.hash);

    if (window.location.hash == "#search") {
        search.init();
    } else if (/^#.+$/.test(window.location.hash)) {
        // Show detail
        const key = window.location.hash.replace(/^#/, "");
        detail.init(key);
    } else {
        summary.init();
    }
}

window.onload = function () {
    util.Get("dashboardLink").href = config.dashboard.uri;

    auth.handleCode().then(route);
};

window.onpopstate = route;
