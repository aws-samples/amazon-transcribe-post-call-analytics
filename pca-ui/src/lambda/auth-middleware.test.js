"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");
const { mockClient } = require("aws-sdk-client-mock");

const docMock = mockClient(DynamoDBDocumentClient);
const cwlMock = mockClient(CloudWatchLogsClient);

const { withAuthorization, PERMISSION_MAP } = require("./auth-middleware");

function eventFor(httpMethod, resource, role = "test-role") {
  return {
    httpMethod,
    resource,
    requestContext: {
      authorizer: {
        claims: {
          "cognito:username": "test-user",
          "custom:pca_role": role,
        },
      },
    },
  };
}

function resolveRole(permissions) {
  docMock.on(GetCommand).resolves({
    Item: { RoleName: "test-role", Permissions: new Set(permissions) },
  });
}

beforeEach(() => {
  docMock.reset();
  cwlMock.reset();
  cwlMock.on(CreateLogStreamCommand).resolves({});
  cwlMock.on(PutLogEventsCommand).resolves({});
  resolveRole(["read_calls"]);
});

describe("withAuthorization", () => {
  it("denies a route that is not in PERMISSION_MAP", async () => {
    // The core of the fix. This branch used to invoke the handler with no check, which
    // is how an unwrapped-and-unmapped route became reachable by any authenticated
    // user. The inner handler must not run at all.
    const inner = jest.fn();
    const wrapped = withAuthorization(inner);

    const response = await wrapped(eventFor("GET", "/not-mapped"), {});

    expect(response.statusCode).toEqual(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("records an unmapped route as a distinct audit reason", async () => {
    // A misconfigured route and a user without rights both return 403, so the audit
    // entry has to distinguish them - otherwise a configuration gap is indistinguishable
    // from ordinary access denials in the log.
    const wrapped = withAuthorization(jest.fn());

    await wrapped(eventFor("GET", "/not-mapped"), {});

    const events = cwlMock.commandCalls(PutLogEventsCommand);
    expect(events).toHaveLength(1);

    const logged = JSON.parse(events[0].args[0].input.logEvents[0].message);
    expect(logged.action).toEqual("AUTH_DENIED");
    expect(logged.details.reason).toEqual("route_not_mapped");
    expect(logged.username).toEqual("test-user");
  });

  it("allows a mapped route when the role holds the permission", async () => {
    const inner = jest.fn().mockResolvedValue({ statusCode: 200 });
    const wrapped = withAuthorization(inner);

    const response = await wrapped(eventFor("GET", "/list"), {});

    expect(response.statusCode).toEqual(200);
    expect(inner).toHaveBeenCalled();
  });

  it("passes the resolved authContext to the handler", async () => {
    // swap.js reads authContext.username for its audit entry, so this is the contract
    // that keeps that attribution correct rather than "unknown".
    const inner = jest.fn().mockResolvedValue({ statusCode: 200 });
    const wrapped = withAuthorization(inner);

    await wrapped(eventFor("GET", "/list"), {});

    const authContext = inner.mock.calls[0][2];
    expect(authContext.username).toEqual("test-user");
    expect(authContext.role).toEqual("test-role");
    expect(authContext.permissions).toContain("read_calls");
  });

  it("denies a mapped route when the role lacks the permission", async () => {
    resolveRole(["upload_recordings"]);
    const inner = jest.fn();
    const wrapped = withAuthorization(inner);

    const response = await wrapped(eventFor("GET", "/list"), {});

    expect(response.statusCode).toEqual(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("gates PUT /swap/{key+} on read_calls", async () => {
    // Regression guard for TD-13. The route was absent from the map and the handler was
    // unwrapped, so it accepted any authenticated caller.
    expect(PERMISSION_MAP["PUT /swap/{key+}"]).toEqual("read_calls");
  });

  it("does not map the GenAI routes", async () => {
    // Those routes are served by Python handlers that never reach this middleware, so
    // an entry here would be inert while reading as coverage. A previous dead entry for
    // GET /genaiquery did exactly that. If this assertion ever fails, the entry was
    // added back without the Python handler actually consulting it.
    expect(PERMISSION_MAP["GET /genaiquery"]).toBeUndefined();
    expect(PERMISSION_MAP["GET /genai/refreshsummary"]).toBeUndefined();
  });
});
