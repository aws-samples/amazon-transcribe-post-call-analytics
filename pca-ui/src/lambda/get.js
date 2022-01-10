const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const dataBucket = process.env.DataBucket;
const audioBucket = process.env.AudioBucket;

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

    const data = JSON.parse(res.Body.toString());

    const jobInfo =
        data.ConversationAnalytics.SourceInformation[0].TranscribeJobInfo;

    // Create presigned URL for the audio content
    jobInfo.MediaFileUri = s3.getSignedUrl("getObject", {
        Bucket: audioBucket,
        Key: jobInfo.MediaFileUri.replace(/^s3:\/\/[^\/]+\//, ""),
        Expires: 12 * 60 * 60,
    });

    if (data.ConversationAnalytics?.CombinedAnalyticsGraph) {
      data.ConversationAnalytics.CombinedAnalyticsGraph = s3.getSignedUrl(
        "getObject",
        {
          Bucket: dataBucket,
          Key: data.ConversationAnalytics.CombinedAnalyticsGraph.replace(
            /^s3:\/\/[^\/]+\//,
            ""
          ),
          Expires: 12 * 60 * 60,
        }
      );
    }

    return JSON.stringify(data);
}

exports.handler = async function (event, context) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.pathParameters.key;

    const data = await getData(key);

    return {
        statusCode: 200,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type,Authorization",
            "access-control-allow-methods": "OPTIONS,GET",
        },
        body: data,
    };
};
