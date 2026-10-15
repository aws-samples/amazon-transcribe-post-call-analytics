const {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const https = require("https");
const url = require("url");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
// Two identical clients existed under v2 and are kept separate here only to preserve
// the original structure; they have no differing configuration.
const cognitoRaw = new CognitoIdentityProviderClient({});

const rolesTableName = process.env.RolesTableName;
const userPoolId = process.env.UserPoolId;
const adminUsername = process.env.AdminUsername;

async function sendResponse(event, context, status, data) {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: "See CloudWatch Log Stream: " + context.logStreamName,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data || {},
  });

  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: {
      "content-type": "",
      "content-length": responseBody.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, resolve);
    req.on("error", reject);
    req.write(responseBody);
    req.end();
  });
}

async function logEnvironment() {
  console.log("[RoleSeeder] === Environment ===");
  console.log("[RoleSeeder] RolesTableName:", rolesTableName);
  console.log("[RoleSeeder] UserPoolId:", userPoolId);
  console.log("[RoleSeeder] AdminUsername:", adminUsername);
  console.log("[RoleSeeder] AWS Region:", process.env.AWS_REGION);
  console.log("[RoleSeeder] Function Name:", process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function describeUserPool() {
  console.log("[RoleSeeder] === Describing User Pool ===");
  try {
    const result = await cognitoRaw.send(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId })
    );
    const schema = result.UserPool.SchemaAttributes;
    console.log("[RoleSeeder] User Pool Name:", result.UserPool.Name);
    console.log("[RoleSeeder] User Pool Status:", result.UserPool.Status);
    console.log("[RoleSeeder] Schema attribute count:", schema.length);

    const customAttrs = schema.filter((a) => a.Name.startsWith("custom:"));
    console.log("[RoleSeeder] Custom attributes:", JSON.stringify(customAttrs, null, 2));

    const pcaRole = schema.find((a) => a.Name === "custom:pca_role");
    if (pcaRole) {
      console.log("[RoleSeeder] custom:pca_role FOUND in schema:", JSON.stringify(pcaRole));
    } else {
      console.log("[RoleSeeder] custom:pca_role NOT FOUND in schema");
      console.log("[RoleSeeder] All attribute names:", schema.map((a) => a.Name).join(", "));
    }
    return !!pcaRole;
  } catch (err) {
    console.error("[RoleSeeder] Failed to describe user pool:", err.name, err.message);
    return false;
  }
}

async function lookupAdminUser() {
  console.log("[RoleSeeder] === Looking up admin user ===");
  try {
    const result = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: adminUsername })
    );
    console.log("[RoleSeeder] Admin user found. Status:", result.UserStatus);
    console.log("[RoleSeeder] Admin user enabled:", result.Enabled);
    console.log(
      "[RoleSeeder] Admin user attributes:",
      JSON.stringify(result.UserAttributes, null, 2)
    );
    return true;
  } catch (err) {
    console.error("[RoleSeeder] Admin user lookup failed:", err.name, err.message);
    return false;
  }
}

