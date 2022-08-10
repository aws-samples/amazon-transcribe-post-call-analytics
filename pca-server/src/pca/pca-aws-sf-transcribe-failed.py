"""
This python function is part of the main processing workflow.  It handles the clean-up for when the workflow fails
for expected reasons, such as being unable to perform Language Identification, and clears up or moves any resources
associated with this execution.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import pcaconfiguration as cf

def lambda_handler(event, context):
    """
    When a file has failed to transcribe then we need to move the original audio to the "failed" bucket
    """
    # Extract params and ready our client
    cf.loadConfiguration()
    s3Client = boto3.client("s3")
    s3 = boto3.resource('s3')
    origBucket = event["bucket"]
    origFileKey = event["key"]

    # Now try and move the original source audio file to the "failed" folder
    try:
        # Copy and delete file
        copyDestnKey = cf.appConfig[cf.CONF_PREFIX_FAILED_AUDIO] + "/" + origFileKey.split('/')[-1]
        copy_source = {
            'Bucket': origBucket,
            'Key': origFileKey
        }
        s3.meta.client.copy(copy_source, origBucket, copyDestnKey)
        s3Client.delete_object(Bucket=origBucket, Key=origFileKey)
    except Exception as e:
        print(e)
        raise

    # Return our input data as the final result
    return event

