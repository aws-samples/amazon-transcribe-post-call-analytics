import os
import boto3
import pcaconfiguration as cf

# Folder within the InputBucket used to hold temporary clip files
TMP_UPLOAD_PREFIX = "clip/"


def generateClipFileName(key):
    """
    Generate the correct object name for the 30-second audio clip for Transcribe Language ID, based upon the original
    S3 file key.  This is used for the local filestore object that ffmpeg creates, so doesn't have the key on.  We
    also force it to MP3 format, as sometime the conversion fails if the file format is odd (e.g. OGG data in .wav)
    """
    return os.path.splitext(key.split('/')[-1])[0] + "_clip." + "mp3"


def generateClipFileKey(filename):
    """
    Generate the correct S3 key for the 30-second audio clip for Transcribe Language ID
    """
    return TMP_UPLOAD_PREFIX + filename.split('/')[-1]


def generateJobName(key):
    """
    Transcribe job names cannot contains spaces.  This takes in an S3
    object key, extracts the filename part, replaces spaces with "-"
    characters and returns that as the job-name to use
    """

    # Get rid of leading path, and replace [SPACE] with "-"
    response = key
    if "/" in key:
        response = response[1 + key.find('/'):]
    response = response.replace(" ", "-")

    return response


def checkExistingJobStatus(jobName, transcribeClient):
    """
    Checks the status of a Transcribe job with the specified name.  It will return the current
    status of the job if it exists, and returns an empty string if it doesn't
    """
    try:
        # If it exists (e.g. doesn't exception) then we may want to delete iz
        currentJobStatus = transcribeClient.get_transcription_job(TranscriptionJobName=jobName)["TranscriptionJob"]["TranscriptionJobStatus"]
    except Exception as e:
        # Job didn't already exist - carry on
        currentJobStatus = ""

    return currentJobStatus


def submitTranscribeJob(bucket, key, langCode, role_arn):
    """
    Submits a job to Transcribe based upon the supplied parameters.  If the language code
    is an empty string then we are doing language detection.
    """
    # Get our boto3 client
    transcribeClient = boto3.client('transcribe')

    # Generate job-name - delete if it already exists
    jobName = generateJobName(key)
    currentJobStatus = checkExistingJobStatus(jobName, transcribeClient)
    uri = 's3://' + bucket + '/' + key

    # If there's a job already running then the input file may have been copied - quit
    if (currentJobStatus == "IN_PROGRESS") or (currentJobStatus == "QUEUED"):
        # Return empty job name
        print("A Transcription job named \'{}\' is already in progress - cannot continue.".format(jobName))
        return ""
    elif currentJobStatus != "":
        # But if an old one exists we can delete it
        transcribeClient.delete_transcription_job(TranscriptionJobName=jobName)

    # Start off our settings blocks
    mediaSettings = {'MediaFileUri': uri}
    jobSettings = {'ChannelIdentification': False}

    # Some settings are specific to language detection
    if langCode == "":
        # No specific code means language detection, so also turn off PII
        # and the output bucket as we have no interest in the transcript
        selectedLanguage = None
        contentRedaction = None
        outputBucket = None
        languageIdentification = True
        languageIdentList = cf.appConfig[cf.CONF_TRANSCRIBE_LANG]
    else:
        # Setup flags to ignore language detection
        selectedLanguage = langCode
        languageIdentList = None

        # Double check that a custom-vocab exists for our language,
        # and they aren't supported for language detection runs
        if cf.appConfig[cf.CONF_VOCABNAME] != "":
            try:
                vocabName = cf.appConfig[cf.CONF_VOCABNAME] + '-' + langCode.lower()
                ourVocab = transcribeClient.get_vocabulary(VocabularyName = vocabName)
                if ourVocab["VocabularyState"] == "READY":
                    # Only use it if it is ready for use
                    jobSettings["VocabularyName"] = vocabName
            except:
                # Doesn't exist - don't use it
                pass

        # Only enable content redaction if it's supported
        if langCode in cf.appConfig[cf.CONF_REDACTION_LANGS]:
            contentRedaction = {'RedactionType': 'PII', 'RedactionOutput': 'redacted_and_unredacted'}
        else:
            contentRedaction = None

        # Define our other full transcript settings
        outputBucket = cf.appConfig[cf.CONF_S3BUCKET_OUTPUT]
        jobSettings["ShowSpeakerLabels"] = True
        jobSettings["MaxSpeakerLabels"] = int(cf.appConfig[cf.CONF_MAX_SPEAKERS])
        jobSettings["ShowAlternatives"] = True
        jobSettings["MaxAlternatives"] = 2

    # Job execution settings - role required is in an environment variable
    executionSettings = {
        "AllowDeferredExecution": True,
        "DataAccessRoleArn": role_arn
    }

    # Should have a clear run at doing the job now
    kwargs = {'TranscriptionJobName': jobName,
              'LanguageCode': selectedLanguage,
              'Media': mediaSettings,
              'OutputBucketName': outputBucket,
              'Settings': jobSettings,
              'JobExecutionSettings': executionSettings,
              'ContentRedaction': contentRedaction,
              'IdentifyLanguage': languageIdentification,
              'LanguageOptions': languageIdentList
    }

    # Start the Transcribe job, removing any 'None' values on the way
    transcribeClient = boto3.client('transcribe')
    response = transcribeClient.start_transcription_job(
        **{k: v for k, v in kwargs.items() if v is not None}
    )

    # Return our job name, as we need to track it
    return jobName
