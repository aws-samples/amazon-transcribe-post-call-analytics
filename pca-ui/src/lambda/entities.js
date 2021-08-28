const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

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

    let res;
    try {
        res = await ddb
            .query({
                TableName: tableName,
                IndexName: "GSI1",
                KeyConditionExpression: "SK = :entity",
                ExpressionAttributeValues: {
                    ":entity": {
                        S: "entity",
                    },
                },
            })
            .promise();
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
        body: JSON.stringify(
            res.Items.map((item) => {
                return item.PK.S.substring(7);
            })
        ),
    };
};
