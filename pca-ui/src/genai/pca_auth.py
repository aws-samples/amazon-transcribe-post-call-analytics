"""
Authorization for the GenAI API handlers.

These two endpoints previously performed no authorization at all. The only control on
them was the API's Cognito authorizer, so any authenticated user could reach them
regardless of their assigned role - including a user whose role granted no permissions.
`GET /genaiquery` reads call transcripts and spends model tokens; the refresh-summary
endpoint regenerates and overwrites a stored summary. Both act on a caller-supplied
filename.

This is a deliberate port of the behaviour in pca-ui/src/lambda/auth-middleware.js
rather than a new scheme, so both runtimes enforce the same model against the same roles
table. Two consequences of that duplication worth knowing:

  - The two implementations can drift. There is no shared layer between the Node and
    Python handlers, so a change to the permission model has to be made twice. If a
    third runtime ever needs this, extract a service instead of porting again.
  - PERMISSION_MAP in the Node middleware is NOT consulted here, and the GenAI routes
    are deliberately absent from it. An entry there would be inert while reading as
    coverage, which is exactly how `GET /genaiquery` previously appeared protected when
    it was not. Permissions for these routes are declared at their call sites below.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import json
import os
import time

import boto3
from botocore.exceptions import ClientError

ROLES_TABLE_NAME = os.getenv("RolesTableName", "")
AUDIT_LOG_GROUP_NAME = os.getenv("AuditLogGroupName", "")

# Matches the headers these handlers already return on success. The error path has to
# carry them too: a 403 without CORS headers surfaces in the browser as an opaque
# network failure rather than a permission error, which makes the UI look broken instead
# of correctly refusing.
CORS_HEADERS = {
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Content-Type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "OPTIONS,GET",
}

dynamodb_client = boto3.client("dynamodb")
logs_client = boto3.client("logs")


def _claims(event):
    """Cognito authorizer claims, or an empty dict."""
    return (
        (event or {})
        .get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    ) or {}


def username_from_event(event):
    """The acting username, or None when the event carries no usable identity."""
    claims = _claims(event)
    return (
        claims.get("cognito:username")
        or claims.get("username")
        or claims.get("sub")
        or None
    )


def permissions_from_item(item):
    """
    Extract permission strings from a roles-table item.

    The attribute is written as a DynamoDB String Set, so the low-level client returns
    {"SS": [...]}. The "L" case is tolerated in case an item is ever written as a list;
    anything else yields no permissions, which denies rather than allows.
    """
    attribute = (item or {}).get("Permissions") or {}

    if "SS" in attribute:
        return list(attribute["SS"])
    if "L" in attribute:
        return [entry.get("S") for entry in attribute["L"] if entry.get("S")]
    return []


def _write_audit_event(action, username, details):
    """
    Best-effort audit write, mirroring pca-ui/src/lambda/audit.js.

    Deliberately swallows its own failures: an audit write that cannot complete must not
    turn a correct 403 into a 500, and must not mask the authorization decision that has
    already been made.
    """
    if not AUDIT_LOG_GROUP_NAME:
        print("[auth] AuditLogGroupName is not set; skipping audit write")
        return

    try:
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        log_stream_name = f"{timestamp.replace(':', '-')}-genai-{int(time.time() * 1000)}"

        logs_client.create_log_stream(
            logGroupName=AUDIT_LOG_GROUP_NAME,
            logStreamName=log_stream_name,
        )
        logs_client.put_log_events(
            logGroupName=AUDIT_LOG_GROUP_NAME,
            logStreamName=log_stream_name,
            logEvents=[
                {
                    "timestamp": int(time.time() * 1000),
                    "message": json.dumps(
                        {
                            "timestamp": timestamp,
                            "action": action,
                            "username": username,
                            "details": details,
                        }
                    ),
                }
            ],
        )
    except ClientError as err:
        print(f"[auth] Failed to write audit log: {err}")
    except Exception as err:  # noqa: BLE001 - audit must never break the caller
        print(f"[auth] Unexpected error writing audit log: {err}")


def forbidden_response(message="Forbidden: insufficient permissions"):
    """403 in the same shape the Node handlers return, so the UI treats both alike."""
    return {
        "statusCode": 403,
        "headers": CORS_HEADERS,
        "body": json.dumps({"message": message}),
    }


def authorize(event, required_permission, route_label):
    """
    Check that the caller's role grants `required_permission`.

    Returns None when the request is authorized, or a ready-to-return 403 response when
    it is not. Callers must return that response unchanged rather than continuing.

    Fails closed throughout: a missing identity, a missing role claim, an unconfigured
    roles table, a role absent from the table, or a DynamoDB error all deny. The reason
    is logged so an operator can tell a misconfiguration from a genuine refusal.
    """
    username = username_from_event(event)
    claims = _claims(event)
    role_name = claims.get("custom:pca_role") or None

    def deny(reason):
        print(
            f"[auth] Denied {route_label} for user '{username or 'unknown'}' "
            f"(role '{role_name or 'none'}'): {reason}"
        )
        _write_audit_event(
            "AUTH_DENIED",
            username or "unknown",
            {
                "deniedAction": route_label,
                "userRole": role_name,
                "requiredPermission": required_permission,
                "reason": reason,
            },
        )
        return forbidden_response()

    if not username:
        return deny("no identity in request context")

    if not role_name:
        return deny("no custom:pca_role claim")

    if not ROLES_TABLE_NAME:
        # A configuration fault, not a user error - but denying is still correct, and
        # silently allowing would reintroduce exactly the gap this module closes.
        return deny("RolesTableName is not configured")

    try:
        result = dynamodb_client.get_item(
            TableName=ROLES_TABLE_NAME,
            Key={"RoleName": {"S": role_name}},
        )
    except ClientError as err:
        return deny(f"roles table lookup failed: {err.response['Error']['Code']}")

    item = result.get("Item")
    if not item:
        return deny("role not found in roles table")

    permissions = permissions_from_item(item)
    if required_permission not in permissions:
        return deny(f"role lacks {required_permission}")

    print(
        f"[auth] Allowed {route_label} for user '{username}' via role '{role_name}'"
    )
    return None
