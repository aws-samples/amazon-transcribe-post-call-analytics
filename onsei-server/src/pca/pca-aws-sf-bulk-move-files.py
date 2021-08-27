import copy
import boto3

def lambda_handler(event, context):
    """
    Based upon the queueSpace parameter, this will move up to that many file into the PCA audio bucket, but
    only up to a maximum number as specified by the dripRate - this ensures that we don't overload they system
    """
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
    response = s3Client.list_objects_v2(Bucket=sourceBucket, MaxKeys=(min(dripRate, queueSpace)))
    if "Contents" in response:
        # We now have a list of objects that we can use
        sourcePrefix = "/" + sourceBucket + "/"
        keyPrefix = targetAudioKey
        if keyPrefix != "":
            keyPrefix += "/"
        for audioFile in response["Contents"]:
            try:
                # Copy and delete file
                copyResponse = s3Client.copy_object(Bucket=targetBucket,
                                                    CopySource=(sourcePrefix + audioFile["Key"]),
                                                    Key=(keyPrefix + audioFile["Key"]))
                deleteResponse = s3Client.delete_object(Bucket=sourceBucket, Key=audioFile["Key"])
                movedFiles += 1
            except:
                print("Failed to move audio file {}".format(audioFile["Key"]))
                pass

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
