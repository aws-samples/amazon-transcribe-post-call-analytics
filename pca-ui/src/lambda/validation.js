const Ajv = require("ajv");
const ajv = new Ajv({ allErrors: true });

const withMVQSValidation =
  (handler, schema) => async (event, context, callback) => {
    try {
      const mvqs = event.queryStringParameters;
      const validate = ajv.compile(schema);
      const valid = validate(mvqs);
      if (!valid) {
        return response(422, {
          message: "Invalid request query string parameters",
          errors: validate.errors.map(
            (err) => `${err.dataPath} ${err.message}`
          ),
        });
      }
      return handler(event, context, callback);
    } catch (e) {
      console.error(e);
      return response(500);
    }
  };

const response = (statusCode, body, headers = {}) => {
  const resp = {
    statusCode: statusCode,
    isBase64Encoded: false,
    headers: {
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
      "Content-Type": "application/json",
      "access-control-allow-origin": "*",

      ...headers,
    },
    multiValueHeaders: {},
    body: JSON.stringify(body),
  };
  return resp;
};

const searchSchema = {
  type: ["object", "null"],
  properties: {
    timestampFrom: { type: "string" },
    timestampTo: { type: "string" },
    sentimentWho: { type: "string", enum: ["agent", "caller"] },
    sentimentWhat: { type: "string", enum: ["average", "trend"] },
    sentimentDirection: { type: "string", enum: ["positive", "negative"] },
    entity: { type: "string" },
    language: { type: "string" },
  },
  additionalProperties: false,
};

const listSchema = {
  type: ["object", "null"],
  properties: {
    timestampFrom: { type: "string" },
    timestampTo: { type: "string" },
    startKey: { type: "string" },
    count: { type: "string" },
  },
  additionalProperties: false,
};

module.exports = {
  withMVQSValidation,
  response,
  searchSchema,
  listSchema,
};
