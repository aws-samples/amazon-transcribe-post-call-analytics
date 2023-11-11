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

    const jobName = key.split('/').pop();
    if (jobName.startsWith("redacted-")) {
        console.log("starts with redacted, need to delete old record");
        // Transcribe standard will prefix redacted files with 'redacted-' as part of their key
        // but the ddb wont have that 'in-progress' record, so we must delete the record that 
        // does not contain 'redacted-' or else we'll have two records in ddb and the ui
        await deleteKey(key.slice(0, key.lastIndexOf('/') + 1) + jobName.slice(9));
    }

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

    const defaultId = "spk_1";
    const callerId =
      parsed.ConversationAnalytics.SpeakerLabels.find(
        (labelObj) => labelObj.DisplayText === "Customer"
      ).Speaker || defaultId;

    let dataJson = {
        key: key,
        jobName: jobInfo.TranscriptionJobName,
        confidence: jobInfo.AverageWordConfidence,
        lang: parsed.ConversationAnalytics.LanguageCode,
        duration:
            parsed.SpeechSegments[parsed.SpeechSegments.length - 1].SegmentEndTime,
        timestamp: timestamp,
        location: parsed.ConversationAnalytics.ConversationLocation,
        callerSentimentScore:
            parsed.ConversationAnalytics.SentimentTrends[callerId].SentimentScore,
        callerSentimentChange:
            parsed.ConversationAnalytics.SentimentTrends[callerId].SentimentChange,
        agent: parsed.ConversationAnalytics.Agent,
        customer: parsed.ConversationAnalytics.Cust,
        guid: parsed.ConversationAnalytics.GUID,
    };

    
    if (parsed.ConversationAnalytics.Summary !== undefined) {
        if (typeof parsed.ConversationAnalytics.Summary === 'string' || parsed.ConversationAnalytics.Summary instanceof String)
        {
            dataJson["summary"] = parsed.ConversationAnalytics.Summary;
        }
        else {
            for (const [key, value] of Object.entries(parsed.ConversationAnalytics.Summary)) {
                console.log(`${key}: ${value}`);
                dataJson['summary_' + key.toLowerCase().replace(' ','_')] = value;
            }
        }
    }

    
    let data = JSON.stringify(dataJson);
    console.log("Data:", data);

    const callId = `call#${key}`;

    // Call entry
    let items = [makeItem(callId, "call", timestamp, data)];

    // Sentiment entries
    const sentiments = parsed.ConversationAnalytics.SentimentTrends;

    Object.entries(sentiments).map(([k, v]) => {
      items.push(
        makeItem(
          callId,
          `sentiment#${k === callerId ? "caller" : "agent"}#average`,
          v.SentimentScore,
          data
        ),
        makeItem(
          callId,
          `sentiment#${k === callerId ? "caller" : "agent"}#trend`,
          v.SentimentChange,
          data
        )
      );
    });


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
    return deleteKey(key);
}

async function deleteKey(key) {
    console.log("Deleting key:", key);
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
