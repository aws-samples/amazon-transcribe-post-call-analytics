const { handler } = require("./index");
const AWS = require("aws-sdk");
const testFile = require("./testfile.json");

jest.mock("aws-sdk", () => {
  const mockDynamoClient = {
    query: jest.fn().mockReturnThis(),
    promise: jest.fn().mockReturnThis(),
    batchWriteItem: jest.fn().mockReturnThis(),
    putItem: jest.fn().mockReturnThis(),
  };

  const mockS3Client = {
    getObject: jest.fn().mockReturnThis(),
    promise: jest.fn().mockReturnThis(),
  };

  return {
    DynamoDB: jest.fn(() => mockDynamoClient),
    S3: jest.fn(() => mockS3Client),
  };
});

describe("S3 Object Index Handler", () => {
  test("it works", async () => {
    const ddb = AWS.DynamoDB();
    const s3 = AWS.S3();

    s3.promise.mockResolvedValueOnce({
      Body: Buffer.from(JSON.stringify(testFile)),
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

    expect(s3.getObject.mock.calls[0][0].Bucket).toBe("example-bucket");
    expect(s3.getObject.mock.calls[0][0].Key).toBe("test-key");

    expect(s3.getObject.mock.calls.length).toBe(1);
    expect(s3.getObject.mock.calls.length).toBe(1);
    expect(ddb.putItem.mock.calls.length).toBe(13);
  });
});
