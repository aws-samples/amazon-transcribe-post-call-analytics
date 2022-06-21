"""
This python function is triggered when a new audio file is dropped into the S3 bucket that has
been configured for audio ingestion.  It will trigger the main Step Functions workflow to process this file.
No checks are made here to see if a file is already being processed, as there are multiple modes for Transcribe,
and the configured settings can be overridden - existing jobs will be properly checked later in the workflow

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import json
import urllib.parse
import boto3
import pcaconfiguration as cf


def lambda_handler(event, context):
    # Load our configuration
    cf.loadConfiguration()

    # Get the object from the event and validate it exists
    s3 = boto3.client("s3")
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
    except Exception as e:
        print(e)
        raise Exception(
            'Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(
                key, bucket))

    # Now find our Step Function
    ourStepFunction = cf.appConfig[cf.COMP_SFN_NAME]
    sfnClient = boto3.client('stepfunctions')
    response = sfnMachinesResult = sfnClient.list_state_machines(maxResults = 1000)
    sfnArnList = list(filter(lambda x: x["stateMachineArn"].endswith(ourStepFunction), sfnMachinesResult["stateMachines"]))
    if sfnArnList == []:
        # Doesn't exist
        raise Exception(
            'Cannot find configured Step Function \'{}\' in the AWS account in this region - cannot begin workflow.'.format(ourStepFunction))
    sfnArn = sfnArnList[0]['stateMachineArn']

    # Decide what language this should be transcribed in - leave it blank to trigger auto-detection
    if cf.isAutoLanguageDetectionSet():
        transcribeLanguage = ""
    else:
        transcribeLanguage = cf.appConfig[cf.CONF_TRANSCRIBE_LANG][0]

    # Trigger a new Step Function execution
    parameters = '{\n  \"bucket\": \"' + bucket + '\",\n' +\
                 '  \"key\": \"' + key + '\",\n' +\
                 '  \"langCode\": \"' + transcribeLanguage + '\"\n' +\
                 '}'
    sfnClient.start_execution(stateMachineArn = sfnArn, input = parameters)

    # Everything was successful
    return {
        'statusCode': 200,
        'body': json.dumps('Post-call analytics workflow for file ' + key + ' successfully started.')
    }

# Main entrypoint
if __name__ == "__main__":
    event = {
        "Records": [
            {
                "s3": {
                    "s3SchemaVersion": "1.0",
                    "configurationId": "eca58aa9-dd2b-4405-94d5-d5fba7fd0a16",
                    "bucket": {
                        "name": "ajk-call-analytics-demo",
                        "ownerIdentity": {
                            "principalId": "A39I0T5T4Z0PZJ"
                        },
                        "arn": "arn:aws:s3:::ajk-call-analytics-demo"
                    },
                    "object": {
                        "key": "audio/example-call.wav",
                        "size": 963023,
                        "eTag": "8588ee73ae57d72c072f4bc401627724",
                        "sequencer": "005E99B1F567D61004"
                    }
                }
            }
        ]
    }
    lambda_handler(event, "")
