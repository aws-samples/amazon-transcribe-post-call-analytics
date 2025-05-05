const AWS = require("aws-sdk");
const response = require("cfn-response");
const s3 = new AWS.S3();

const key = "config.js";

exports.handler = function (event, context) {
  console.log("Event:", JSON.stringify(event, null, 4));

  if (event.RequestType == "Delete") {
    console.log("Nothing to do on delete");
    return response.send(event, context, response.SUCCESS);
  }

  const props = event.ResourceProperties;

  const bucket = props.Bucket;

  const config = `
window.pcaSettings = {
    auth: {
        uri: "${props.AuthUri}",
        clientId: "${props.AuthClientId}",
    },
    api: {
        pageSize: 25,
        uri: "${props.ApiUri}",
    },
    dashboard: {
        uri: "https://${props.Region}.quicksight.aws.amazon.com/sn/start",
    },
    genai: {
        query: ${props.GenAIQuery}
    },
    qwebappurl: {
        uri: "${props.QAppWebURL}"
    }
};`;

  s3.upload({
    Body: config,
    Bucket: bucket,
    Key: key,
    ContentType: "application/javascript",
  })
    .promise()
    .then((msg) => {
      response.send(event, context, response.SUCCESS);
    })
    .catch((err) => {
      response.send(event, context, response.FAILED, {
        error: err,
      });
    });
};