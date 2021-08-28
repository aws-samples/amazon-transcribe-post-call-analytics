const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

function makeQuery(key, filter, filter_values) {
    let expression = "SK = :sk";
    let values = {
        ":sk": {
            S: key,
        },
    };

    if (filter != null) {
        expression += ` AND ${filter}`;

        if (filter_values != null) {
            values = { ...values, ...filter_values };
        }
    }

    return {
        TableName: tableName,
        IndexName: "GSI1",
        ScanIndexForward: false,
        KeyConditionExpression: expression,
        ExpressionAttributeValues: values,
    };
}

function makeResponse(body) {
    return {
        statusCode: 200,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type,Authorization",
            "access-control-allow-methods": "OPTIONS,GET",
        },
        body: JSON.stringify(body),
    };
}

exports.handler = async function (event, context) {
    console.log(
        JSON.stringify(
            {
                event: event,
                context: context,
            },
            null,
            4
        )
    );

    let queries = [];

    let params = event.queryStringParameters || {};

    if ("timestampFrom" in params) {
        if ("timestampTo" in params) {
            queries.push(
                makeQuery("call", "TK BETWEEN :start AND :end", {
                    ":start": {
                        N: params.timestampFrom,
                    },
                    ":end": {
                        N: params.timestampTo,
                    },
                })
            );
        } else {
            queries.push(
                makeQuery("call", "TK >= :start", {
                    ":start": {
                        N: params.timestampFrom,
                    },
                })
            );
        }
    } else if ("timestampTo" in params) {
        queries.push(
            makeQuery("call", "TK <= :end", {
                ":end": {
                    N: params.timestampTo,
                },
            })
        );
    }

    if (
        "sentimentWho" in params &&
        "sentimentWhat" in params &&
        "sentimentDirection" in params
    ) {
        const who = params.sentimentWho == "caller" ? "caller" : "agent";
        const what = params.sentimentWhat == "average" ? "average" : "trend";
        const query =
            params.sentimentDirection == "positive"
                ? "TK >= :zero"
                : "TK < :zero";

        queries.push(
            makeQuery(`sentiment#${who}#${what}`, query, {
                ":zero": {
                    N: "0",
                },
            })
        );
    }

    if ("entity" in params) {
        params.entity.split(",").forEach((entity) => {
            queries.push(makeQuery(`entity#${entity}`));
        });
    }

    if ("language" in params) {
        queries.push(makeQuery(`language#${params.language}`));
    }

    if (queries.length == 0) {
        return makeResponse([]);
    }

    console.log("Queries:", JSON.stringify(queries, null, 4));

    let promises = queries.map((query) => {
        return ddb.query(query).promise();
    });

    let results = [];
    try {
        results = await Promise.all(promises);
    } catch (e) {
        throw e;
    }
    console.log("Results:", results);

    let output = results[0].Items;

    results = results.map((result) => {
        return result.Items.reduce((a, item) => {
            a[item.PK.S] = true;
            return a;
        }, {});
    });
    console.log("Result Keys:", results);

    output = output.filter((item) => {
        return results.every((result) => {
            return item.PK.S in result;
        });
    });
    console.log("Filtered:", output);

    return makeResponse(
        output.map((item) => {
            return JSON.parse(item.Data.S);
        })
    );
};
