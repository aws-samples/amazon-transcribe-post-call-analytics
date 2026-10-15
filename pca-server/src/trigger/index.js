// Migrated from AWS SDK for JavaScript v2 to v3. v2 reached end-of-support on
// 2025-09-08 and receives no further security fixes.
//
// The promise-chain structure below is retained deliberately rather than being
// converted to async/await. cfn-response ends the invocation by calling
// context.done(); an async handler resolves on its own return value instead, which
// can let Lambda freeze the execution before cfn-response's HTTP request to the
// pre-signed CloudFormation URL completes. Only the SDK calls have changed.
const {
  S3Client,
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
    const lambdaArn = props.LambdaArn;

    const resourceId = `${stackName}::${bucketName}/${prefix}`

    console.log("Event:", JSON.stringify(event, null, 4));

    s3.send(
        new GetBucketNotificationConfigurationCommand({
            Bucket: bucketName,
        })
    )
        .then((data) => {
            console.log("Existing config:", JSON.stringify(data, null, 4));

            // Remove our config.
            //
            // The empty-array fallbacks matter under v3. v2 normalised an absent
            // notification configuration into empty arrays, so .filter() was always
            // safe; v3 omits empty members from the response entirely, which would
            // make this a TypeError on a bucket that has no notifications yet.
            const lambdaFunctionConfigurations = (
                data.LambdaFunctionConfigurations || []
            ).filter((config) => {
                return config.Id != resourceId;
            });

            // Rebuild the configuration explicitly rather than mutating and resending
            // the response object. A v3 response carries a $metadata property that is
            // not part of NotificationConfiguration, and the existing topic and queue
            // configurations have to be carried through or this call would delete
            // notifications it does not own.
            const notificationConfiguration = {
                TopicConfigurations: data.TopicConfigurations || [],
                QueueConfigurations: data.QueueConfigurations || [],
                LambdaFunctionConfigurations: lambdaFunctionConfigurations,
            };

            if (data.EventBridgeConfiguration) {
                notificationConfiguration.EventBridgeConfiguration =
                    data.EventBridgeConfiguration;
            }

            console.log("Removed us:", JSON.stringify(notificationConfiguration, null, 4));

            if (event.RequestType != "Delete") {
                // Add it back in
                notificationConfiguration.LambdaFunctionConfigurations.push({
                    Id: resourceId,
                    LambdaFunctionArn: lambdaArn,
                    Events: ["s3:ObjectCreated:*"],
                    Filter: {
                        Key: {
                            FilterRules: [
                                {
                                    Name: "prefix",
                                    Value: `${prefix}/`,
                                },
                            ],
                        },
                    },
                });
                // enable eventbridge configuration for the ui
                notificationConfiguration.EventBridgeConfiguration = {};

                console.log("Adding us:", JSON.stringify(notificationConfiguration, null, 4));
            }

            return s3.send(
                new PutBucketNotificationConfigurationCommand({
                    Bucket: bucketName,
                    NotificationConfiguration: notificationConfiguration,
                })
            );
        })
        .then((data) => {
            console.log("Win:", JSON.stringify(data, null, 4));

            response.send(event, context, response.SUCCESS, {}, resourceId);
        })
        .catch((err) => {
            console.log("Lose:", err);

            response.send(event, context, response.FAILED, {
                error: err,
            }, resourceId);
        });
};
