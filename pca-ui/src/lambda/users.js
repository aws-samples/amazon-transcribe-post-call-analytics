const AWS = require("aws-sdk");
const { withAuthorization } = require("./auth-middleware");
const { logAuditEvent } = require("./audit");

const cognito = new AWS.CognitoIdentityServiceProvider();
const ddb = new AWS.DynamoDB.DocumentClient();

const userPoolId = process.env.UserPoolId;
const rolesTableName = process.env.RolesTableName;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type,Authorization",
  "access-control-allow-methods": "OPTIONS,GET,PUT,DELETE,POST",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Extracts an attribute value from a Cognito user's Attributes array.
 */
function getUserAttribute(user, attrName) {
  const attr = (user.Attributes || []).find((a) => a.Name === attrName);
  return attr ? attr.Value : null;
}

/**
 * Lists all Cognito users with username, email, and assigned role.
 */
async function listUsers() {
  const users = [];
  let paginationToken;

  do {
    const params = { UserPoolId: userPoolId };
    if (paginationToken) {
      params.PaginationToken = paginationToken;
    }

    const result = await cognito.listUsers(params).promise();

    for (const user of result.Users || []) {
      users.push({
        username: user.Username,
        email: getUserAttribute(user, "email"),
        role: getUserAttribute(user, "custom:pca_role"),
      });
    }

    paginationToken = result.PaginationToken;
  } while (paginationToken);

  return jsonResponse(200, users);
}

/**
 * Assigns a role to a Cognito user after validating the role exists.
 */
async function assignRole(username, roleName, authContext, context) {
  // Validate role exists in Roles Table
  const roleResult = await ddb
    .get({ TableName: rolesTableName, Key: { RoleName: roleName } })
    .promise();

  if (!roleResult.Item) {
    return jsonResponse(400, {
      message: `Bad Request: role '${roleName}' does not exist`,
    });
  }

  // Get current role for audit logging
  let previousRole = null;
  try {
    const userResult = await cognito
      .adminGetUser({ UserPoolId: userPoolId, Username: username })
      .promise();
    previousRole = getUserAttribute(userResult, "custom:pca_role");
  } catch (err) {
    if (err.code === "UserNotFoundException") {
      return jsonResponse(404, {
        message: `Not Found: user '${username}' does not exist`,
      });
    }
    throw err;
  }

  // Update the user's custom:pca_role attribute
  await cognito
    .adminUpdateUserAttributes({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [
        { Name: "custom:pca_role", Value: roleName },
      ],
    })
    .promise();

  // Log audit event
  await logAuditEvent(
    {
      action: "USER_ROLE_CHANGED",
      username: authContext.username,
      details: {
        targetUsername: username,
        previousRole: previousRole,
        newRole: roleName,
      },
    },
    context
  );

  return jsonResponse(200, {
    username,
    previousRole,
    newRole: roleName,
  });
}

async function routeHandler(event, context, authContext) {
  const method = event.httpMethod;
  const resource = event.resource;

  try {
    if (method === "GET" && resource === "/users") {
      return await listUsers();
    }

    if (method === "PUT" && resource === "/users/{username}/role") {
      const username = event.pathParameters && event.pathParameters.username;
      const body = JSON.parse(event.body || "{}");
      return await assignRole(username, body.roleName, authContext, context);
    }

    return jsonResponse(400, { message: "Bad Request: unsupported route" });
  } catch (err) {
    console.error("User handler error:", err);
    return jsonResponse(500, { message: "Internal Server Error" });
  }
}

exports.handler = withAuthorization(routeHandler);
