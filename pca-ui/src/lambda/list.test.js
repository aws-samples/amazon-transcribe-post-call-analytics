const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
  CloudWatchLogsClient,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} = require("@aws-sdk/client-cloudwatch-logs");
const { mockClient } = require("aws-sdk-client-mock");

// Migrated from the AWS SDK v2 jest.mock("aws-sdk") factory to v3 client mocks.
//
// v3 has no single module to intercept - each service is its own package and calls go
// through client.send(Command). aws-sdk-client-mock replaces the send method on a
// client's prototype, so mocks are declared per client rather than per SDK.
const ddbMock = mockClient(DynamoDBClient);
const docMock = mockClient(DynamoDBDocumentClient);
const cwlMock = mockClient(CloudWatchLogsClient);

// list.js is wrapped in withAuthorization, which pulls in auth-middleware.js and
// audit.js. Those construct a document client and a CloudWatch Logs client at module
// load, so both need a mock or the suite fails during import.
const { handler } = require("./list");

// withAuthorization now denies by default, so these events must carry the route and
// the access token claims that API Gateway supplies in production. They previously
// omitted both and relied on an unmapped route falling through the middleware
// unchecked - the very behaviour that left PUT /swap/{key+} ungated.
const AUTHORIZED_REQUEST_CONTEXT = {
  authorizer: {
    claims: {
      "cognito:username": "test-user",
      "custom:pca_role": "test-role",
    },
  },
};

function listEvent(queryStringParameters) {
  return {
    resource: "/list",
    path: "/list",
    httpMethod: "GET",
    requestContext: AUTHORIZED_REQUEST_CONTEXT,
    queryStringParameters,
  };
}

beforeEach(() => {
  ddbMock.reset();
  docMock.reset();
  cwlMock.reset();

  // Audit writes must not reject - audit.js swallows errors, but leaving these
  // unmocked would make the mock throw on an unexpected command instead.
  cwlMock.on(CreateLogStreamCommand).resolves({});
  cwlMock.on(PutLogEventsCommand).resolves({});

  // GET /list requires read_calls. lib-dynamodb returns a String Set as a native Set.
  docMock.on(GetCommand).resolves({
    Item: { RoleName: "test-role", Permissions: new Set(["read_calls"]) },
  });
});

describe("list handler", () => {
  test("it lists results", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: { S: "call#parsedFiles/stero_std_295.mp3.json" },
          SK: { S: "call" },
          Data: {
            S: '{"key":"parsedFiles/stero_std_295.mp3.json","jobName":"stero_std_295.mp3","confidence":0.8886063829787236,"lang":"en-US","duration":28.96,"timestamp":1637060698245,"location":"America/New_York"}',
          },
        },
      ],
    });

    const resp = await handler(listEvent({ count: "1" }));

    expect(resp.statusCode).toEqual(200);

    const body = JSON.parse(resp.body);
    expect(body.Records).toEqual([
      {
        key: "parsedFiles/stero_std_295.mp3.json",
        jobName: "stero_std_295.mp3",
        confidence: 0.8886063829787236,
        lang: "en-US",
        duration: 28.96,
        timestamp: 1637060698245,
        location: "America/New_York",
      },
    ]);
  });

  test("it sends Limit as a number, not the raw query string", async () => {
    // Regression guard for a v2-to-v3 difference. "count" arrives as a string, and v3
    // passes Limit through to the wire as-is where v2 coerced it, so an uncoerced value
    // would make DynamoDB reject the query with a ValidationException. Mocks do not
    // validate types, so without asserting on the sent input this would pass either way
    // and only fail against the real service.
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await handler(listEvent({ count: "25" }));

    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Limit).toBe(25);
    expect(typeof calls[0].args[0].input.Limit).toBe("number");
  });

  test("it tolerates a response with no Items", async () => {
    // v3 omits Items entirely when a query matches nothing, where v2 returned an empty
    // array. The handler maps over it, so the omission used to be a TypeError.
    ddbMock.on(QueryCommand).resolves({});

    const resp = await handler(listEvent({ count: "1" }));

    expect(resp.statusCode).toEqual(200);
    expect(JSON.parse(resp.body).Records).toEqual([]);
  });

  test("it paginates results", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          TK: { N: "1631778951067" },
          SK: { S: "call" },
          PK: {
            S: "call#parsedFiles/AutoRepairs1_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav.json",
          },
          Data: {
            S: '{"key":"parsedFiles/AutoRepairs1_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav.json","jobName":"AutoRepairs1","confidence":0.97,"lang":"en-US","duration":245.26,"timestamp":1631778951067,"location":"America/New_York"}',
          },
        },
      ],
      Count: 1,
      ScannedCount: 1,
      LastEvaluatedKey: {
        TK: { N: "1631779340342" },
        PK: { S: "call#parsedFiles/next.wav.json" },
        SK: { S: "call" },
      },
    });

    const resp = await handler(
      listEvent({ count: "2", timestampFrom: "1631779340342" })
    );

    expect(resp.statusCode).toEqual(200);

    const body = JSON.parse(resp.body);
    expect(body.StartKey).toEqual("call#parsedFiles/next.wav.json");
    expect(body.timestampFrom).toEqual("1631779340342");
  });
});
