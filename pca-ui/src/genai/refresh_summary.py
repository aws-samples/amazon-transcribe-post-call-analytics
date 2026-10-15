"""
This python function is part of the main processing workflow.
It invokes the call summary function to re-trigger the summarization process
when a user chooses to refresh the call Generative AI Insights after they made
updates to the LLMPromptSummaryTemplate.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
import json
import urllib.parse

import pca_auth

SUMMARIZER_ARN = os.getenv('SUMMARIZER_ARN','')

lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """

    # Identifiers only - the raw event carries the caller's Cognito claims.
    print(f"Refresh summary request: user={pca_auth.username_from_event(event) or 'unknown'}")

    # Authorization. This endpoint had none, so any authenticated user could trigger
    # regeneration of any call's summary - overwriting the stored result and spending a
    # model invocation - regardless of their role.
    #
    # read_calls is required, matching GET /genaiquery and the decision recorded for
    # PUT /swap: this regenerates a derived artifact of a call the caller can already
    # view. Note this endpoint mutates stored data, so if an edit_calls permission is
    # ever introduced (see docs/security-findings.md) this is the first call site that
    # should move to it.
    denied = pca_auth.authorize(event, "read_calls", "GET /genai/refreshsummary")
    if denied:
        return denied

    queryStringParameters = event['queryStringParameters']

    # Access the values of the query string parameters
    filename = urllib.parse.unquote(queryStringParameters['filename'])

    payload = {
        'interimResultsFile': filename,
    }
    print(f"Invoking summarizer for {filename}")
    lambda_client.invoke(
        FunctionName=SUMMARIZER_ARN,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload)
    )

    response = {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
            "Content-Type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "OPTIONS,GET"
        },
        "body": json.dumps({
            "response": "Success!!!"
        })
    }
    return response
