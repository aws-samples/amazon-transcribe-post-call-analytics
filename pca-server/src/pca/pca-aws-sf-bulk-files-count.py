"""
This python function is part of the bulk files workflow.  The system will load the Bulk configuration values
once, and re-use them throughout the run, so the config values at the start of the run will remain valid.
There is not quick way to count the files in an S3 bucket, so rather than track what's left in the bucket
we just care about having any left to process and instead count how far we've gotten instead.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import pcaconfiguration as cf
import copy
import boto3


def lambda_handler(event, context):

    # Get our params, looking them up if we haven't got them
    if "sourceBucket" in event:
        # Read them from the event data
        sfData = copy.deepcopy(event)
        bucket = sfData["sourceBucket"]
        dripRate = sfData["dripRate"]
    else:
        # First time through, so read them once, store them, and use for the duration of the workflow.
        # Also, make sure here that the out max job limit and file drip rate are at least 1+
        ssmClient = boto3.client("ssm")
        bucket = ssmClient.get_parameter(Name=cf.BULK_S3_BUCKET)["Parameter"]["Value"]
        targetBucket = ssmClient.get_parameter(Name=cf.CONF_S3BUCKET_INPUT)["Parameter"]["Value"]
        targetAudioKey = ssmClient.get_parameter(Name=cf.CONF_PREFIX_RAW_AUDIO)["Parameter"]["Value"]
        limit = int(ssmClient.get_parameter(Name=cf.BULK_JOB_LIMIT)["Parameter"]["Value"])
        dripRate = int(ssmClient.get_parameter(Name=cf.BULK_MAX_DRIP_RATE)["Parameter"]["Value"])
        sfData = {}
        sfData["sourceBucket"] = bucket
        sfData["targetBucket"] = targetBucket
        sfData["targetAudioKey"] = targetAudioKey
        sfData["filesLimit"] = max(1, limit)
        sfData["dripRate"] = max(1, dripRate)
        sfData["filesProcessed"] = 0

    # Just get a single S3 check on whether or not we have files to go
    s3Client = boto3.client('s3')
    response = s3Client.list_objects_v2(Bucket=bucket, MaxKeys=dripRate)
    if "Contents" in response:
        filesFound = len(response["Contents"])
    else:
        filesFound = 0
    sfData["filesToMove"] = filesFound

    # Return current event data
    return sfData


if __name__ == "__main__":
    event = {}
    print(lambda_handler(event, ""))

