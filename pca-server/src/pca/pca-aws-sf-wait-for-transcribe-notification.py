import json
import boto3
import os


def lambda_handler(event, context):
    """
    Create/update the task token for the given Transcribe job,
    and the Step Function should pause until that token is sent
    back by an EventBridge Lambda trigger when the Transcribe
    job completes.  If no Transcribe job exists then throw an
    exception, but we shouldn't be here if this is the case
    """
    # Our tracking table name is an environment variable
    DDB_TRACKING_TABLE = os.environ["TableName"]

    # Extract our parameters
    jobName = event["Input"]["jobName"]
    api_mode = event["Input"]["apiMode"]
    taskToken = event["TaskToken"]

    # If the jobName is "" then that means no task was started - the Step Function
    # shouldn't have sent us here, so throw an exception to break the execution
    if jobName == "":
        raise Exception('No Transcribe job called \'{}\' exists.'.format(jobName))

    # Insert/Update tracking entry between Transcribe job and the Step Function
    ddbClient = boto3.client("dynamodb")
    response = ddbClient.put_item(Item={
                                    'PKJobId': {'S': jobName},
                                    'SKApiMode': {'S': api_mode},
                                    'taskToken': {'S': taskToken},
                                    'taskState': {'S': json.dumps(event["Input"])}
                                  },
                                  TableName=DDB_TRACKING_TABLE)

    return event


# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "Input": {
            "bucket": "ajk-call-analytics-demo",
            "key": "audio/example-call.wav",
            "langCode": "en-US",
            "jobName": "stereo.mp3",
            "apiMode": "analytics"
        },
        "TaskToken": "tesGGDSAG3RWEF"
    }
    os.environ['TableName'] = 'cci-PCAServer-MK00H3MPFXK9-DDB-1DUUJKPYBH0LP-Table-1AOTYJNH0R9RF'
    lambda_handler(event, "")