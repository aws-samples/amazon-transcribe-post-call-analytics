import boto3
import pcaconfiguration as cf
import pcacommon

def lambda_handler(event, context):
    """
    When a file has failed to transcribe then we need to do two things:
    1) Remove any temporary clip file left behind
    2) Move the original audio to the "failed" bucket
    """
    # Extract params and ready our client
    cf.loadConfiguration()
    s3Client = boto3.client("s3")
    origBucket = event["bucket"]
    origFileKey = event["key"]

    # First, delete any CLIP file that was left behind
    clipFileKey = pcacommon.generateClipFileKey(pcacommon.generateClipFileName(origFileKey))
    try:
        s3Client.delete_objects(Bucket=origBucket, Delete={"Objects": [{"Key": clipFileKey}]})
    except Exception as e:
        # Doesn't matter if it doesn't exist
        pass

    # Now try and move the original source audio file to the "failed" folder
    try:
        # Copy and delete file
        copySourcePath = origBucket + "/" + origFileKey
        copyDestnKey = cf.appConfig[cf.CONF_PREFIX_FAILED_AUDIO] + "/" + origFileKey.split('/')[-1]
        s3Client.copy_object(Bucket=origBucket, CopySource=copySourcePath, Key=copyDestnKey)
        s3Client.delete_object(Bucket=origBucket, Key=origFileKey)
    except Exception as e:
        pass

    # Return our input data as the final result
    return event

if __name__ == "__main__":
    event = {
        "bucket": "ajk-call-analytics-demo",
        "key": "audio/example-call.wav",
        "langCode": "",
        "jobName": "example-call.wav_clip.wav",
        "transcribeStatus": "FAILED"
    }
    lambda_handler(event, "")
