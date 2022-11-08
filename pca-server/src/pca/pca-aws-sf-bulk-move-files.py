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
    s3 = boto3.resource('s3')
    maxKeys = min(dripRate, queueSpace) + 10 # list a few additional keys to allow for some folder objects that won't be moved
    response = s3Client.list_objects_v2(Bucket=sourceBucket, MaxKeys=maxKeys)
    if "Contents" in response:
        # We now have a list of objects that we can use
        keyPrefix = targetAudioKey
        if keyPrefix != "":
            keyPrefix += "/"
        files = [f for f in response["Contents"] if not f["Key"].endswith("/")][:dripRate]
        folders = [f for f in response["Contents"] if f["Key"].endswith("/")]
        for audioFile in files:
            try:
                # Copy and delete file
                copyDestnKey = keyPrefix + audioFile["Key"]
                copy_source = {
                    'Bucket': sourceBucket,
                    'Key': audioFile["Key"]
                }
                print(f'Copying: copy_source={copy_source}, targetBucket={targetBucket}, copyDestnKey={copyDestnKey}')
                s3.meta.client.copy(copy_source, targetBucket, copyDestnKey)
                deleteResponse = s3Client.delete_object(Bucket=sourceBucket, Key=audioFile["Key"])
                movedFiles += 1
            except Exception as e:
                print("Failed to move audio file {}".format(audioFile["Key"]))
                print(e)
                raise
        # Delete any folder objects so they do not appear in subsequent object lists - usually these are created in S3 console only
        for folder in folders:
            try:
                print(f'Deleting folder object: Bucket={sourceBucket}, Key={folder["Key"]}')
                deleteResponse = s3Client.delete_object(Bucket=sourceBucket, Key=folder["Key"])
            except Exception as e:
                print("Failed to delete folder file {}".format(folder["Key"]))
                print(e)
                raise        

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
