const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { withAuthorization, toPermissionArray } = require("./auth-middleware");
const { logAuditEvent } = require("./audit");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const rolesTableName = process.env.RolesTableName;

const VALID_PERMISSIONS = ["read_calls", "upload_recordings", "delete_calls", "manage_roles"];

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

async function listRoles() {
  const result = await ddb.send(new ScanCommand({ TableName: rolesTableName }));

  const roles = (result.Items || []).map((item) => ({
    RoleName: item.RoleName,
    Permissions: toPermissionArray(item.Permissions),
    CreatedBy: item.CreatedBy || null,
    CreatedAt: item.CreatedAt || null,
    UpdatedAt: item.UpdatedAt || null,
  }));

  return jsonResponse(200, roles);
}

async function createRole(body, authContext, context) {
  const { roleName } = body;
  let { permissions } = body;

  // Ensure read_calls is included when delete_calls is selected
  permissions = permissions || [];
  if (permissions.includes("delete_calls") && !permissions.includes("read_calls")) {
    permissions.push("read_calls");
  }

  // Validate permissions
  const invalid = permissions.filter(
    (p) => !VALID_PERMISSIONS.includes(p)
  );
  if (invalid.length > 0) {
    return jsonResponse(400, {
      message: "Bad Request: invalid permissions",
      invalid,
    });
  }

  // Check for duplicate
  const existing = await ddb.send(
    new GetCommand({ TableName: rolesTableName, Key: { RoleName: roleName } })
  );

  if (existing.Item) {
    return jsonResponse(409, {
      message: `Conflict: role '${roleName}' already exists`,
    });
  }

  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: rolesTableName,
      Item: {
        RoleName: roleName,
        // v3 has no ddb.createSet(). lib-dynamodb marshalls a native Set to an SS
        // attribute, which keeps the stored type identical to what v2 wrote - important,
        // because existing roles in the table were written as SS and are read back by
        // toPermissionArray.
        Permissions: new Set(permissions),
        CreatedBy: authContext.username,
        CreatedAt: now,
        UpdatedAt: now,
      },
    })
  );

  await logAuditEvent(
    {
      action: "ROLE_CREATED",
      username: authContext.username,
      details: { roleName, permissions },
    },
    context
  );

  return jsonResponse(200, {
    RoleName: roleName,
    Permissions: permissions,
    CreatedBy: authContext.username,
    CreatedAt: now,
    UpdatedAt: now,
  });
}

async function updateRole(roleName, body, authContext, context) {
  let { permissions } = body;

  // Ensure read_calls is included when delete_calls is selected
  permissions = permissions || [];
  if (permissions.includes("delete_calls") && !permissions.includes("read_calls")) {
    permissions.push("read_calls");
  }

  // Validate permissions
  const invalid = permissions.filter(
    (p) => !VALID_PERMISSIONS.includes(p)
  );
  if (invalid.length > 0) {
    return jsonResponse(400, {
      message: "Bad Request: invalid permissions",
      invalid,
    });
  }

  const now = new Date().toISOString();

  await ddb.send(
    new UpdateCommand({
      TableName: rolesTableName,
      Key: { RoleName: roleName },
      UpdateExpression: "SET #P = :p, UpdatedAt = :u",
      ExpressionAttributeNames: {
        "#P": "Permissions",
      },
      ExpressionAttributeValues: {
        // Second createSet replacement. This one sits inside
        // ExpressionAttributeValues rather than an Item, which makes it the easier of
        // the two to overlook.
        ":p": new Set(permissions),
        ":u": now,
      },
    })
  );

  await logAuditEvent(
    {
      action: "ROLE_UPDATED",
      username: authContext.username,
      details: { roleName, permissions },
    },
    context
  );

  return jsonResponse(200, {
    RoleName: roleName,
    Permissions: permissions,
    UpdatedAt: now,
  });
}

async function deleteRole(roleName, authContext, context) {
  // Prevent deleting any role that has manage_roles permission
  const existing = await ddb.send(
    new GetCommand({ TableName: rolesTableName, Key: { RoleName: roleName } })
  );

  if (existing.Item) {
    const perms = toPermissionArray(existing.Item.Permissions);
    if (perms.includes("manage_roles")) {
      return jsonResponse(403, {
        message: "Forbidden: cannot delete a role with manage_roles permission",
      });
    }
  }

  await ddb.send(
    new DeleteCommand({ TableName: rolesTableName, Key: { RoleName: roleName } })
  );

  await logAuditEvent(
    {
      action: "ROLE_DELETED",
      username: authContext.username,
      details: { roleName },
    },
    context
  );

  return jsonResponse(200, { message: `Role '${roleName}' deleted` });
}

async function routeHandler(event, context, authContext) {
  const method = event.httpMethod;
  const resource = event.resource;

  try {
    if (method === "GET" && resource === "/roles") {
      return await listRoles();
    }

    if (method === "POST" && resource === "/roles") {
      const body = JSON.parse(event.body || "{}");
      return await createRole(body, authContext, context);
    }

    if (method === "PUT" && resource === "/roles/{roleName}") {
      const roleName = event.pathParameters && event.pathParameters.roleName;
      const body = JSON.parse(event.body || "{}");
      return await updateRole(roleName, body, authContext, context);
    }

    if (method === "DELETE" && resource === "/roles/{roleName}") {
      const roleName = event.pathParameters && event.pathParameters.roleName;
      return await deleteRole(roleName, authContext, context);
    }

    return jsonResponse(400, { message: "Bad Request: unsupported route" });
  } catch (err) {
    console.error("Role handler error:", err);
    return jsonResponse(500, { message: "Internal Server Error" });
  }
}

exports.handler = withAuthorization(routeHandler);
