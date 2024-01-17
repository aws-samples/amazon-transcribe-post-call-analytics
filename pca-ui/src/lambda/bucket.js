const AWS = require("aws-sdk");
const response = require("cfn-response");
const s3 = new AWS.S3();

const stackName = process.env.StackName;

exports.handler = function (event, context) {
    const props = event.ResourceProperties;

    const bucketName = props.BucketName;
    const prefix = props.Prefix;
    const transcribePrefix = props.TranscribeResultsPrefix;
    const queueArn = props.QueueArn;
    const docQueueArn = props.DocConversionQueueArn;

    const audioBucket = props.AudioBucket;
    const audioBucketPrefix = props.AudioBucketPrefix;
    const webUri = props.WebUri.replace(/\/$/, "");

    const resourceId = `${stackName}::${bucketName}/${prefix}`
    const docResourceId = `${stackName}::${bucketName}/${transcribePrefix}/redacted-analytics`

    console.log("Event:", JSON.stringify(event, null, 4));

    const corsConfiguration = {
        CORSRules: [{
        AllowedHeaders: [
            "Authorization"
        ], 
        AllowedMethods: [
            "PUT"
        ], 
        AllowedOrigins: [
            webUri,
            "http://localhost:3000"
        ], 
        MaxAgeSeconds: 3000
        }]
    }

    // Configure input bucket CORS configuration
    s3.putBucketCors({
        Bucket: audioBucket,
        CORSConfiguration: corsConfiguration
    }).promise().then(() => 
    {
        // Configure output bucket
        s3.getBucketNotificationConfiguration({
            Bucket: bucketName,
        }).promise().then((data) => {
            console.log("Existing config:", JSON.stringify(data, null, 4));

            // Remove our config
            data.QueueConfigurations = data.QueueConfigurations.filter(
                (config) => {
                    return config.Id != resourceId;
                }
            );

            data.QueueConfigurations = data.QueueConfigurations.filter(
                (config) => {
                    return config.Id != docResourceId;
                }
            );

            console.log("Removed us:", JSON.stringify(data, null, 4));

            if (event.RequestType != "Delete") {
                // Add it back in
                data.QueueConfigurations.push({
                    Id: resourceId,
                    QueueArn: queueArn,
                    Events: ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"],
                    Filter: {
                        Key: {
                            FilterRules: [
                                {
                                    Name: "prefix",
                                    Value: `${prefix}/`,
                                },
                                {
                                    Name: "suffix",
                                    Value: `.json`,
                                },
                            ],
                        },
                    },
                },
                {
                    Id: docResourceId,
                    QueueArn: docQueueArn,
                    Events: ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"],
                    Filter: {
                        Key: {
                            FilterRules: [
                                {
                                    Name: "prefix",
                                    Value: `${transcribePrefix}/redacted-analytics/`,
                                },
                                {
                                    Name: "suffix",
                                    Value: `.json`,
                                },
                            ],
                        },
                    },
                });
                // and enable EventBridge - used by pca-dashboards
                data.EventBridgeConfiguration = {};
                console.log("Added us:", JSON.stringify(data, null, 4));
            }

            return s3.putBucketNotificationConfiguration({
                Bucket: bucketName,
                NotificationConfiguration: data,
            }).promise();
        }).then((data) => {
            console.log("Win:", JSON.stringify(data, null, 4));

            response.send(event, context, response.SUCCESS, {}, resourceId);
        }).catch((err) => {
            console.log("Lose:", err);

            response.send(event, context, response.FAILED, {
                error: err,
            }, resourceId);
        });
    }).catch((err) => {
        console.log("Lose:", err);

        response.send(event, context, response.FAILED, {
            error: err,
        }, resourceId);
    });

    
};
