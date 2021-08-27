import * as util from "./util.js";

const entities = util.Get("entities");

export default function (data) {
    util.Clear("entities");

    if (
        !"CustomEntities" in data.ConversationAnalytics ||
        data.ConversationAnalytics.CustomEntities.length == 0
    ) {
        entities.parentElement.style.display = "none";
        return;
    }

    let colours = util.ColourMap(
        data.ConversationAnalytics.CustomEntities.map((entity) => entity.Name),
        100,
        87.5
    );

    data.ConversationAnalytics.CustomEntities.forEach((entity) => {
        const entitySpan = util.Make(
            "span",
            `${entity.Name} &times; ${entity.Count}`
        );

        entitySpan.style["background-color"] = colours[entity.Name];

        if ("Values" in entity && entity.Values.length > 0) {
            entitySpan.title = entity.Values.join(", ");
        }

        entities.appendChild(entitySpan);
    });

    entities.parentElement.style.display = "block";
}
