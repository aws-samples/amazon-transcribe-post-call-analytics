const {
  DynamoDBClient,
  QueryCommand,
  BatchWriteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { withAuthorization } = require("./auth-middleware");
const { logAuditEvent } = require("./audit");

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});

const tableName = process.env.TableName;
const dataBucket = process.env.DataBucket;

const callerPrefix = "sentiment#caller";
const agentPrefix = "sentiment#agent";

async function getSentiments(key) {
    const results = await ddb.send(
        new QueryCommand({
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
    );

    // v3 omits Items when nothing matches; the caller iterates this with forEach.
    return results.Items || [];
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

    return ddb.send(
        new BatchWriteItemCommand({
            RequestItems: req,
        })
    );
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
        res = await s3.send(
            new GetObjectCommand({
                Bucket: dataBucket,
                Key: key,
            })
        );
    } catch (e) {
        return {
            statusCode: 404,
            body: `No such key: ${key}`,
        };
    }
    console.log("Res:", res);

    // v3 Body is a stream. .toString() on it returns "[object Object]" rather than
    // throwing, so the symptom would be a JSON.parse error far from the cause.
    const body = await res.Body.transformToString();

    return JSON.parse(body);
}

async function putData(key, data) {
    return s3.send(
        new PutObjectCommand({
            Bucket: dataBucket,
            Key: key,
            Body: JSON.stringify(data),
        })
    );
}

async function swapData(key) {
    const data = await getData(key);

    const a = data.ConversationAnalytics.SpeakerLabels[0].DisplayText;
    const b = data.ConversationAnalytics.SpeakerLabels[1].DisplayText;

    data.ConversationAnalytics.SpeakerLabels[0].DisplayText = b;
    data.ConversationAnalytics.SpeakerLabels[1].DisplayText = a;

    return putData(key, data);
}

async function handler(event, context, authContext) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.pathParameters.key;

    await Promise.all([swapSentiments(key), swapData(key)]);

    // This mutates stored call data, so it belongs in the audit trail alongside
    // deletions and role changes. It previously wrote no audit entry at all.
    await logAuditEvent(
        {
            action: "CALL_SPEAKERS_SWAPPED",
            username: (authContext && authContext.username) || "unknown",
            details: { callId: key },
        },
        context
    );

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
}

// Previously exported unwrapped, which left PUT /swap/{key+} with no authorization
// check. Gated on read_calls - see the PERMISSION_MAP entry for the reasoning.
exports.handler = withAuthorization(handler);
