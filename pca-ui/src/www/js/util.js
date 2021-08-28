export async function Load(uri) {
    return new Promise(function (resolve, reject) {
        var r = new XMLHttpRequest();
        r.open("GET", uri, true);
        r.onreadystatechange = function () {
            if (r.readyState != XMLHttpRequest.DONE) {
                return;
            }

            if (r.status != 200) {
                return reject({
                    status: r.status,
                    statusText: r.statusText,
                });
            }

            return resolve(JSON.parse(r.responseText));
        };
        r.send();
    });
}

export function Make(type, content) {
    var out = document.createElement(type);

    if (content !== undefined) {
        out.innerHTML = content;
    }

    return out;
}

export function Get(id) {
    return document.getElementById(id);
}

export function Set(id, content) {
    if(content == null) {
        content = "&mdash;";
    }

    Get(id).innerHTML = content;
}

export function Clear(id) {
    Set(id, "");
}

export function ColourMap(keys, s, l) {
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

export function loading() {
    Get("loading").style.display = "flex";
    Get("audio").pause();
}

export function ready(id) {
    Get("loading").style.display = "none";
    Get("detail").style.display = "none";
    Get("search").style.display = "none";
    Get("summary").style.display = "none";

    Get(id).style.display = "flex";

    window.scrollTo(0, 0);
}
