const AWS = require("aws-sdk");
const { withAuthorization } = require("./auth-middleware");
const { logAuditEvent } = require("./audit");

const s3 = new AWS.S3();

const dataBucket = process.env.DataBucket;
const audioBucket = process.env.AudioBucket;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type,Authorization",
  "access-control-allow-methods": "OPTIONS,GET,PUT,DELETE,POST",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Derives S3 keys for all associated files from the parsed results JSON stored in the data bucket.
 * Returns the playback audio key (MediaFileUri), original audio key (MediaOriginalUri),
 * and the Transcribe job name used to locate transcribe result JSON files.
 */
async function getAssociatedKeysFromData(dataKey) {
  try {
    const res = await s3
      .getObject({ Bucket: dataBucket, Key: dataKey })
      .promise();

    const parsed = JSON.parse(res.Body.toString());
    const jobInfo =
      parsed.ConversationAnalytics &&
      parsed.ConversationAnalytics.SourceInformation &&
      parsed.ConversationAnalytics.SourceInformation[0] &&
      parsed.ConversationAnalytics.SourceInformation[0].TranscribeJobInfo;

    if (!jobInfo) return {};

    const stripS3Prefix = (uri) => uri ? uri.replace(/^s3:\/\/[^/]+\//, "") : null;

    return {
      playbackAudioKey: stripS3Prefix(jobInfo.MediaFileUri),
      originalAudioKey: stripS3Prefix(jobInfo.MediaOriginalUri),
      transcribeJobName: jobInfo.TranscriptionJobName || null,
      apiType: jobInfo.TranscribeApiType || null,
    };
  } catch (err) {
    console.error("Failed to read data object for key derivation:", err);
    return {};
  }
}

/**
 * Deletes a single call by removing all associated S3 files.
 * DynamoDB cleanup is handled automatically by an existing S3 event trigger
 * on the output bucket, so we only need to delete the S3 objects here.
 *
 * Steps:
 * 1. Read the parsed results JSON to derive associated S3 keys
 * 2. Delete original audio file from input bucket (originalAudio/ partition)
 * 3. Delete playback audio file from input bucket (playbackAudio/ partition)
 * 4. Delete parsed results JSON from output bucket (parsedFiles)
 * 5. Delete transcribe result JSON files from output bucket
 *    (transcribeResults/analytics/ and transcribeResults/redacted-analytics/)
 *
 * Deleting from the output bucket triggers the existing Lambda that handles
 * DynamoDB cleanup automatically.
 *
 * @param {string} key - The call identifier (S3 key to parsed results JSON)
 * @returns {Object} Deletion result with per-step status
 */
async function deleteSingleCall(key) {
  const result = {
    found: true,
    s3DataDeleted: false,
    s3AudioDeleted: false,
    s3OriginalAudioDeleted: false,
    s3TranscribeResultsDeleted: false,
    errors: [],
  };

  // Derive all associated S3 keys from the parsed results JSON before deleting it
  const associatedKeys = await getAssociatedKeysFromData(key);

  // If we couldn't read the data object at all, the call likely doesn't exist
  if (!associatedKeys.playbackAudioKey && !associatedKeys.originalAudioKey && !associatedKeys.transcribeJobName) {
    // Verify the data object exists
    try {
      await s3.headObject({ Bucket: dataBucket, Key: key }).promise();
    } catch (err) {
      if (err.code === "NotFound" || err.statusCode === 404) {
        return { found: false };
      }
      console.error("S3 headObject error for key:", key, err);
      result.errors.push({ step: "headCheck", message: err.message });
    }
  }

  // 1. Delete original audio file from input bucket (originalAudio/ partition)
  if (associatedKeys.originalAudioKey) {
    try {
      await s3.deleteObject({ Bucket: audioBucket, Key: associatedKeys.originalAudioKey }).promise();
      result.s3OriginalAudioDeleted = true;
    } catch (err) {
      console.error("S3 original audio delete error:", err);
      result.errors.push({ step: "s3OriginalAudio", message: err.message, bucket: audioBucket, key: associatedKeys.originalAudioKey });
    }
  } else {
    result.errors.push({ step: "s3OriginalAudio", message: "Could not derive original audio key from data object" });
  }

  // 2. Delete playback audio file from input bucket (playbackAudio/ partition)
  if (associatedKeys.playbackAudioKey) {
    try {
      await s3.deleteObject({ Bucket: audioBucket, Key: associatedKeys.playbackAudioKey }).promise();
      result.s3AudioDeleted = true;
    } catch (err) {
      console.error("S3 playback audio delete error:", err);
      result.errors.push({ step: "s3Audio", message: err.message, bucket: audioBucket, key: associatedKeys.playbackAudioKey });
    }
  } else {
    result.errors.push({ step: "s3Audio", message: "Could not derive playback audio key from data object" });
  }

  // 3. Delete parsed results JSON from output bucket
  try {
    await s3.deleteObject({ Bucket: dataBucket, Key: key }).promise();
    result.s3DataDeleted = true;
  } catch (err) {
    console.error("S3 data delete error for key:", key, err);
    result.errors.push({ step: "s3Data", message: err.message, bucket: dataBucket, key });
  }

  // 4. Delete transcribe result JSON files from output bucket
  //    For Call Analytics jobs, Transcribe writes to transcribeResults/analytics/ and
  //    transcribeResults/redacted-analytics/ subfolders.
  if (associatedKeys.transcribeJobName) {
    const transcribePrefix = process.env.TranscribeResultsPrefix || "transcribeResults";
    const jobName = associatedKeys.transcribeJobName;

    // Build list of possible transcribe result keys to delete
    const transcribeKeys = [];
    if (associatedKeys.apiType === "analytics") {
      // Call Analytics mode: results in analytics/ and redacted-analytics/ subfolders
      transcribeKeys.push(`${transcribePrefix}/analytics/${jobName}.json`);
      transcribeKeys.push(`${transcribePrefix}/redacted-analytics/${jobName}.json`);
      // Redacted audio file may also exist in redacted-analytics/
      transcribeKeys.push(`${transcribePrefix}/redacted-analytics/${jobName}.wav`);
    } else {
      // Standard mode: results directly under transcribeResults/
      transcribeKeys.push(`${transcribePrefix}/${jobName}.json`);
      transcribeKeys.push(`${transcribePrefix}/redacted-${jobName}.json`);
    }

    const deleteResults = await Promise.allSettled(
      transcribeKeys.map((tk) =>
        s3.deleteObject({ Bucket: dataBucket, Key: tk }).promise()
      )
    );

    const failures = deleteResults.filter((r) => r.status === "rejected");
    if (failures.length === 0) {
      result.s3TranscribeResultsDeleted = true;
    } else {
      failures.forEach((f) => {
        result.errors.push({ step: "s3TranscribeResults", message: f.reason.message });
      });
    }
  } else {
    result.errors.push({ step: "s3TranscribeResults", message: "Could not derive transcribe job name from data object" });
  }

  return result;
}

/**
 * Processes a batch of call deletions.
 * Validates max 25 items, processes each independently, collects results.
 *
 * @param {string[]} callIds - Array of call identifiers to delete
 * @returns {Object} { successful: [...], failed: [...] }
 */
async function deleteBatchCalls(callIds) {
  const results = await Promise.allSettled(
    callIds.map(async (callId) => {
      const result = await deleteSingleCall(callId);
      return { callId, result };
    })
  );

  const successful = [];
  const failed = [];

  for (const entry of results) {
    if (entry.status === "rejected") {
      failed.push({
        callId: entry.reason?.callId || "unknown",
        error: entry.reason?.message || "Unknown error",
      });
      continue;
    }

    const { callId, result } = entry.value;

    if (!result.found) {
      failed.push({
        callId,
        error: `Not Found: call '${callId}' does not exist`,
      });
    } else if (result.errors.length > 0) {
      // Partial success — some S3 objects had issues
      failed.push({
        callId,
        error: "Partial deletion",
        details: result,
      });
    } else {
      successful.push({ callId, status: "deleted" });
    }
  }

  return { successful, failed };
}

/**
 * Route handler for delete endpoints.
 * - DELETE /delete/{key+} → single call deletion
 * - POST /delete/batch → batch call deletion
 */
async function routeHandler(event, context, authContext) {
  const method = event.httpMethod;
  const resource = event.resource;

  try {
    // Single delete: DELETE /delete/{key+}
    if (method === "DELETE" && resource === "/delete/{key+}") {
      const key = event.pathParameters && event.pathParameters.key;

      if (!key) {
        return jsonResponse(400, { message: "Bad Request: missing call identifier" });
      }

      const result = await deleteSingleCall(key);

      if (!result.found) {
        return jsonResponse(404, {
          message: `Not Found: call '${key}' does not exist`,
        });
      }

      // Write audit log
      await logAuditEvent(
        {
          action: "CALL_DELETED",
          username: authContext.username,
          details: { callId: key },
        },
        context
      );

      // Check for partial S3 failure
      if (result.errors.length > 0) {
        return jsonResponse(207, {
          callId: key,
          s3DataDeleted: result.s3DataDeleted,
          s3AudioDeleted: result.s3AudioDeleted,
          s3OriginalAudioDeleted: result.s3OriginalAudioDeleted,
          s3TranscribeResultsDeleted: result.s3TranscribeResultsDeleted,
          errors: result.errors,
          message: "Files deleted. It may take a minute or two for the call to disappear from the list.",
        });
      }

      return jsonResponse(200, {
        callId: key,
        message: "Files deleted. It may take a minute or two for the call to disappear from the list.",
        s3DataDeleted: result.s3DataDeleted,
        s3AudioDeleted: result.s3AudioDeleted,
        s3OriginalAudioDeleted: result.s3OriginalAudioDeleted,
        s3TranscribeResultsDeleted: result.s3TranscribeResultsDeleted,
      });
    }

    // Batch delete: POST /delete/batch
    if (method === "POST" && resource === "/delete/batch") {
      const body = JSON.parse(event.body || "{}");
      const callIds = body.callIds;

      if (!Array.isArray(callIds) || callIds.length === 0) {
        return jsonResponse(400, { message: "Bad Request: callIds array is required" });
      }

      if (callIds.length > 25) {
        return jsonResponse(400, {
          message: "Bad Request: maximum 25 calls per batch",
        });
      }

      const result = await deleteBatchCalls(callIds);

      // Write audit log for each successful deletion
      for (const item of result.successful) {
        await logAuditEvent(
          {
            action: "CALL_DELETED",
            username: authContext.username,
            details: { callId: item.callId },
          },
          context
        );
      }

      return jsonResponse(200, {
        successful: result.successful,
        failed: result.failed,
        message: "Files deleted. It may take a minute or two for deleted calls to disappear from the list.",
      });
    }

    return jsonResponse(400, { message: "Bad Request: unsupported route" });
  } catch (err) {
    console.error("Delete handler error:", err);
    return jsonResponse(500, { message: "Internal Server Error" });
  }
}

exports.handler = withAuthorization(routeHandler);
exports.deleteSingleCall = deleteSingleCall;
exports.deleteBatchCalls = deleteBatchCalls;
