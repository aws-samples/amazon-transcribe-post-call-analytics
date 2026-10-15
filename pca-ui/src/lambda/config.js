const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const response = require("cfn-response");
const s3 = new S3Client({});

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
    }
};`;

  // s3.upload() is v2-only. The body here is a short in-memory string built above,
  // so a plain PutObject is the right replacement - lib-storage's Upload would only
  // add multipart machinery that this will never use.
  s3.send(
    new PutObjectCommand({
      Body: config,
      Bucket: bucket,
      Key: key,
      ContentType: "application/javascript",
    })
  )
    .then((msg) => {
      response.send(event, context, response.SUCCESS);
    })
    .catch((err) => {
      response.send(event, context, response.FAILED, {
        error: err,
      });
    });
};
