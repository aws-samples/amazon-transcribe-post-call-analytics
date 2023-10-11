"""
This python function is triggered when a new audio file is dropped into the S3 bucket that has
been configured for audio ingestion.  It will trigger the main Step Functions workflow to process this file.
No checks are made here to see if a file is already being processed, as there are multiple modes for Transcribe,
and the configured settings can be overridden - existing jobs will be properly checked later in the workflow

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
from pathlib import Path
import json
import urllib.parse
import boto3
import pcaconfiguration as cf
import pcacommon
import filetype
import os

TMP_DIR = "/tmp/"
VALID_MIME_TYPES = ["audio", "video"]
SUMMARIZE = os.getenv("SUMMARIZE", "false")


def get_invalid_mime_type(filename):
    """
    Checks to see if the file's mime type is one that we support or not.  We return the invalid mime type
    if we do not support this file type, or None if we do

    :param filename: Local filename
    :return: Invalid mime type (or None if it's valid)
    """

    # Guess the mime-type, noting that the filetype library doesn't classify everything
    guess = filetype.guess(filename)
    if guess is not None:
        mime_type = guess.mime
    else:
        mime_type = "text/*"

    # Check that the main type is one that we support, setting it to None if so
    base_mime = mime_type.split("/")[0]
    if base_mime in VALID_MIME_TYPES:
        mime_type = None

    # add workaround for audio files with no mime_type
    suffix = filename.split(".")[-1]
    if suffix.lower() in ["mp3","wav"]:
        print(f"Filename has {suffix} suffix - assuming valid file type")
        mime_type = None 

    return mime_type


def verify_transcribe_file(bucket, key):
    """
    Loads in the specified JSON file and validates if it is an Amazon Transcribe output file

    :param bucket: S3 bucket holding the JSON file
    :param key: Location of the JSON file in the S3 bucket
    :return: Flag indicating if this file is an Amazon Transcribe file
    """

    # Download our JSON file to local storage
    transcribe_file = False
    inputFilename = TMP_DIR + key.split('/')[-1]
    s3Client = boto3.client('s3')
    s3Client.download_file(bucket, key, inputFilename)

    # Load the JSON file into memory
    json_filepath = Path(inputFilename)
    asr_output = json.load(open(json_filepath.absolute(), "r", encoding="utf-8"))

    # Standard Transcribe should have a ["results"]["transcripts"] line
    if "results" in asr_output:
        if "transcripts" in asr_output["results"]:
            transcribe_file = True
    elif "Transcript" in asr_output and "LanguageCode" in asr_output:
        transcribe_file = True

    # Remove our temporary file in case of Lambda container re-use
    pcacommon.remove_temp_file(inputFilename)

    return transcribe_file


def lambda_handler(event, context):
    # Load our configuration
    cf.loadConfiguration()

    # Get handles to the object from the event
    s3 = boto3.client("s3")
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')

    # Check if there's actually a file and that this wasn't just a folder creation event
    key_filename = key.split("/")[-1]
    if len(key_filename) == 0:
        # Just a folder, no object - silently quit
        final_message = f"Folder creation event at \'{key}\', no object to process"
    else:
        # Validate that the object exists
        try:
            response = s3.get_object(Bucket=bucket, Key=key)
        except Exception as e:
            print(e)
            raise Exception(
                'Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(
                    key, bucket))

        if key.startswith(cf.appConfig[cf.CONF_PREFIX_INPUT_TRANSCRIPTS]):
            # This came from the transcript bucket, not the audio bucket
            if key.endswith(".json"):
                # Currently we only process Transcribe JSON files
                if verify_transcribe_file(bucket, key):
                    # Looks like a Transcribe file - start the workflow
                    invoke_step_function(bucket, key, "transcript")
                    final_message = f"Post-call analytics workflow for file {key} successfully started."
                else:
                    # Not a Transcribe file - possibly a CTR file, but regardless we can't process it here
                    final_message = f"File \'{key.split('/')[-1]}\' is not processable by PCA: Transcribe JSON files only"
            else:
                final_message = f"File \'{key.split('/')[-1]}\' is not processable by PCA: Transcribe JSON files only"
        else:
            # Download our object to local file storage
            local_filename = TMP_DIR + key.split('/')[-1]
            s3_client = boto3.client('s3')
            s3_client.download_file(bucket, key, local_filename)

            # Get some file metadata to see what kind of file this actually is
            invalid_mime = get_invalid_mime_type(local_filename)
            pcacommon.remove_temp_file(local_filename)
            if invalid_mime is not None:
                # File metadata contains at least one banned tag
                final_message = f"File \'{key.split('/')[-1]}\' is not processable by PCA: {invalid_mime}"
            else:
                # File looks good - go find our Step Function
                invoke_step_function(bucket, key, "audio")
                final_message = f"Post-call analytics workflow for file {key} successfully started."

    # Return our final message
    print(final_message)
    return {
        'statusCode': 200,
        'body': json.dumps(final_message)
    }


def invoke_step_function(bucket, key, file_type):
    """
    Attempts to invoke a new Step Function instance to start to process this file.  As well as the file
    location it also passes info to the Step Function about the type of file that triggered it.

    :param bucket: Bucket holding the input trigger file
    :param key: Key of for the input trigger file
    :param file_type: The type of file, either "audio" or "transcript"
    """
    ourStepFunction = cf.appConfig[cf.COMP_SFN_NAME]
    sfnClient = boto3.client('stepfunctions')
    sfnMachinesResult = sfnClient.list_state_machines(maxResults=1000)

    sfnArnList = list(
        filter(lambda x: x["stateMachineArn"].endswith(ourStepFunction), sfnMachinesResult["stateMachines"]))
    if sfnArnList == []:
        # Doesn't exist
        raise Exception(
            'Cannot find configured Step Function \'{}\' in the AWS account in this region - cannot begin workflow.'.format(
                ourStepFunction))

    # Trigger a new Step Function execution
    sfnArn = sfnArnList[0]['stateMachineArn']
    parameters = '{\n  \"bucket\": \"' + bucket + '\",\n' + \
                 '  \"key\": \"' + key + '\",\n' + \
                 '  \"inputType\": \"' + file_type + '\",\n' + \
                 '  \"summarize\": \"' + SUMMARIZE + '\"\n' + \
                 '}'
    sfnClient.start_execution(stateMachineArn=sfnArn, input=parameters)


# Main entrypoint
if __name__ == "__main__":
    event = {
        "Records": [
            {
                "s3": {
                    "s3SchemaVersion": "1.0",
                    "configurationId": "eca58aa9-dd2b-4405-94d5-d5fba7fd0a16",
                    "bucket": {
                        "name": "ak-cci-input",
                        "ownerIdentity": {
                            "principalId": "A39I0T5T4Z0PZJ"
                        },
                        "arn": "arn:aws:s3:::ajk-call-analytics-demo"
                    },
                    "object": {
                        # "key": "originalTranscripts/redacted-Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav.json",
                        # "key": "originalTranscripts/Auto1_GUID_001_AGENT_AndrewK_DT2022-03-20T07-55-51.wav.json",
                        "key": "originalTranscripts/0000342e-4064-49a7-946c-c7b4fe96489d.wav_metadata.json",
                        "size": 963023,
                        "eTag": "8588ee73ae57d72c072f4bc401627724",
                        "sequencer": "005E99B1F567D61004"
                    }
                }
            }
        ]
    }
    # event = {
    #     "Records": [
    #         {
    #             "s3": {
    #                 "s3SchemaVersion": "1.0",
    #                 "configurationId": "eca58aa9-dd2b-4405-94d5-d5fba7fd0a16",
    #                 "bucket": {
    #                     "name": "ak-cci-support",
    #                     "ownerIdentity": {
    #                         "principalId": "A39I0T5T4Z0PZJ"
    #                     },
    #                     "arn": "arn:aws:s3:::ajk-call-analytics-demo"
    #                 },
    #                 "object": {
    #                     "key": "PFG/IMG_2346.jpeg.mp3",
    #                     "size": 963023,
    #                     "eTag": "8588ee73ae57d72c072f4bc401627724",
    #                     "sequencer": "005E99B1F567D61004"
    #                 }
    #             }
    #         }
    #     ]
    # }
    lambda_handler(event, "")
