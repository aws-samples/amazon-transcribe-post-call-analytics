const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { withAuthorization } = require("./auth-middleware");

// signatureVersion: 'v4' is not a v3 option and is not needed - v3 signs with SigV4
// unconditionally, which is what the v2 option was requesting.
const s3 = new S3Client({});

const audioBucket = process.env.AudioBucket;
const audioBucketPrefix = process.env.AudioBucketPrefix;

async function getPresignedURL(key) {
    console.log("Generating presigned url for", audioBucket, audioBucketPrefix, key);
    try {
        // v2's getSignedUrlPromise is replaced by the standalone presigner. Note the
        // option rename: "Expires" (seconds, inside the params) becomes "expiresIn" in
        // a separate options argument. Leaving it as Expires would be accepted silently
        // as an unrecognised PutObject param and the URL would fall back to the default
        // 15 minute expiry, which happens to match the 900 used here - so this one
        // would not have been caught by testing.
        const url = await getSignedUrl(
            s3,
            new PutObjectCommand({
                Bucket: audioBucket,
                Key: audioBucketPrefix + "/" + key,
            }),
            { expiresIn: 900 }
        );
        return {
            statusCode: 200,
            headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers": "Content-Type,Authorization",
                "access-control-allow-methods": "OPTIONS,GET",
            },
            body: JSON.stringify({
                success: true,
                message: 'AWS S3 Pre-signed urls generated successfully.',
                url,
            }),
        };
    } catch (err) {
        console.log('Error getting presigned url from AWS S3:', err);
        return {
            // v3 reports the HTTP status under $metadata rather than err.statusCode.
            statusCode: err.$metadata?.httpStatusCode || err.statusCode || 502,
            headers: {
                "access-control-allow-origin": "*",
                "access-control-allow-headers": "Content-Type,Authorization",
                "access-control-allow-methods": "OPTIONS,GET",
            },
            body: JSON.stringify({
                success: false,
                message: 'Pre-Signed URL error',
                err,
            }),
        };
    }
}

async function handler(event, context) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.queryStringParameters.filename;

    const presigned_url = await getPresignedURL(key);

    return presigned_url;
}

exports.handler = withAuthorization(handler);