async function seedRoles() {
  console.log("[RoleSeeder] === Seeding roles ===");
  const now = new Date().toISOString();

  console.log("[RoleSeeder] Writing 'admin' role to", rolesTableName);
  await ddb.send(
    new PutCommand({
      TableName: rolesTableName,
      Item: {
        RoleName: "admin",
        // v3 has no ddb.createSet(); lib-dynamodb marshalls a native Set to SS, which
        // keeps the stored attribute type the same as what v2 wrote.
        Permissions: new Set([
          "read_calls",
          "upload_recordings",
          "delete_calls",
          "manage_roles",
        ]),
        CreatedBy: "system",
        CreatedAt: now,
        UpdatedAt: now,
      },
    })
  );
  console.log("[RoleSeeder] 'admin' role written successfully");

  console.log("[RoleSeeder] Writing 'call-readwrite' role to", rolesTableName);
  await ddb.send(
    new PutCommand({
      TableName: rolesTableName,
      Item: {
        RoleName: "call-readwrite",
        Permissions: new Set(["read_calls", "upload_recordings"]),
        CreatedBy: "system",
        CreatedAt: now,
        UpdatedAt: now,
      },
    })
  );
  console.log("[RoleSeeder] 'call-readwrite' role written successfully");
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setAdminRole(retries = 5, delayMs = 3000) {
  console.log("[RoleSeeder] === Setting admin role ===");
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[RoleSeeder] Attempt ${attempt}/${retries} - calling adminUpdateUserAttributes`);
    console.log("[RoleSeeder] Params:", JSON.stringify({
      UserPoolId: userPoolId,
      Username: adminUsername,
      UserAttributes: [{ Name: "custom:pca_role", Value: "admin" }],
    }));
    try {
      const result = await cognito.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: adminUsername,
          UserAttributes: [{ Name: "custom:pca_role", Value: "admin" }],
        })
      );
      console.log("[RoleSeeder] adminUpdateUserAttributes succeeded:", JSON.stringify(result));
      return;
    } catch (err) {
      console.error(`[RoleSeeder] Attempt ${attempt}/${retries} FAILED`);
      console.error("[RoleSeeder] Error name:", err.name);
      console.error("[RoleSeeder] Error message:", err.message);
      console.error("[RoleSeeder] Error statusCode:", err.$metadata?.httpStatusCode);
      console.error("[RoleSeeder] Error retryable:", err.$retryable?.throttling);
      console.error("[RoleSeeder] Error requestId:", err.$metadata?.requestId);

      // err.name, not err.code. This condition is load-bearing: it gates the retry
      // that waits for the custom:pca_role schema attribute to propagate through the
      // user pool. Under v3 err.code is undefined, so the condition would never match,
      // the seeder would throw on the first attempt, and this custom resource - and
      // therefore the entire stack deployment - would fail.
      if (
        err.name === "InvalidParameterException" &&
        err.message.includes("Attribute does not exist in the schema") &&
        attempt < retries
      ) {
        // Re-check the schema to see current state
        console.log("[RoleSeeder] Re-checking user pool schema before retry...");
        await describeUserPool();
        console.log(`[RoleSeeder] Waiting ${delayMs}ms before retry...`);
        await sleep(delayMs);
      } else {
        console.error("[RoleSeeder] Non-retryable error or max retries reached. Throwing.");
        throw err;
      }
    }
  }
}

exports.handler = async function (event, context) {
  console.log("[RoleSeeder] === Handler invoked ===");
  console.log("[RoleSeeder] Event:", JSON.stringify(event, null, 2));
  console.log("[RoleSeeder] RequestType:", event.RequestType);
  console.log("[RoleSeeder] Remaining time (ms):", context.getRemainingTimeInMillis());

  try {
    await logEnvironment();

    if (event.RequestType === "Create") {
      // Inspect the user pool schema before doing anything
      const hasAttribute = await describeUserPool();
      console.log("[RoleSeeder] Schema has custom:pca_role:", hasAttribute);

      // Check if admin user exists
      const userExists = await lookupAdminUser();
      console.log("[RoleSeeder] Admin user exists:", userExists);

      // Seed roles
      await seedRoles();
      console.log("[RoleSeeder] Role seeding complete");

      // Set admin role on Cognito user
      await setAdminRole();
      console.log("[RoleSeeder] Admin role assignment complete");
    } else {
      console.log("[RoleSeeder] RequestType is", event.RequestType, "- no action needed");
    }

    console.log("[RoleSeeder] Sending SUCCESS response");
    await sendResponse(event, context, "SUCCESS");
    console.log("[RoleSeeder] Done");
  } catch (err) {
    console.error("[RoleSeeder] === FATAL ERROR ===");
    console.error("[RoleSeeder] Error name:", err.name);
    console.error("[RoleSeeder] Error message:", err.message);
    console.error("[RoleSeeder] Error stack:", err.stack);
    await sendResponse(event, context, "FAILED", {
      Error: err.message,
    });
  }
};