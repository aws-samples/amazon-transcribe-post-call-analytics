const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;
const objectKey = process.env.AudioBucketPrefix;
const outputKey = process.env.DataPrefix;

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
    const jobName = record.object.key.split("/")[1];
    const k = record.object.key.replace(objectKey, outputKey);
    const key = k.concat('.json')

    console.log("Creating:", key);

    let timestamp = new Date().getTime();
    console.log("Timestamp:", timestamp);

    let dataJson = {
        key: key,
        jobName: jobName,
        timestamp: timestamp,
        status: "In progress",
    };

    let data = JSON.stringify(dataJson);
    console.log("Data:", data);

    const callId = `call#${key}`;

    // Call entry
    let item = makeItem(callId, "call", timestamp, data);

    console.log("Item:", JSON.stringify(item));

    return ddb.putItem({
        TableName: tableName,
        Item: item,
    }).promise();

    return ;
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

    const eventType = event['detail-type'];
    const eventObjectKey = event.detail.object.key;

    const re = new RegExp("^" + objectKey);

    if (eventType == "Object Created" && re.test(eventObjectKey)) {
        const promise = createRecord(event.detail);
        return await Promise.all([promise]);
    }
};
