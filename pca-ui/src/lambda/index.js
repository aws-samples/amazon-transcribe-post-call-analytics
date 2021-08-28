const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

function makeItem(pk, sk, tk, data) {
    return {
        PK: {
            S: pk,
        },
        SK: {
            S: sk,
        },
        TK: {
            N: `${tk}`,
        },
        Data: {
            S: data,
        },
    };
}

async function createRecord(record) {
    const key = record.s3.object.key;
    console.log("Creating:", key);

    let res;
    try {
        res = await s3
            .getObject({
                Bucket: record.s3.bucket.name,
                Key: key,
            })
            .promise();
    } catch (e) {
        throw e;
    }
    console.log("Res:", res);

    const body = res.Body.toString();

    const parsed = JSON.parse(body);
    console.log("Parsed:", parsed);

    const jobInfo =
        parsed.ConversationAnalytics.SourceInformation[0].TranscribeJobInfo;

    let timestamp = new Date(
        parsed.ConversationAnalytics.ConversationTime
    ).getTime();
    console.log("Timestamp:", timestamp);

    let data = JSON.stringify({
        key: key,
        jobName: jobInfo.TranscriptionJobName,
        accuracy: jobInfo.AverageAccuracy,
        lang: parsed.ConversationAnalytics.LanguageCode,
        duration:
            parsed.SpeechSegments[parsed.SpeechSegments.length - 1]
                .SegmentEndTime,
        timestamp: timestamp,
        location: parsed.ConversationAnalytics.ConversationLocation,
    });
    console.log("Data:", data);

    const callId = `call#${key}`;

    // Call entry
    let items = [makeItem(callId, "call", timestamp, data)];

    // Sentiment entries
    const sentiments = parsed.ConversationAnalytics.SentimentTrends;

    if(sentiments.length > 0) {
        items.push(
            makeItem(
                callId,
                `sentiment#caller#average`,
                sentiments[0].AverageSentiment,
                data
            )
        );
        items.push(
            makeItem(
                callId,
                `sentiment#caller#trend`,
                sentiments[0].SentimentChange,
                data
            )
        );
    }

    if(sentiments.length > 1) {
        items.push(
            makeItem(
                callId,
                `sentiment#agent#average`,
                sentiments[1].AverageSentiment,
                data
            )
        );
        items.push(
            makeItem(
                callId,
                `sentiment#agent#trend`,
                sentiments[1].SentimentChange,
                data
            )
        );
    }

    // Entities
    parsed.ConversationAnalytics.CustomEntities.forEach((entity) => {
        entity.Values.forEach((value) => {
            const entityId = `entity#${value}`;

            // Entity record
            items.push(makeItem(entityId, "entity", 0, entity.Name));

            // Entity search record
            items.push(makeItem(callId, entityId, 0, data));
        });
    });

    // Language
    const language = parsed.ConversationAnalytics.LanguageCode;
    const languageId = `language#${language}`;

    // Language record
    items.push(makeItem(languageId, "language", 0, language));

    // Language search record
    items.push(makeItem(callId, languageId, 0, data));

    console.log("Items:");
    items.forEach((item) => {
        console.log(JSON.stringify(item));
    });

    return Promise.all(
        items.map((item) => {
            return ddb
                .putItem({
                    TableName: tableName,
                    Item: item,
                })
                .promise();
        })
    );
}

async function deleteRecord(record) {
    const key = record.s3.object.key;
    console.log("Deleting:", key);

    let records;
    try {
        records = await ddb
            .query({
                TableName: tableName,
                KeyConditionExpression: "PK = :pk",
                ExpressionAttributeValues: {
                    ":pk": {
                        S: `call#${key}`,
                    },
                },
            })
            .promise();
    } catch (e) {
        throw e;
    }

    console.log("Records:", records);

    if (records.Items.length === 0) {
        return Promise.resolve("No op");
    }

    // Chunk records into batches of 25 (dynamodb requirement)
    const batchSize = 25;

    const batches = Array(Math.ceil(records.Items.length / batchSize))
        .fill()
        .map((_, i) => {
            return records.Items.slice(i * batchSize, (i + 1) * batchSize);
        });

    return Promise.all(
        batches.map((batch) => {
            let req = {};
            req[tableName] = batch.map((item) => {
                return {
                    DeleteRequest: {
                        Key: {
                            PK: item.PK,
                            SK: item.SK,
                        },
                    },
                };
            });

            return ddb
                .batchWriteItem({
                    RequestItems: req,
                })
                .promise();
        })
    );
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

    let promises = event.Records.reduce((promises, sqsRecord) => {
        let body = JSON.parse(sqsRecord.body);

        if (body.Event === "s3:TestEvent") {
            console.log("Ignoring test event");
            return promises;
        }

        let inner = body.Records.map((s3Record) => {
            let eventType = s3Record.eventName.split(":")[0];

            if (eventType == "ObjectCreated") {
                return createRecord(s3Record);
            } else if (eventType == "ObjectRemoved") {
                return deleteRecord(s3Record);
            }
        });

        promises.push(...inner);

        return promises;
    }, []);

    return await Promise.all(promises);
};
