const AWS = require("aws-sdk");
const s3 = new AWS.S3({signatureVersion: 'v4'});

const audioBucket = process.env.AudioBucket;
const audioBucketPrefix = process.env.AudioBucketPrefix;

async function getPresignedURL(key) {
    console.log("Generating presigned url for", audioBucket, audioBucketPrefix, key);
    try {
        const url = await s3.getSignedUrlPromise('putObject', {
            Bucket: audioBucket,
            Key: audioBucketPrefix + "/" + key,
            Expires: 900
        });
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
            statusCode: err.statusCode || 502,
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

exports.handler = async function (event, context) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.queryStringParameters.filename;

    const presigned_url = await getPresignedURL(key);

    return presigned_url;
};
