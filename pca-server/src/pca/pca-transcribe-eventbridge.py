import json
import boto3
import time
import os

# Total number of retry attempts to make
RETRY_LIMIT = 2


def lambda_handler(event, context):
    # Our tracking table name is an environment variable
    DDB_TRACKING_TABLE = os.environ["TableName"]

    # Pick off our event values
    transcribe = boto3.client("transcribe")
    jobName = event["detail"]["TranscriptionJobName"]
    response = transcribe.get_transcription_job(TranscriptionJobName = jobName)["TranscriptionJob"]
    jobStatus = response["TranscriptionJobStatus"]

    # Read tracking entry between Transcribe job and its Step Function
    ddbClient = boto3.client("dynamodb")
    tracking = ddbClient.get_item(Key={'PKJobId': {'S': jobName}},
                                  TableName=DDB_TRACKING_TABLE)

    # It's unlikely, but if we didn't get a value due to some race condition
    # meaning that the job finishes before the token was written then wait
    # for 5 seconds and try again.  Just once.  This may never happen
    if "Item" not in tracking:
        # Just sleep for a few seconds and try again
        time.sleep(5)
        tracking = ddbClient.get_item(Key={'PKJobId': {'S': jobName}},
                                      TableName=DDB_TRACKING_TABLE)

    # Did we have a result?
    if "Item" in tracking:
        # Delete entry in DDB table - there's no way we'll be processing this again
        ddbClient.delete_item(Key={'PKJobId': {'S': jobName}},
                              TableName=DDB_TRACKING_TABLE)

        # Extract the Step Functions task and previous event status
        taskToken = tracking["Item"]["taskToken"]['S']
        eventStatus = json.loads(tracking["Item"]["taskState"]['S'])

        # If the job has FAILED then we need to check if it's a service failure,
        # as this can happen, then we want to re-try the job another time
        finalResponse = jobStatus
        if jobStatus == "FAILED":
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
        'account': '710514874879',
        'time': '2020-08-05T13:32:03Z',
        'region': 'us-east-1',
        'resources': [],
        'detail': {
            'TranscriptionJobName': 'example-call.wav',
            'TranscriptionJobStatus': 'COMPLETED'
        }
    }
    os.environ['TableName'] = 'pcaSFTaskTracker'
    lambda_handler(event, "")
