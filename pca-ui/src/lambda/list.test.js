const { handler } = require("./list");
const AWS = require("aws-sdk");

jest.mock("aws-sdk", () => {
  const mockClient = {
    delete: jest.fn().mockReturnThis(),
    get: jest.fn().mockReturnThis(),
    query: jest.fn().mockReturnThis(),
    put: jest.fn().mockReturnThis(),
    transactWrite: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  };
  return { DynamoDB: jest.fn(() => mockClient) };
});

describe("list handler", () => {
  test("it lists results", async () => {
    const client = AWS.DynamoDB();

    client.promise.mockResolvedValueOnce({
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

    const resp = await handler({
      queryStringParameters: {
        count: 1,
      },
    });

    expect(resp.statusCode).toEqual(200);
    expect(resp.body.Records).toEqual(
      JSON.stringify([
        {
          key: "parsedFiles/stero_std_295.mp3.json",
          jobName: "stero_std_295.mp3",
          confidence: 0.8886063829787236,
          lang: "en-US",
          duration: 28.96,
          timestamp: 1637060698245,
          location: "America/New_York",
        },
      ])
    );
  });

  test("it paginates results", async () => {
    const client = AWS.DynamoDB();

    client.promise.mockResolvedValueOnce({
      Items: [
        {
          TK: {
            N: "1631778951067",
          },
          SK: {
            S: "call",
          },
          PK: {
            S: "call#parsedFiles/AutoRepairs1_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav.json",
          },
          Data: {
            S: '{"key":"parsedFiles/AutoRepairs1_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav.json","jobName":"AutoRepairs1_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav","confidence":0.9748201668984702,"lang":"en-US","duration":245.26,"timestamp":1631778951067,"location":"America/New_York"}',
          },
        },
        {
          TK: {
            N: "1631779340342",
          },
          SK: {
            S: "call",
          },
          PK: {
            S: "call#parsedFiles/AutoRepairs2_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_SteveE_DATETIME_08.02.20.342-09-16-2021.wav.json",
          },
          Data: {
            S: '{"key":"parsedFiles/AutoRepairs2_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_SteveE_DATETIME_08.02.20.342-09-16-2021.wav.json","jobName":"AutoRepairs2_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_SteveE_DATETIME_08.02.20.342-09-16-2021.wav","confidence":0.9781312658227854,"lang":"en-US","duration":236.66,"timestamp":1631779340342,"location":"America/New_York"}',
          },
        },
      ],
      Count: 2,
      ScannedCount: 2,
      LastEvaluatedKey: {
        TK: {
          N: "1631779340342",
        },
        PK: {
          S: "call#parsedFiles/AutoRepairs2_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_SteveE_DATETIME_08.02.20.342-09-16-2021.wav.json",
        },
        SK: {
          S: "call",
        },
      },
    });

    const resp = await handler({ queryStringParameters: { count: 2 } });

    expect(resp.statusCode).toEqual(200);
    expect(resp.body.PaginationToken).toEqual(
      "call#parsedFiles/AutoRepairs2_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_SteveE_DATETIME_08.02.20.342-09-16-2021.wav.json"
    );
  });
});
