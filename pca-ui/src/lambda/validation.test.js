"use strict";

const { handler } = require("./search");
const AWS = require("aws-sdk");

jest.mock("aws-sdk", () => {
  const mockDynamoClient = {
    query: jest.fn().mockReturnThis(),
    promise: jest.fn(),
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

describe("mvqs validation", () => {
  it("handles valid requests", async () => {
    const client = AWS.DynamoDB();
    client.promise.mockResolvedValueOnce({
      Items: [
        {
          PK: {
            S: "pk-1",
          },
          SK: {
            S: "language#en-US",
          },
          TK: {
            N: "0",
          },
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
      queryStringParameters: {
        language: ["invalid"],
      },
      body: null,
      isBase64Encoded: false,
    };

    const response = await handler(eventWithInvalidQueryString, {});

    expect(response.statusCode).toEqual(422);
  });
});
