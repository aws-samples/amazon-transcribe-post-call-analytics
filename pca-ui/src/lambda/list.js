const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

const DEFAULT_COUNT = 100;

exports.handler = async function (event, context) {
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
      "startTimestamp" in event.queryStringParameters
    ) {
      start = {
        PK: {
          S: `call#${event.queryStringParameters.startKey}`,
        },
        SK: {
          S: "call",
        },
        TK: {
          N: event.queryStringParameters.startTimestamp,
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
    ScanIndexForward: "reverse" in event.queryStringParameters,
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

  const resp = {
    statusCode: 200,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Content-Type,Authorization",
      "access-control-allow-methods": "OPTIONS,GET",
    },
    body: {
      Records: JSON.stringify(
        res.Items.map((item) => {
          return JSON.parse(item.Data.S);
        })
      ),
    },
  };

  if (res.LastEvaluatedKey) {
    resp.body.PaginationToken = res.LastEvaluatedKey.PK.S;
  }

  console.log({ resp });

  return resp;
};
