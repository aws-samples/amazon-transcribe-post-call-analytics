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

SUMMARIZER_ARN = os.getenv('SUMMARIZER_ARN','')

lambda_client = boto3.client('lambda')

def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """
    
    print(event)
    queryStringParameters = event['queryStringParameters']

    # Access the values of the query string parameters
    filename = urllib.parse.unquote(queryStringParameters['filename'])

    payload = {
        'interimResultsFile': filename,
    }
    print(payload)
    lambda_client.invoke(
        FunctionName=SUMMARIZER_ARN,
        InvocationType=' Event',
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