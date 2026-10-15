const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { logAuditEvent } = require("./audit");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const rolesTableName = process.env.RolesTableName;

const PERMISSION_MAP = {
  "GET /list": "read_calls",
  "GET /head/{key+}": "read_calls",
  "GET /get/{key+}": "read_calls",
  "GET /search": "read_calls",
  "GET /entities": "read_calls",
  "GET /languages": "read_calls",
  "GET /presign": "upload_recordings",
  // Swapping speaker attribution mutates an existing call, so gating it on a *read*
  // permission is a deliberate exception rather than an oversight. The reasoning: the
  // action corrects a call you can already see, and the only alternative among the
  // existing permissions is delete_calls - which would force anyone who needs to fix a
  // mislabelled speaker to also hold deletion rights.
  //
  // The practical effect is that anyone who can open a call can re-attribute its
  // speakers. That is accepted. What it fixes is the previous state, where the route
  // was unmapped and the handler unwrapped, so a caller with no read_calls at all
  // could mutate a call they could not view.
  //
  // If "may correct call data" ever needs separating from "may view call data", add an
  // edit_calls permission rather than reusing delete_calls - and note that
  // role-seeder.js only seeds on stack Create, so existing roles will not pick up a new
  // permission on update. Full rationale and migration notes in
  // docs/security-findings.md under "Decision: read_calls governs speaker swap".
  "PUT /swap/{key+}": "read_calls",
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
 * Normalises a DynamoDB String Set of permissions into a plain array of strings.
 *
 * This exists because the two SDK generations return different shapes, and getting it
 * wrong fails silently rather than loudly:
 *
 *   - v3 (@aws-sdk/lib-dynamodb) unmarshalls an SS attribute to a native Set.
 *   - v2 (DocumentClient) returned a wrapper object, { values: [...], type: 'String' }.
 *
 * The previous implementation was `Array.from(Permissions.values || Permissions)`, which
 * reads the v2 wrapper. Against a native Set that is actively wrong rather than merely
 * outdated: a Set's `.values` is a *function*, which is truthy, and Array.from of a
 * function yields []. Every user would have resolved to zero permissions and been denied
 * every gated route - a total lockout, and a silent one, since nothing throws.
 *
 * Handles all three shapes so the function does not care which SDK produced the item.
 */
/**
 * Extracts the acting username from API Gateway Cognito authorizer claims.
 *
 * Shared so the deny-by-default branch below can attribute an audit entry without
 * performing a roles-table lookup it has no use for.
 */
function usernameFromEvent(event) {
  const claims =
    event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.claims;

  return (
    (claims && (claims["cognito:username"] || claims.username || claims.sub)) || null
  );
}

function toPermissionArray(value) {
  if (!value) {
    return [];
  }
  if (value instanceof Set || Array.isArray(value)) {
    return Array.from(value);
  }
  // v2 DocumentClient Set wrapper. Checked with Array.isArray rather than for
  // truthiness, so a native Set's `.values` method cannot be mistaken for data.
  if (Array.isArray(value.values)) {
    return Array.from(value.values);
  }
  return [];
}

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

  const username = usernameFromEvent(event);

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
    const result = await ddb.send(
      new GetCommand({
        TableName: rolesTableName,
        Key: { RoleName: roleName },
      })
    );

    if (!result.Item) {
      return { authorized: false, role: roleName, permissions: [], username };
    }

    const permissions = toPermissionArray(result.Item.Permissions);

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

    // Deny by default.
    //
    // This branch previously returned handler(event, context) with no authorization at
    // all, which treated "route not listed" as "route is public". That is how
    // PUT /swap/{key+} came to be callable by any authenticated user regardless of
    // role: adding the wrapper alone was never enough, because an unmapped route sailed
    // straight through it.
    //
    // Failing closed inverts the failure mode. A newly added route is now unreachable
    // until it is mapped, which is an obvious bug someone fixes in minutes, rather than
    // an open endpoint nobody notices. Verified at the time of this change that every
    // route served by a wrapped handler is present in PERMISSION_MAP, so this is not a
    // behavioural change for any existing route.
    //
    // Note the GenAI routes are deliberately absent: they are served by Python handlers
    // that never pass through this middleware, so an entry here would be inert while
    // reading as coverage. Their authorization is tracked separately - do not "fix"
    // their absence by adding them to this map.
    if (!requiredPermission) {
      console.error(
        `[auth] No PERMISSION_MAP entry for route "${routeKey}" - denying request. ` +
          `If this route should be reachable, add it to PERMISSION_MAP.`
      );

      await logAuditEvent(
        {
          action: "AUTH_DENIED",
          username: usernameFromEvent(event) || "unknown",
          details: {
            deniedAction: routeKey,
            reason: "route_not_mapped",
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
  toPermissionArray,
  usernameFromEvent,
};
