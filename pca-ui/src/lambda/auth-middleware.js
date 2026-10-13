const AWS = require("aws-sdk");
const { logAuditEvent } = require("./audit");

const ddb = new AWS.DynamoDB.DocumentClient();
const rolesTableName = process.env.RolesTableName;

const PERMISSION_MAP = {
  "GET /list": "read_calls",
  "GET /head/{key+}": "read_calls",
  "GET /get/{key+}": "read_calls",
  "GET /search": "read_calls",
  "GET /entities": "read_calls",
  "GET /languages": "read_calls",
  "GET /genaiquery": "read_calls",
  "GET /presign": "upload_recordings",
  "DELETE /delete/{key+}": "delete_calls",
  "POST /delete/batch": "delete_calls",
  "GET /roles": "manage_roles",
  "POST /roles": "manage_roles",
  "PUT /roles/{roleName}": "manage_roles",
  "DELETE /roles/{roleName}": "manage_roles",
  "GET /users": "manage_roles",
  "PUT /users/{username}/role": "manage_roles",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type,Authorization",
  "access-control-allow-methods": "OPTIONS,GET,PUT,DELETE,POST",
};

/**
 * Resolves the user's identity and role from access token claims,
 * then checks permissions in the Roles Table.
 *
 * The custom:pca_role claim is injected into the access token by the
 * Cognito Pre-Token Generation V2 trigger.
 */
async function authorize(event) {
  const claims =
    event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.claims;

  const username =
    (claims && (claims["cognito:username"] || claims.username || claims.sub)) || null;

  if (!username) {
    return { authorized: false, role: null, permissions: [], username: null };
  }

  // Read custom:pca_role directly from the access token claims
  // (injected by the Pre-Token Generation V2 Lambda trigger)
  const roleName = (claims && claims["custom:pca_role"]) || null;

  if (!roleName) {
    return { authorized: false, role: null, permissions: [], username };
  }

  try {
    const result = await ddb
      .get({
        TableName: rolesTableName,
        Key: { RoleName: roleName },
      })
      .promise();

    if (!result.Item) {
      return { authorized: false, role: roleName, permissions: [], username };
    }

    // DynamoDB DocumentClient returns Sets as { values: [...], type: 'String' }
    // We need .values to get the actual permission strings
    const permissions = result.Item.Permissions
      ? Array.from(result.Item.Permissions.values || result.Item.Permissions)
      : [];

    return { authorized: true, role: roleName, permissions, username };
  } catch (err) {
    console.error("Error looking up role:", err);
    return { authorized: false, role: roleName, permissions: [], username };
  }
}

/**
 * Higher-order function that wraps a Lambda handler with authorization.
 *
 * The wrapped handler receives (event, context, authContext) where
 * authContext = { role, permissions, username }.
 */
function withAuthorization(handler) {
  return async function (event, context) {
    const httpMethod = event.httpMethod || "";
    const resource = event.resource || "";
    const routeKey = `${httpMethod} ${resource}`;

    const requiredPermission = PERMISSION_MAP[routeKey];

    if (!requiredPermission) {
      return handler(event, context);
    }

    const authResult = await authorize(event);
    const { authorized, role, permissions, username } = authResult;

    let hasPermission = false;

    if (authorized) {
      hasPermission = permissions.includes(requiredPermission);
    }

    if (!hasPermission) {
      await logAuditEvent(
        {
          action: "AUTH_DENIED",
          username: username || "unknown",
          details: {
            deniedAction: routeKey,
            userRole: role,
            requiredPermission,
            invalidRole: authorized ? null : role,
          },
        },
        context
      );

      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: "Forbidden: insufficient permissions",
        }),
      };
    }

    const authContext = { role, permissions, username };
    return handler(event, context, authContext);
  };
}

module.exports = {
  PERMISSION_MAP,
  authorize,
  withAuthorization,
};
