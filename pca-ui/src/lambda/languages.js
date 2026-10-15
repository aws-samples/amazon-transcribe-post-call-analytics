const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { withAuthorization } = require("./auth-middleware");
const ddb = new DynamoDBClient({});

const tableName = process.env.TableName;

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

    let res;
    try {
        res = await ddb.send(
            new QueryCommand({
                TableName: tableName,
                IndexName: "GSI1",
                KeyConditionExpression: "SK = :language",
                ExpressionAttributeValues: {
                    ":language": {
                        S: "language",
                    },
                },
            })
        );
    } catch (e) {
        throw e;
    }
    console.log("Result:", res);

    return {
        statusCode: 200,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type,Authorization",
            "access-control-allow-methods": "OPTIONS,GET",
        },
        // v3 omits Items entirely when nothing matches; v2 returned an empty array.
        body: JSON.stringify(
            (res.Items || []).map((item) => {
                return item.Data.S;
            })
        ),
    };
}

exports.handler = withAuthorization(handler);
