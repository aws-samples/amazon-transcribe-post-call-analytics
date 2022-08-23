"""
This python function is part of the bulk files workflow.  Based upon the queueSpace parameter, this will
move up to that many files into the PCA audio bucket, but only up to a maximum number as specified by
the dripRate - this ensures that we don't overload they system

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import copy
import boto3


def lambda_handler(event, context):

    # Load our event
    sfData = copy.deepcopy(event)
    filesLimit = sfData["filesLimit"]
    dripRate = sfData["dripRate"]
    queueSpace = sfData["queueSpace"]
    sourceBucket = sfData["sourceBucket"]
    targetBucket = sfData["targetBucket"]
    targetAudioKey = sfData["targetAudioKey"]
    movedFiles = 0

    # Get as many files from S3 as we can move this time (minimum of queueSpace and dripRate)
    s3Client = boto3.client('s3')
    maxKeys = min(dripRate, queueSpace) + 10 # list a few additional keys to allow for some folder objects that won't be moved
    response = s3Client.list_objects_v2(Bucket=sourceBucket, MaxKeys=maxKeys)
    if "Contents" in response:
        # We now have a list of objects that we can use
        sourcePrefix = "/" + sourceBucket + "/"
        keyPrefix = targetAudioKey
        if keyPrefix != "":
            keyPrefix += "/"
        files = [f for f in response["Contents"] if not f["Key"].endswith("/")][:dripRate] # ignore folder objects
        for audioFile in files:
            try:
                # Copy and delete file
                print(f'Copying: Bucket={targetBucket}, CopySource={(sourcePrefix + audioFile["Key"])}, Key={(keyPrefix + audioFile["Key"])}')
                copyResponse = s3Client.copy_object(Bucket=targetBucket,
                                                    CopySource=(sourcePrefix + audioFile["Key"]),
                                                    Key=(keyPrefix + audioFile["Key"]))
                deleteResponse = s3Client.delete_object(Bucket=sourceBucket, Key=audioFile["Key"])
                movedFiles += 1
            except Exception as e:
                print("Failed to move audio file {}".format(audioFile["Key"]))
                print(e)

    # Increase our counter, remove the queue value and return
    sfData["filesProcessed"] += movedFiles
    sfData.pop("queueSpace", None)
    return sfData


if __name__ == "__main__":
    event = {
        "sourceBucket": "pca-bulk-upload",
        "targetBucket": "pca-raw-audio-1234",
        "targetAudioKey": "nci",
        "filesLimit": 250,
        "dripRate": 50,
        "filesProcessed": 0,
        "queueSpace": 250
    }   
    lambda_handler(event, "")
