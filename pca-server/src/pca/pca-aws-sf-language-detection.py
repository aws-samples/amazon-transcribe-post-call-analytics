import copy
import boto3
import pcaconfiguration as cf
import subprocess
import pcacommon

# Local temporary folder for file-based operations
TMP_DIR = "/tmp/"


def createFileClip(bucket, key):
    """
    Downloads the audio file and makes a 30-second mp3 clip of it, which is uploaded back
    to S3.  If anything goes wrong - lack of ffmpeg or IAM rights - then just give up
    """

    # First, we need to download the original audio file
    baseClipFilename = pcacommon.generateClipFileName(key)
    ffmpegInputFilename = TMP_DIR + key.split('/')[-1]
    ffmpegOutputFilename = TMP_DIR + baseClipFilename
    s3Client = boto3.client('s3')
    s3Client.download_file(bucket, key, ffmpegInputFilename)

    # Transform the file via FFMPEG - this will exception if not installed
    try:
        subprocess.call(['ffmpeg', '-nostats', '-loglevel', '0', '-y', '-i', ffmpegInputFilename,
                         '-ss', '0', '-t', '30', '-acodec', 'copy', ffmpegOutputFilename],
                        stdin=subprocess.DEVNULL)
    except:
        raise Exception("Unable to create audio clip for language detection via FFMPEG")

    # Upload file to the S3 bucket and return the key
    uploadKey = pcacommon.generateClipFileKey(baseClipFilename)
    s3Client.upload_file(ffmpegOutputFilename, bucket, uploadKey)
    return uploadKey

def lambda_handler(event, context):
    # Load our configuration data
    cf.loadConfiguration()
    sfData = copy.deepcopy(event)

    # Extract our parameters
    bucket = sfData["bucket"]
    key = sfData["key"]
    contentType = sfData["contentType"]
    langCode = sfData["langCode"]

    try:
        clipFileKey = createFileClip(bucket, key)
        jobName = pcacommon.submitTranscribeJob(bucket, clipFileKey, langCode, contentType)
        sfData["jobName"] = jobName
    except Exception as e:
        print(e)
        # If we cannot sort out the clip then we can only continue with the first language
        sfData["langCode"] = cf.appConfig[cf.CONF_TRANSCRIBE_LANG][0]

    return sfData

# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "pca-raw-audio-1234",
        "key": "nci/26394190000000000 11.27.33.000 08-14-2020.wav",
        "contentType": "wav",
        "langCode": ""
    }
    lambda_handler(event, "")
