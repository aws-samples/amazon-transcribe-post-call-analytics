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
        // Raw attribute-value maps are unchanged between v2 and v3 when using the
        // low-level client, so { S: "entity" } stays as it is. Only lib-dynamodb's
        // document client takes plain JavaScript values.
        res = await ddb.send(
            new QueryCommand({
                TableName: tableName,
                IndexName: "GSI1",
                KeyConditionExpression: "SK = :entity",
                ExpressionAttributeValues: {
                    ":entity": {
                        S: "entity",
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
        // v3 omits Items when a query matches nothing, where v2 returned an empty
        // array. Without the fallback this would be a TypeError on an empty table.
        body: JSON.stringify(
            (res.Items || []).map((item) => {
                return item.PK.S.substring(7);
            })
        ),
    };
};

exports.handler = withAuthorization(handler);
