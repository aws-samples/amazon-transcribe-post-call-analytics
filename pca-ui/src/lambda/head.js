const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();

const tableName = process.env.TableName;

async function getHeader(key) {
    let res;
    try {
        res = await ddb
            .getItem({
                TableName: tableName,
                Key: {
                    PK: {
                        S: `call#${key}`,
                    },
                    SK: {
                        S: "call",
                    },
                },
            })
            .promise();
    } catch (e) {
        throw e;
    }
    console.log(res);

    return res.Item.Data.S;
}

exports.handler = async function (event, context) {
    console.log("Event:", JSON.stringify(event, null, 4));

    const key = event.pathParameters.key;

    const header = await getHeader(key);

    return {
        statusCode: 200,
        headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "Content-Type,Authorization",
            "access-control-allow-methods": "OPTIONS,GET",
        },
        body: header,
    };
};
