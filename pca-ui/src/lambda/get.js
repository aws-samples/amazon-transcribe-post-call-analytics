const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { withAuthorization } = require("./auth-middleware");

// signatureVersion: 'v4' is not a v3 option and is unnecessary - v3 always signs SigV4.
const s3 = new S3Client({});

const dataBucket = process.env.DataBucket;
const audioBucket = process.env.AudioBucket;

// Twelve hours, previously expressed as Expires: 12 * 60 * 60.
const PRESIGNED_URL_TTL_SECONDS = 12 * 60 * 60;

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

    // v3 returns Body as a stream, not a Buffer. Calling .toString() on it does not
    // throw - it yields "[object Object]" - so the failure would surface as a confusing
    // JSON.parse error about an unexpected token rather than as a type error here.
    const data = JSON.parse(await res.Body.transformToString());

    const jobInfo =
        data.ConversationAnalytics.SourceInformation[0].TranscribeJobInfo;

    // Create presigned URL for the audio content.
    //
    // v3's getSignedUrl is asynchronous where v2's was a synchronous return, so both
    // assignments below must be awaited. Without the await these fields would be set to
    // a Promise and serialized into the response as {}, losing audio playback in the UI
    // with no error anywhere.
    jobInfo.MediaFileUri = await getSignedUrl(
        s3,
        new GetObjectCommand({
            Bucket: audioBucket,
            Key: jobInfo.MediaFileUri.replace(/^s3:\/\/[^\/]+\//, ""),
        }),
        { expiresIn: PRESIGNED_URL_TTL_SECONDS }
    );

    if (data.ConversationAnalytics?.CombinedAnalyticsGraph) {
      data.ConversationAnalytics.CombinedAnalyticsGraph = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: dataBucket,
          Key: data.ConversationAnalytics.CombinedAnalyticsGraph.replace(
            /^s3:\/\/[^\/]+\//,
            ""
          ),
        }),
        { expiresIn: PRESIGNED_URL_TTL_SECONDS }
      );
    }

    return JSON.stringify(data);
}

async function handler(event, context) {
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
}

exports.handler = withAuthorization(handler);
