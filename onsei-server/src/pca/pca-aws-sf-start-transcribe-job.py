import copy
import boto3
import subprocess
import pcaconfiguration as cf
import os

# Local temporary folder for file-based operations
TMP_DIR = "/tmp/"

ROLE_ARN = os.environ["RoleArn"]

def checkExistingJobStatus(jobName, transcribe):
    try:
        # If it exists (e.g. doesn't exception) then we may want to delete iz
        currentJobStatus = transcribe.get_transcription_job(TranscriptionJobName=jobName)["TranscriptionJob"]["TranscriptionJobStatus"]
    except Exception as e:
        # Job didn't already exist - carry on
        currentJobStatus = ""

    return currentJobStatus

def calculateAutoSpeakerSeparation(bucket, key):
    """
    Uses ffprobe to determine the number of channels used in the audio file.  This is used when the speaker
    separation mode has been defined as "AUTO" - if the file in mono then we return SPEAKER_MODE_SPEAKER, and if
    stereo we return SPEAKER_MODE_CHANNEL.  If there's any error then we go with SPEAKER_MODE_SPEAKER, but the
    file is likely to fail transcription anyway due to corruption if this basic channels check fails
    """
    speakerMode = cf.SPEAKER_MODE_CHANNEL

    # First, we need to download the original audio file
    ffmpegInputFilename = TMP_DIR + key.split('/')[-1]
    s3Client = boto3.client('s3')
    s3Client.download_file(bucket, key, ffmpegInputFilename)

    # Use ffprobe to count the number of channels in the audio file
    try:
        command = ['ffprobe', '-i', ffmpegInputFilename, '-show_entries', 'stream=channels', '-select_streams',
                   'a:0', '-of', 'compact=p=0:nk=1', '-v', '0']
        probResult = subprocess.check_output(command, stderr=subprocess.STDOUT).decode()
        channels = int(probResult)
        if channels == 1:
            # Single channel: mono file => speaker-separation mode
            speakerMode = cf.SPEAKER_MODE_SPEAKER
        elif channels == 2:
            # Dual channel: stereo file => channel-separation mode
            speakerMode = cf.SPEAKER_MODE_CHANNEL
        else:
            # There shouldn't be channels <1 or >2, so default to SPEAKER if so
            speakerMode = cf.SPEAKER_MODE_SPEAKER
    except Exception as e:
        print('Failed to get number of audio streams from input file: ' + e)
        speakerMode = cf.SPEAKER_MODE_SPEAKER

    return speakerMode

def submitTranscribeJob(bucket, key, langCode, mediaFormat):

    # Get our clients first
    transcribe = boto3.client('transcribe')
    lambdaClient = boto3.client('lambda')

    # Evaluate what our speaker separation method will be
    channelMode = cf.appConfig[cf.CONF_SPEAKER_SEPARATION]
    if channelMode == cf.SPEAKER_MODE_SPEAKER:
        channelIdent = False
    elif channelMode == cf.SPEAKER_MODE_CHANNEL:
        channelIdent = True
    elif channelMode == cf.SPEAKER_MODE_AUTO:
        channelIdent = (calculateAutoSpeakerSeparation(bucket, key) == cf.SPEAKER_MODE_CHANNEL)

    # Generate job-name - delete if it already exists
    jobName = cf.generateJobName(key)
    currentJobStatus = checkExistingJobStatus(jobName, transcribe)
    uri = 's3://' + bucket + '/' + key

    # If there's a job already running then the input file may have been copied - quit
    if (currentJobStatus == "IN_PROGRESS") or (currentJobStatus == "QUEUED"):
        # Return empty job name
        print("A Transcription job named \'{}\' is already in progress - cannot continue.".format(jobName))
        return ""
    elif currentJobStatus != "":
        # But if an old one exists we can delete it
        transcribe.delete_transcription_job(TranscriptionJobName=jobName)

    # Sort out our settings blocks, but we need to verify custom vocab first
    mediaSettings = {
        'MediaFileUri': uri
    }
    jobSettings = {
       'ShowSpeakerLabels': not channelIdent,
       'ChannelIdentification': channelIdent,
       'ShowAlternatives': True,
       'MaxAlternatives': 2
    }

    # Some settings are valid dependent on the mode
    if not channelIdent:
        jobSettings["MaxSpeakerLabels"] = int(cf.appConfig[cf.CONF_MAX_SPEAKERS])

    # Double check that if we have a custom vocab that it actually exists
    if cf.appConfig[cf.CONF_VOCABNAME] != "":
        try:
            vocabName = cf.appConfig[cf.CONF_VOCABNAME] + '-' + langCode.lower()
            ourVocab = transcribe.get_vocabulary(VocabularyName = vocabName)
            if ourVocab["VocabularyState"] == "READY":
                # Only use it if it is ready for use
                jobSettings["VocabularyName"] = vocabName
        except:
            # Doesn't exist - don't use it
            pass

    # Job execution settings - note, Role is the same as for this Lambda, which is Full S3 access
    executionSettings = {
        "AllowDeferredExecution": True,
        "DataAccessRoleArn": ROLE_ARN,
    }

    # Only enable content redaction if it's supported
    if langCode in cf.appConfig[cf.CONF_REDACTION_LANGS]:
        contentRedaction = {'RedactionType': 'PII', 'RedactionOutput': 'redacted_and_unredacted'}
    else:
        contentRedaction = None

    # Should have a clear run at doing the job now
    kwargs = {'TranscriptionJobName': jobName,
              'LanguageCode': langCode,
              'Media': mediaSettings,
              'OutputBucketName': cf.appConfig[cf.CONF_S3BUCKET_OUTPUT],
              'Settings': jobSettings,
              'JobExecutionSettings': executionSettings,
              'ContentRedaction': contentRedaction
    }

    # Start the Transcribe job, removing any 'None' values on the way
    response = transcribe.start_transcription_job(
        **{k: v for k, v in kwargs.items() if v is not None}
    )

    # Return our job name, as we need to track it
    return jobName

def lambda_handler(event, context):
    # Load our configuration data
    cf.loadConfiguration()
    sfData = copy.deepcopy(event)

    # Get the object from the event and show its content type
    bucket = sfData["bucket"]
    key = sfData["key"]
    contentType = sfData["contentType"]
    langCode = sfData["langCode"]

    try:
        jobName = submitTranscribeJob(event["bucket"], key, langCode, contentType)
        sfData["jobName"] = jobName
        return sfData
    except Exception as e:
        print(e)
        raise Exception(
            'Error submitting Transcribe job for file \'{}\' from bucket \'{}\'.'.format(
                key, bucket))

# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "pca-raw-audio-1234",
        "key": "nci/0a.93.a0.3e.00.00 09.09.16.803 09-17-2019.wav",
        "contentType": "wav",
        # "key": "nci/CAaad2c19c9c856e377620efab245e8d70.RE709d062d6466b413be36fdb88ac24ac9.mp3",
        # "contentType": "mp3",
        "langCode": "en-US"
    }
    lambda_handler(event, "")
