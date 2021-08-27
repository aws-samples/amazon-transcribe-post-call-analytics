from urllib.parse import urlparse
import boto3
import copy


def lambda_handler(event, context):
    # Get our event data
    sfData = copy.deepcopy(event)
    transcribeJob = sfData["jobName"]

    # Load in the Amazon Transcribe job header information, ensuring that the job has completed
    transcribe = boto3.client("transcribe")
    try:
        transcribeJobInfo = transcribe.get_transcription_job(TranscriptionJobName=transcribeJob)["TranscriptionJob"]
        assert transcribeJobInfo[
                "TranscriptionJobStatus"] == "COMPLETED", f"Transcription job '{transcribeJob}' has not yet completed."
    except transcribe.exceptions.BadRequestException:
        assert False, f"Unable to load information for Transcribe job named '{transcribeJob}'."

    # Find our job information and delete it
    try:
        # Start by deleting the clip audio file from S3
        s3Path = transcribeJobInfo["Media"]["MediaFileUri"]
        parsedPath = urlparse(s3Path)
        s3Bucket = parsedPath.netloc
        s3Key = parsedPath.path.lstrip('/')
        s3Client = boto3.client('s3')
        s3Client.delete_object(Bucket=s3Bucket, Key=s3Key)

        # Now delete the clip processing job
        transcribe.delete_transcription_job(TranscriptionJobName=transcribeJob)
        sfData.pop("jobName", None)
        sfData.pop("transcribeStatus", None)
    except:
        # File already gone somehow - nothing for us to do
        pass

    # Pick the language code and return our data
    sfData["langCode"] = transcribeJobInfo["LanguageCode"]
    return sfData

# Main entrypoint for testing
if __name__ == "__main__":
    event = {
      "bucket": "pca-raw-audio-1234",
      "key": "nci/0a.93.a0.3e.00.00 09.11.32.483 09-10-2019.wav",
      "contentType": "wav",
      "langCode": "",
      "jobName": "0a.93.a0.3e.00.00-09.11.32.483-09-10-2019_clip.wav",
      "transcribeStatus": "COMPLETED"
    }
    lambda_handler(event, "")
