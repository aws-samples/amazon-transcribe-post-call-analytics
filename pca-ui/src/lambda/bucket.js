const {
  S3Client,
  PutBucketCorsCommand,
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
} = require("@aws-sdk/client-s3");
const response = require("cfn-response");
const s3 = new S3Client({});

const stackName = process.env.StackName;

exports.handler = function (event, context) {
    const props = event.ResourceProperties;

    const bucketName = props.BucketName;
    const prefix = props.Prefix;
    const queueArn = props.QueueArn;

    const audioBucket = props.AudioBucket;
    const audioBucketPrefix = props.AudioBucketPrefix;
    const webUri = props.WebUri.replace(/\/$/, "");

    const resourceId = `${stackName}::${bucketName}/${prefix}`

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
    s3.send(new PutBucketCorsCommand({
        Bucket: audioBucket,
        CORSConfiguration: corsConfiguration
    })).then(() => 
    {
        // Configure output bucket
        s3.send(new GetBucketNotificationConfigurationCommand({
            Bucket: bucketName,
        })).then((data) => {
            console.log("Existing config:", JSON.stringify(data, null, 4));

            // Remove our config.
            //
            // The fallback is required under v3, not defensive padding. v2 normalised an
            // absent notification configuration into empty arrays; v3 omits the member
            // entirely, so on a bucket with no existing notifications this was a
            // TypeError - which would fail this custom resource and therefore the stack.
            data.QueueConfigurations = (data.QueueConfigurations || []).filter(
                (config) => {
                    return config.Id != resourceId;
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
                });
                // and enable EventBridge - used by pca-dashboards
                data.EventBridgeConfiguration = {};
                console.log("Added us:", JSON.stringify(data, null, 4));
            }

            // $metadata is stripped out rather than being sent back as part of the
            // configuration. v3 attaches it to every response; it is not a valid
            // NotificationConfiguration member.
            const { $metadata, ...notificationConfiguration } = data;

            return s3.send(new PutBucketNotificationConfigurationCommand({
                Bucket: bucketName,
                NotificationConfiguration: notificationConfiguration,
            }));
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
