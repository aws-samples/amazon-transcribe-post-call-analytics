const AWS = require("aws-sdk");
const cwl = new AWS.CloudWatchLogs();

const logGroupName = process.env.AuditLogGroupName;

const VALID_ACTIONS = [
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "ROLE_DELETED",
  "USER_ROLE_CHANGED",
  "CALL_DELETED",
  "AUTH_DENIED",
];

/**
 * Writes a structured audit log entry to the /pca/audit CloudWatch Logs log group.
 *
 * @param {Object} params
 * @param {string} params.action - One of VALID_ACTIONS
 * @param {string} params.username - The acting user's username
 * @param {Object} params.details - Action-specific details
 * @param {string} [params.timestamp] - ISO 8601 UTC timestamp (defaults to now)
 * @param {Object} [context] - Lambda context object for requestId
 */
async function logAuditEvent({ action, username, details, timestamp }, context) {
  try {
    const ts = timestamp || new Date().toISOString();
    const requestId = (context && context.awsRequestId) || "unknown";

    const logEntry = {
      timestamp: ts,
      action,
      username,
      details,
      requestId,
    };

    const logStreamName = `${ts.replace(/[:.]/g, "-")}-${requestId}`;

    await cwl
      .createLogStream({
        logGroupName,
        logStreamName,
      })
      .promise();

    await cwl
      .putLogEvents({
        logGroupName,
        logStreamName,
        logEvents: [
          {
            timestamp: Date.now(),
            message: JSON.stringify(logEntry),
          },
        ],
      })
      .promise();
  } catch (err) {
    // Audit logging failures should not crash the calling handler
    console.error("Failed to write audit log:", err);
  }
}

module.exports = { logAuditEvent, VALID_ACTIONS };
