const AWS = require("aws-sdk");
const response = require("cfn-response");
const s3 = new AWS.S3();

const stackName = process.env.StackName;

exports.handler = function (event, context) {
    const props = event.ResourceProperties;

    const bucketName = props.BucketName;
    const prefix = props.Prefix;
    const lambdaArn = props.LambdaArn;

    const resourceId = `${stackName}::${bucketName}/${prefix}`

    console.log("Event:", JSON.stringify(event, null, 4));

    s3.getBucketNotificationConfiguration({
        Bucket: bucketName,
    })
        .promise()
        .then((data) => {
            console.log("Existing config:", JSON.stringify(data, null, 4));

            // Remove our config
            data.LambdaFunctionConfigurations = data.LambdaFunctionConfigurations.filter(
                (config) => {
                    return config.Id != resourceId;
                }
            );

            console.log("Removed us:", JSON.stringify(data, null, 4));

            if (event.RequestType != "Delete") {
                // Add it back in
                data.LambdaFunctionConfigurations.push({
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
                data.EventBridgeConfiguration = {};

                console.log("Adding us:", JSON.stringify(data, null, 4));
            }

            return s3
                .putBucketNotificationConfiguration({
                    Bucket: bucketName,
                    NotificationConfiguration: data,
                })
                .promise();
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
