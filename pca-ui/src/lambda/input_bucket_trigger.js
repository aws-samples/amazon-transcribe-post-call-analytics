const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB();
const stepFunctions = new AWS.StepFunctions();

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

async function createRecord(key, jobName, status) {
    console.log("Creating:", key);

    let timestamp = new Date().getTime();
    console.log("Timestamp:", timestamp);

    let dataJson = {
        key: key,
        jobName: jobName,
        timestamp: timestamp,
        status: status,
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
}

function getCurrentStateName(events) {
    for (let event of events) {
        if (event.type.endsWith('StateEntered')) {
            return event.stateEnteredEventDetails.name;
        }
    }
    return null;
}

function getJobNameFromKey(key) {
    return key.split("/").pop();
}

function getFilenameFromKey(key) {
    const k = key.replace(objectKey, outputKey);
    return k.concat('.json');
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
    
    if(eventType === 'Step Functions Execution Status Change') {
        const executionArn = event.detail.executionArn;
        
        const historyParams = {
            executionArn: executionArn,
            reverseOrder: true
        }
        
        const history = await stepFunctions.getExecutionHistory(historyParams).promise();
        
        const currentState = getCurrentStateName(history.events);
        console.log('---- CURRENT STATE ---- : ', currentState);
        let outputState = "In progress";
        if (currentState === "TranscribeAudio") outputState = "Transcribing";
        else if (currentState === "WaitForMainTranscribe") outputState = "Transcribing";
        else if (currentState === "ProcessSummarize") outputState = "Summarizing";
        else if (currentState === "Success") outputState = "Done";
        else if (currentState === "TranscriptionFailed") outputState = "Failed";
        else outputState = currentState;

        const input = JSON.parse(event.detail.input);
        console.log(input);
        const jobName = getJobNameFromKey(input.key);
        const outputFileName = getFilenameFromKey(input.key);
        const promise = createRecord(outputFileName, jobName, outputState);
        return await Promise.all([promise]);
        
    } else if(eventType === "Object Created") {
        // this is most likely the s3 end drop trigger
        const eventObjectKey = event.detail.object.key;
        const re = new RegExp("^" + objectKey);
        if (re.test(eventObjectKey)) {
            const jobName = getJobNameFromKey(event.detail.object.key);
            const outputFileName = getFilenameFromKey(event.detail.object.key);

            const promise = createRecord(outputFileName, jobName, 'InProgress');
            return await Promise.all([promise]);
        }
    }

};
