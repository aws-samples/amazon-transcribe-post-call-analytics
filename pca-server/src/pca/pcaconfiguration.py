"""
This python function is part of the main processing workflow.  It loads in all of the configuration parameters
from the SSM Parameter Store and makes them available to all other python functions.  It also includes some helper
functions to check some logical conditions of some of these configuration parameters.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
from botocore.config import Config

# Get the stack name from environment variable
STACK_NAME = os.environ.get('STACK_NAME')

# Parameter Store Field Names used by main workflow
CONF_COMP_LANGS = f"{STACK_NAME}-ComprehendLanguages"
CONF_REDACTION_LANGS = f"{STACK_NAME}-ContentRedactionLanguages"
CONF_CONVO_LOCATION = f"{STACK_NAME}-ConversationLocation"
CONF_ENTITYENDPOINT = f"{STACK_NAME}-EntityRecognizerEndpoint"
CONF_ENTITY_FILE = f"{STACK_NAME}-EntityStringMap"
CONF_ENTITYCONF = f"{STACK_NAME}-EntityThreshold"
CONF_ENTITY_TYPES = f"{STACK_NAME}-EntityTypes"
CONF_PREFIX_AUDIO_PLAYBACK = f"{STACK_NAME}-InputBucketAudioPlayback"
CONF_S3BUCKET_INPUT = f"{STACK_NAME}-InputBucketName"
CONF_PREFIX_RAW_AUDIO = f"{STACK_NAME}-InputBucketRawAudio"
CONF_PREFIX_FAILED_AUDIO = f"{STACK_NAME}-InputBucketFailedTranscriptions"
CONF_PREFIX_INPUT_TRANSCRIPTS = f"{STACK_NAME}-InputBucketOrigTranscripts"
CONF_MAX_SPEAKERS = f"{STACK_NAME}-MaxSpeakers"
CONF_MINNEGATIVE = f"{STACK_NAME}-MinSentimentNegative"
CONF_MINPOSITIVE = f"{STACK_NAME}-MinSentimentPositive"
CONF_S3BUCKET_OUTPUT = f"{STACK_NAME}-OutputBucketName"
CONF_PREFIX_TRANSCRIBE_RESULTS = f"{STACK_NAME}-OutputBucketTranscribeResults"
CONF_PREFIX_PARSED_RESULTS = f"{STACK_NAME}-OutputBucketParsedResults"
CONF_SPEAKER_NAMES = f"{STACK_NAME}-SpeakerNames"
CONF_SPEAKER_MODE = f"{STACK_NAME}-SpeakerSeparationType"
COMP_SFN_NAME = f"{STACK_NAME}-StepFunctionName"
CONF_SUPPORT_BUCKET = f"{STACK_NAME}-SupportFilesBucketName"
CONF_TRANSCRIBE_LANG = f"{STACK_NAME}-TranscribeLanguages"
CONF_TELEPHONY_CTR = f"{STACK_NAME}-TelephonyCTRType"
CONF_TELEPHONY_CTR_SUFFIX = f"{STACK_NAME}-TelephonyCTRFileSuffix"
CONF_VOCABNAME = f"{STACK_NAME}-VocabularyName"
CONF_CLMNAME = f"{STACK_NAME}-CustomLangModelName"
CONF_FILENAME_DATETIME_REGEX = f"{STACK_NAME}-FilenameDatetimeRegex"
CONF_FILENAME_DATETIME_FIELDMAP = f"{STACK_NAME}-FilenameDatetimeFieldMap"
CONF_FILENAME_GUID_REGEX = f"{STACK_NAME}-FilenameGUIDRegex"
CONF_FILENAME_AGENT_REGEX = f"{STACK_NAME}-FilenameAgentRegex"
CONF_FILENAME_CUST_REGEX = f"{STACK_NAME}-FilenameCustRegex"
CONF_FILTER_MODE = f"{STACK_NAME}-VocabFilterMode"
CONF_FILTER_NAME = f"{STACK_NAME}-VocabFilterName"
CONF_KENDRA_INDEX_ID = f"{STACK_NAME}-KendraIndexId"
CONF_WEB_URI = f"{STACK_NAME}-WebUiUri"
CONF_TRANSCRIBE_API = f"{STACK_NAME}-TranscribeApiMode"
CONF_REDACTION_TRANSCRIPT = f"{STACK_NAME}-CallRedactionTranscript"
CONF_REDACTION_AUDIO = f"{STACK_NAME}-CallRedactionAudio"
CONF_CALL_SUMMARIZATION = f"{STACK_NAME}-CallSummarization"

# Parameter store fieldnames used by bulk import
BULK_S3_BUCKET = f"{STACK_NAME}-BulkUploadBucket"
BULK_JOB_LIMIT = f"{STACK_NAME}-BulkUploadMaxTranscribeJobs"
BULK_MAX_DRIP_RATE = f"{STACK_NAME}-BulkUploadMaxDripRate"

# Transcribe API Modes
API_STANDARD = "standard"
API_ANALYTICS = "analytics"
API_STREAM_ANALYTICS = "analytics-streaming"

# Speaker separation modes
SPEAKER_MODE_SPEAKER = "speaker"
SPEAKER_MODE_CHANNEL = "channel"
SPEAKER_MODE_AUTO = "auto"
SPEAKER_MODES = [SPEAKER_MODE_SPEAKER, SPEAKER_MODE_CHANNEL, SPEAKER_MODE_AUTO]

# Vocabulary filter modes - gets reset to "" if configured value is not one of the list
VOCAB_FILTER_MODES = {"remove", "mask", "tag"}

# Other defined constant values
NLP_THROTTLE_RETRIES = 3

# Configuration data
appConfig = {}

config = Config(
   retries = {
      'max_attempts': 100,
      'mode': 'adaptive'
   }
)

def extractParameters(ssmResponse, useTagName):
    """
    Picks out the Parameter Store results and appends the values to our
    overall 'appConfig' variable.
    """

    # Good parameters first
    for param in ssmResponse["Parameters"]:
        name = param["Name"]
        value = param["Value"]
        appConfig[name] = value

    # Now the bad/missing
    for paramName in ssmResponse["InvalidParameters"]:
        if useTagName:
            appConfig[paramName] = paramName
        else:
            appConfig[paramName] = ""


def loadConfiguration():
    """
    Loads in the configuration values from Parameter Store.  Bulk loads them in batches of 10,
    and any that are missing are set to an empty string or to the tag-name.
    """

    # Load the the core ones in from Parameter Store in batches of up to 10
    ssm = boto3.client("ssm", config=config)
    fullParamList1 = ssm.get_parameters(
        Names=[
            CONF_COMP_LANGS,
            CONF_REDACTION_LANGS,
            CONF_ENTITYENDPOINT,
            CONF_ENTITY_FILE,
            CONF_ENTITYCONF,
            CONF_PREFIX_AUDIO_PLAYBACK,
            CONF_S3BUCKET_INPUT,
            CONF_PREFIX_RAW_AUDIO,
            CONF_PREFIX_FAILED_AUDIO,
            CONF_PREFIX_INPUT_TRANSCRIPTS,
        ]
    )
    fullParamList2 = ssm.get_parameters(
        Names=[
            CONF_MAX_SPEAKERS,
            CONF_MINNEGATIVE,
            CONF_MINPOSITIVE,
            CONF_S3BUCKET_OUTPUT,
            CONF_PREFIX_PARSED_RESULTS,
            CONF_SPEAKER_NAMES,
            CONF_SPEAKER_MODE,
            COMP_SFN_NAME,
            CONF_SUPPORT_BUCKET,
            CONF_TRANSCRIBE_LANG,
        ]
    )
    fullParamList3 = ssm.get_parameters(
        Names=[
            CONF_PREFIX_TRANSCRIBE_RESULTS,
            CONF_VOCABNAME,
            CONF_CLMNAME,
            CONF_CONVO_LOCATION,
            CONF_ENTITY_TYPES,
            CONF_FILTER_MODE,
            CONF_FILTER_NAME,
            CONF_FILENAME_DATETIME_REGEX,
            CONF_FILENAME_DATETIME_FIELDMAP,
            CONF_FILENAME_GUID_REGEX,
        ]
    )
    fullParamList4 = ssm.get_parameters(
        Names=[
            CONF_FILENAME_AGENT_REGEX,
            CONF_FILENAME_CUST_REGEX,
            CONF_KENDRA_INDEX_ID,
            CONF_WEB_URI,
            CONF_TRANSCRIBE_API,
            CONF_REDACTION_TRANSCRIPT,
            CONF_REDACTION_AUDIO,
            CONF_TELEPHONY_CTR,
            CONF_TELEPHONY_CTR_SUFFIX,
            CONF_CALL_SUMMARIZATION
        ]
    )

    # Extract our parameters into our config
    extractParameters(fullParamList1, False)
    extractParameters(fullParamList2, False)
    extractParameters(fullParamList3, False)
    extractParameters(fullParamList4, False)

    # If any important empty values to something
    if (appConfig[CONF_MINNEGATIVE]) == "":
        appConfig[CONF_MINNEGATIVE] = 0.5
    if (appConfig[CONF_MINPOSITIVE]) == "":
        appConfig[CONF_MINPOSITIVE] = 0.5
    if (appConfig[CONF_ENTITYCONF]) == "":
        appConfig[CONF_ENTITYCONF] = 0.5
    if appConfig[CONF_FILTER_MODE] not in VOCAB_FILTER_MODES:
        appConfig[CONF_FILTER_MODE] = ""
        appConfig[CONF_FILTER_NAME] = ""

    # Validate speaker-separation mode
    appConfig[CONF_SPEAKER_MODE] = appConfig[CONF_SPEAKER_MODE].lower()
    if (appConfig[CONF_SPEAKER_MODE]) not in SPEAKER_MODES:
        appConfig[CONF_SPEAKER_MODE] = SPEAKER_MODE_SPEAKER

    # Do any processing (casting, list expansion, etc) that we some parameters need
    appConfig[CONF_MINNEGATIVE] = float(appConfig[CONF_MINNEGATIVE])
    appConfig[CONF_MINPOSITIVE] = float(appConfig[CONF_MINPOSITIVE])
    appConfig[CONF_ENTITYCONF] = float(appConfig[CONF_ENTITYCONF])
    appConfig[CONF_ENTITY_TYPES] = appConfig[CONF_ENTITY_TYPES].split(" | ")
    appConfig[CONF_COMP_LANGS] = appConfig[CONF_COMP_LANGS].split(" | ")
    appConfig[CONF_REDACTION_LANGS] = appConfig[CONF_REDACTION_LANGS].split(" | ")
    appConfig[CONF_TRANSCRIBE_LANG] = appConfig[CONF_TRANSCRIBE_LANG].split(" | ")
    appConfig[CONF_SPEAKER_NAMES] = appConfig[CONF_SPEAKER_NAMES].split(" | ")
    appConfig[CONF_TELEPHONY_CTR_SUFFIX] = appConfig[CONF_TELEPHONY_CTR_SUFFIX].split(" | ")


def isAutoLanguageDetectionSet():
    """
    Returns flag to indicate if we need to do Auto Language Detection in Transcribe,
    which is indicated by multiple languages being defined on the config parameter
    """
    return len(appConfig[CONF_TRANSCRIBE_LANG]) > 1


def isTranscriptRedactionEnabled():
    """
    Returns flag to indicate if we need to enable Transcribe redaxtion
    """
    return appConfig[CONF_REDACTION_TRANSCRIPT] == "true"


def isAudioRedactionEnabled():
    """
    Returns flag to indicate if we need to only allow the playback of redacted audio.  This is only
    valid on Call Analytics jobs, as other Transcribe modes don't generate redacted audio, and it
    is only generated if transcription was enabled in the first place
    """
    return isTranscriptRedactionEnabled() and (appConfig[CONF_REDACTION_AUDIO] == "true")


if __name__ == "__main__":
    loadConfiguration()
