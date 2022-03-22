const AWS = require("aws-sdk");
const {
  listSchema,
  withQueryStringValidation,
  response,
} = require("./validation");
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

const DEFAULT_COUNT = 100;

async function handler(event, context) {
  console.log(
    JSON.stringify(
      {
        event: event,
        context: context,
      },
      null,
      4
    )
  );

  let start = null;
  let count = DEFAULT_COUNT;

  if (event.queryStringParameters != null) {
    if (
      "startKey" in event.queryStringParameters &&
      "timestampFrom" in event.queryStringParameters
    ) {
      start = {
        PK: {
          S: `call#${event.queryStringParameters.startKey}`,
        },
        SK: {
          S: "call",
        },
        TK: {
          N: event.queryStringParameters.timestampFrom,
        },
      };
    }

    if ("count" in event.queryStringParameters) {
      count = event.queryStringParameters.count;
    }
  }

  let query = {
    TableName: tableName,
    IndexName: "GSI1",
    ScanIndexForward: "reverse" in (event?.queryStringParameters || {}),
    Limit: count,
    KeyConditionExpression: "SK = :sk",
    ExpressionAttributeValues: {
      ":sk": {
        S: "call",
      },
    },
  };

  if (start != null) {
    query.ExclusiveStartKey = start;
  }

  console.log("Query:", JSON.stringify(query, null, 4));

  let res;
  try {
    res = await ddb.query(query).promise();
  } catch (e) {
    throw e;
  }
  console.log(res);

  const body = {
    Records: res.Items.map((item) => {
      return JSON.parse(item.Data.S);
    }),
  };

  if (res.LastEvaluatedKey) {
    body.StartKey = res.LastEvaluatedKey.PK.S;
    body.timestampFrom = res.LastEvaluatedKey.TK.N;
  }

  return response(200, body, {
    "access-control-allow-methods": "OPTIONS,GET",
  });
}

exports.handler = withQueryStringValidation(handler, listSchema);
