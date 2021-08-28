const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();
const s3 = new AWS.S3();

const tableName = process.env.TableName;
const dataBucket = process.env.DataBucket;

const callerPrefix = "sentiment#caller";
const agentPrefix = "sentiment#agent";

async function getSentiments(key) {
    const results = await ddb
        .query({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sentiment)",
            ExpressionAttributeValues: {
                ":pk": {
                    S: `call#${key}`,
                },
                ":sentiment": {
                    S: "sentiment#",
                },
            },
        })
        .promise();

    return results.Items;
}

async function putSentiments(sentiments) {
    const req = {};
    req[tableName] = sentiments.map((item) => {
        return {
            PutRequest: {
                Item: item,
            },
        };
    });

    return ddb
        .batchWriteItem({
            RequestItems: req,
        })
        .promise();
}

async function swapSentiments(key) {
    const sentiments = await getSentiments(key);

    sentiments.forEach((sentiment) => {
        if (sentiment.SK.S.startsWith(callerPrefix)) {
            sentiment.SK.S = sentiment.SK.S.replace(callerPrefix, agentPrefix);
        } else {
            sentiment.SK.S = sentiment.SK.S.replace(agentPrefix, callerPrefix);
        }
    });

    return putSentiments(sentiments);
}

async function getData(key) {
    let res;
    try {
        res = await s3
            .getObject({
                Bucket: dataBucket,
                Key: key,
            })
            .promise();
    } catch (e) {
        return {
            statusCode: 404,
            body: `No such key: ${key}`,
        };
    }
    console.log("Res:", res);

    const body = res.Body.toString();

    return JSON.parse(body);
}

async function putData(key, data) {
    return s3
        .putObject({
            Bucket: dataBucket,
            Key: key,
            Body: JSON.stringify(data),
        })
        .promise();
}

async function swapData(key) {
    const data = await getData(key);

    const a = data.ConversationAnalytics.SpeakerLabels[0].DisplayText;
    const b = data.ConversationAnalytics.SpeakerLabels[1].DisplayText;

    data.ConversationAnalytics.SpeakerLabels[0].DisplayText = b;
    data.ConversationAnalytics.SpeakerLabels[1].DisplayText = a;

    return putData(key, data);
}

exports.handler = async function (event, context) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.pathParameters.key;

    await Promise.all([swapSentiments(key), swapData(key)]);

    return {
        statusCode: 200,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type,Authorization",
            "access-control-allow-methods": "OPTIONS,PUT",
        },
        body: JSON.stringify({
            success: true,
        }),
    };
};
