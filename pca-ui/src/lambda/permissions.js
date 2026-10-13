const AWS = require("aws-sdk");

const ddb = new AWS.DynamoDB.DocumentClient();
const rolesTableName = process.env.RolesTableName;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type,Authorization",
  "access-control-allow-methods": "OPTIONS,GET",
};

exports.handler = async function (event) {
  try {
    const claims =
      event.requestContext &&
      event.requestContext.authorizer &&
      event.requestContext.authorizer.claims;

    const username =
      (claims && (claims["cognito:username"] || claims.username || claims.sub)) || null;

    if (!username) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ role: null, permissions: [] }),
      };
    }

    // Read custom:pca_role directly from the access token claims
    // (injected by the Pre-Token Generation V2 Lambda trigger)
    const roleName = (claims && claims["custom:pca_role"]) || null;

    if (!roleName) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ role: null, permissions: [] }),
      };
    }

    const result = await ddb
      .get({
        TableName: rolesTableName,
        Key: { RoleName: roleName },
      })
      .promise();

    if (!result.Item) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ role: null, permissions: [] }),
      };
    }

    const permissions = result.Item.Permissions
      ? Array.from(result.Item.Permissions.values || result.Item.Permissions)
      : [];

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ role: roleName, permissions }),
    };
  } catch (err) {
    console.error("Permissions handler error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
