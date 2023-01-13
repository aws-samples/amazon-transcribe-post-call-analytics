"""
This python function is part of the main processing workflow.  It is called by Event Bridge once a Transcribe job
has completed.  It will look up that job record in DynamoDB, including the Step Functions task token associated with
that job, extract the job-status from the relevant Transcribe API and then resume the Step Function execution

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import json
import boto3
import time
import os
import pcaconfiguration as cf

# Total number of retry attempts to make
RETRY_LIMIT = 2


def lambda_handler(event, context):
    # Our tracking table name is an environment variable
    DDB_TRACKING_TABLE = os.environ["TableName"]

    # Mapping of event type to Transcribe API type, which defines the
    # Transcribe call method and tags to use when looking up the jobs status
    transcribe = boto3.client("transcribe")
    TRANSCRIBE_API_MAP = {
        "Transcribe Job State Change": {
            "mode": cf.API_STANDARD,
            "eb_job_name": "TranscriptionJobName",
            "get_job_method": transcribe.get_transcription_job,
            "api_key": "TranscriptionJobName",
            "job_tag": "TranscriptionJob",
            "status_tag": "TranscriptionJobStatus"
        },
        "Call Analytics Job State Change": {
            "mode": cf.API_ANALYTICS,
            "eb_job_name": "JobName",
            "get_job_method": transcribe.get_call_analytics_job,
            "api_key": "CallAnalyticsJobName",
            "job_tag": "CallAnalyticsJob",
            "status_tag": "CallAnalyticsJobStatus"
        }
    }

    # Work out what Transcribe API mode this is - if it's
    # an event type that we don't support then quietly exit
    if TRANSCRIBE_API_MAP.get(event["detail-type"], False):
        api_map = TRANSCRIBE_API_MAP[event["detail-type"]]
        api_mode = api_map["mode"]

        # Lookup our job metadata and results, then find out DDB matching entry
        try:
            # Lookup the job status
            job_name = event["detail"][api_map["eb_job_name"]]
            kwargs = {api_map["api_key"]: job_name}
            response = api_map["get_job_method"](**{k: v for k, v in kwargs.items()})[api_map["job_tag"]]
            job_status = response[api_map["status_tag"]]

            # Read tracking entry between Transcribe job and its Step Function
            ddbClient = boto3.client("dynamodb")
            tracking = ddbClient.get_item(Key={'PKJobId': {'S': job_name}, 'SKApiMode': {'S': api_mode}},
                                          TableName=DDB_TRACKING_TABLE)

            # It's unlikely, but if we didn't get a value due to some race condition
            # meaning that the job finishes before the token was written then wait
            # for 5 seconds and try again.  Just once.  This may never happen
            if "Item" not in tracking:
                # Just sleep for a few seconds and try again
                time.sleep(5)
                tracking = ddbClient.get_item(Key={'PKJobId': {'S': job_name}, 'SKApiMode': {'S': api_mode}},
                                              TableName=DDB_TRACKING_TABLE)
        except:
            # If the job status lookup failed (unlikely) or DDB threw an exception,
            # then just say we didn't find a matching record and carry on
            tracking = {}

        # Did we have a result?
        if "Item" in tracking:
            # Delete entry in DDB table - there's no way we'll be processing this again
            ddbClient.delete_item(Key={'PKJobId': {'S': job_name}, 'SKApiMode': {'S': api_mode}},
                                  TableName=DDB_TRACKING_TABLE)

            # Extract the Step Functions task and previous event status
            taskToken = tracking["Item"]["taskToken"]['S']
            eventStatus = json.loads(tracking["Item"]["taskState"]['S'])

            # If the job has FAILED then we need to check if it's a service failure,
            # as this can happen, then we want to re-try the job another time
            finalResponse = job_status
            if job_status == "FAILED":
                errorMesg = response["FailureReason"]
                if errorMesg.startswith("Internal"):
                    # Internal failure - we want to retry a few times, but only once
                    retryCount = eventStatus.pop("retryCount", 0)

                    # Not retried enough yet - let's try another time
                    if (retryCount < RETRY_LIMIT):
                        eventStatus["retryCount"] = retryCount + 1
                        finalResponse = "RETRY"

            # All complete - continue our workflow with this status/retry count
            eventStatus["transcribeStatus"] = finalResponse
            sfnClient = boto3.client("stepfunctions")
            sfnClient.send_task_success(taskToken=taskToken,
                                        output=json.dumps(eventStatus))

    # We're always positive... we'll get Transcribe events outside of PCA,
    # so if we didn't find our tracking entry then it shouldn't be an issue
    return {
        'statusCode': 200,
        'body': json.dumps('Success.')
    }


# Main entrypoint for testing
# Note, Status could be COMPLETED or FAILED
if __name__ == "__main__":
    event = {
        'version': '0',
        'id': '0029c6b1-7c8e-1f61-fed5-7ef256b3660b',
        'detail-type': 'Transcribe Job State Change',
        'source': 'aws.transcribe',
        'account': 'ACCOUNT_ID',
        'time': '2020-08-05T13:32:03Z',
        'region': 'us-east-1',
        'resources': [],
        'detail': {
            'TranscriptionJobName': 'stereo.mp3',
            'TranscriptionJobStatus': 'COMPLETED'
        }
    }
    os.environ['TableName'] = 'cci-PCAServer-MK00H3MPFXK9-DDB-1DUUJKPYBH0LP-Table-1AOTYJNH0R9RF'
    lambda_handler(event, "")
