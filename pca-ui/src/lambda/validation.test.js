"use strict";

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");
const { mockClient } = require("aws-sdk-client-mock");

// Migrated from the AWS SDK v2 jest.mock("aws-sdk") factory to v3 client mocks.
const ddbMock = mockClient(DynamoDBClient);
const docMock = mockClient(DynamoDBDocumentClient);
const cwlMock = mockClient(CloudWatchLogsClient);

const { handler } = require("./search");

// search.js is wrapped in withAuthorization, and these events carry resource "/search"
// with method GET, which maps to the read_calls permission. Authorization therefore runs
// for real rather than being skipped, so the event needs the access token claims that
// the Cognito Pre Token Generation trigger injects in production. Without them the
// handler correctly returns 403 and the status assertions below would never reach the
// validation logic these tests are actually about.
const AUTHORIZED_REQUEST_CONTEXT = {
  authorizer: {
    claims: {
      "cognito:username": "test-user",
      "custom:pca_role": "test-role",
    },
  },
};

// The roles table lookup goes through the document client. Permissions is returned as a
// native Set because that is what lib-dynamodb unmarshalls a DynamoDB String Set into -
// v2's DocumentClient returned a { values: [...], type: 'String' } wrapper instead.
// auth-middleware.toPermissionArray handles both, and this asserts the v3 shape.
function resolveRole(permissions) {
  docMock.on(GetCommand).resolves({
    Item: {
      RoleName: "test-role",
      Permissions: new Set(permissions),
    },
  });
}

beforeEach(() => {
  ddbMock.reset();
  docMock.reset();
  cwlMock.reset();

  cwlMock.on(CreateLogStreamCommand).resolves({});
  cwlMock.on(PutLogEventsCommand).resolves({});

  resolveRole(["read_calls"]);
});

describe("mvqs validation", () => {
  it("handles valid requests", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: { S: "pk-1" },
          SK: { S: "language#en-US" },
          TK: { N: "0" },
          Data: {
            S: '{"key":"pk-1","jobName":"job-1","confidence":0.9781357594936714,"lang":"en-US","duration":236.66,"timestamp":1631865740342,"location":"America/New_York","callerSentimentScore":1.7,"callerSentimentChange":2.8}',
          },
        },
      ],
    });

    const event = {
      resource: "/search",
      path: "/search",
      httpMethod: "GET",
      requestContext: AUTHORIZED_REQUEST_CONTEXT,
      queryStringParameters: {
        language: "en-US",
      },
      body: null,
      isBase64Encoded: false,
    };

    const response = await handler(event, {});

    expect(response.statusCode).toEqual(200);
  });

  it("rejects invalid requests", async () => {
    const eventWithInvalidQueryString = {
      resource: "/search",
      path: "/search",
      httpMethod: "GET",
      requestContext: AUTHORIZED_REQUEST_CONTEXT,
      queryStringParameters: {
        language: ["invalid"],
      },
      body: null,
      isBase64Encoded: false,
    };

    const response = await handler(eventWithInvalidQueryString, {});

    expect(response.statusCode).toEqual(422);
  });

  it("denies a role that lacks read_calls", async () => {
    // Negative control. Without this, every assertion above would still pass if
    // authorization were accidentally bypassed, so this is what makes the 200 and 422
    // results above meaningful rather than coincidental.
    resolveRole(["upload_recordings"]);
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const response = await handler(
      {
        resource: "/search",
        path: "/search",
        httpMethod: "GET",
        requestContext: AUTHORIZED_REQUEST_CONTEXT,
        queryStringParameters: { language: "en-US" },
        body: null,
        isBase64Encoded: false,
      },
      {}
    );

    expect(response.statusCode).toEqual(403);
  });

  it("resolves permissions from a native Set", async () => {
    // Guards the single highest-risk behaviour change in this migration. lib-dynamodb
    // returns an SS attribute as a native Set, and the previous implementation read
    // `Permissions.values || Permissions`. A Set's `.values` is a *function*, which is
    // truthy, and Array.from of a function yields [] - so every user would have
    // resolved to zero permissions and been denied every gated route, silently.
    const { toPermissionArray } = require("./auth-middleware");

    expect(toPermissionArray(new Set(["read_calls", "manage_roles"])).sort()).toEqual([
      "manage_roles",
      "read_calls",
    ]);
    // The v2 wrapper shape still resolves, so items written before this migration
    // continue to work.
    expect(toPermissionArray({ values: ["read_calls"], type: "String" })).toEqual([
      "read_calls",
    ]);
    expect(toPermissionArray(["read_calls"])).toEqual(["read_calls"]);
    expect(toPermissionArray(undefined)).toEqual([]);
  });
});
