import json
import boto3
import os

TABLE = os.environ["TableName"]

def lambda_handler(event, context):
    """
    Create/update the task token for the given Transcribe job,
    and the Step Function should pause until that token is sent
    back by an EventBridge Lambda trigger when the Transcribe
    job completes.  If no Transcribe job exists then throw an
    exception, but we shouldn't be here if this is the case
    """
    # Extract our parameters
    jobName = event["Input"]["jobName"]
    taskToken = event["TaskToken"]

    # If the jobName is "" then that means no task was started - the Step Function
    # shouldn't have sent us here, so throw an exception to break the execution
    if jobName == "":
        raise Exception('No Transcribe job called \'{}\' exists.'.format(jobName))

    # Insert/Update tracking entry between Transcribe job and the Step Function
    ddbClient = boto3.client("dynamodb")
    response = ddbClient.put_item(Item={
                                    'PKJobId': {'S': jobName},
                                    'taskToken': {'S': taskToken},
                                    'taskState': {'S': json.dumps(event["Input"])}
                                  },
                                  TableName=TABLE)

    return event

# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "Input": {
            "bucket": "pca-raw-audio-1234",
            "key": "nci/0a.93.a0.3e.00.00 09.13.43.164 09-16-2019.wav",
            "contentType": "wav",
            "jobName": "0a.93.a0.3f.00.00-13.32.24.776-09-23-2019.wav",
            "langCode": "en-US"
        },
        "TaskToken": "tesGGDSAG3RWEF"
    }
    lambda_handler(event, "")
