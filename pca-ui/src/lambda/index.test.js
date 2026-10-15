const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  BatchWriteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { mockClient } = require("aws-sdk-client-mock");
const testFile = require("./testfile.json");

// Migrated from the AWS SDK v2 jest.mock("aws-sdk") factory to v3 client mocks.
const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBClient);

const { handler } = require("./index");

/**
 * Stands in for a v3 GetObject response body.
 *
 * This is the part of the migration most likely to go unnoticed. v2 returned Body as a
 * Buffer, so the old fixture was Buffer.from(JSON.stringify(testFile)) and the handler
 * called .toString() on it. v3 returns a stream wrapper whose contents are read with
 * transformToString(). Calling .toString() on that wrapper does not throw - it returns
 * "[object Object]" - so getting this wrong surfaces as a JSON parse error about an
 * unexpected token rather than anything pointing at the SDK.
 *
 * Only transformToString is provided because that is the only method the handler uses.
 */
function mockBody(payload) {
  return {
    transformToString: async () => JSON.stringify(payload),
  };
}

beforeEach(() => {
  s3Mock.reset();
  ddbMock.reset();

  // index.js is not wrapped in withAuthorization, so no roles or audit mocks are needed
  // here - it is the SQS-driven indexer rather than an API handler.
  ddbMock.on(PutItemCommand).resolves({});
  // deleteKey runs only for "redacted-" prefixed job names, which this fixture is not,
  // but these keep an incidental call from throwing on an unstubbed command.
  ddbMock.on(QueryCommand).resolves({});
  ddbMock.on(BatchWriteItemCommand).resolves({});
});

describe("S3 Object Index Handler", () => {
  test("it works", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: mockBody(testFile),
    });

    const resp = await handler({
      Records: [
        {
          body: '{"Records":[{"eventVersion":"2.1","eventSource":"aws:s3","awsRegion":"us-east-1","eventTime":"2021-11-25T12:58:37.771Z","eventName":"ObjectCreated:Put","userIdentity":{"principalId":"example-arn"},"s3":{"s3SchemaVersion":"1.0","configurationId":"example::example-bucket/parsedFiles","bucket":{"name":"example-bucket","ownerIdentity":{"principalId":"example"},"arn":"arn:aws:s3:::example-bucket"},"object":{"key":"test-key","size":16314}}}]}',

          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:us-east-1:999999999:test-arn",
          awsRegion: "us-east-1",
        },
      ],
    });

    const getCalls = s3Mock.commandCalls(GetObjectCommand);
    expect(getCalls.length).toBe(1);
    expect(getCalls[0].args[0].input.Bucket).toBe("example-bucket");
    expect(getCalls[0].args[0].input.Key).toBe("test-key");

    expect(ddbMock.commandCalls(PutItemCommand).length).toBe(13);
  });

  test("it ignores S3 test events", async () => {
    const resp = await handler({
      Records: [
        {
          body: '{"Event":"s3:TestEvent"}',
          eventSource: "aws:sqs",
          eventSourceARN: "arn:aws:sqs:us-east-1:999999999:test-arn",
          awsRegion: "us-east-1",
        },
      ],
    });

    expect(s3Mock.commandCalls(GetObjectCommand).length).toBe(0);
    expect(ddbMock.commandCalls(PutItemCommand).length).toBe(0);
  });
});
