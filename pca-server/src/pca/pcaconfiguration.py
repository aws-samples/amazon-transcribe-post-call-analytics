import boto3

# Parameter Store Field Names used by main workflow
CONF_COMP_LANGS = "ComprehendLanguages"
CONF_REDACTION_LANGS = "ContentRedactionLanguages"
CONF_CONVO_LOCATION = "ConversationLocation"
CONF_ENTITYENDPOINT = "EntityRecognizerEndpoint"
CONF_ENTITY_FILE = "EntityStringMap"
CONF_ENTITYCONF = "EntityThreshold"
CONF_ENTITY_TYPES = "EntityTypes"
CONF_PREFIX_MP3_PLAYBACK = "InputBucketAudioPlayback"
CONF_S3BUCKET_INPUT = "InputBucketName"
CONF_PREFIX_RAW_AUDIO = "InputBucketRawAudio"
CONF_PREFIX_FAILED_AUDIO = "InputBucketFailedTranscriptions"
CONF_MAX_SPEAKERS = "MaxSpeakers"
CONF_MINNEGATIVE = "MinSentimentNegative"
CONF_MINPOSITIVE = "MinSentimentPositive"
CONF_S3BUCKET_OUTPUT = "OutputBucketName"
CONF_PREFIX_PARSED_RESULTS = "OutputBucketParsedResults"
CONF_SPEAKER_NAMES = "SpeakerNames"
CONF_SPEAKER_SEPARATION = "SpeakerSeparationType"
COMP_SFN_NAME = "StepFunctionName"
CONF_SUPPORT_BUCKET = "SupportFilesBucketName"
CONF_TRANSCRIBE_LANG = "TranscribeLanguages"
CONF_TRANSCRIBE_ALTLANG = "TranscribeAlternateLanguage"
CONF_VOCABNAME = "VocabularyName"
CONF_FILTER_MODE = "VocabFilterMode"
CONF_FILTER_NAME = "VocabFilterName"

# Parameter store fieldnames used by bulk import
BULK_S3_BUCKET = "BulkUploadBucket"
BULK_JOB_LIMIT = "BulkUploadMaxTranscribeJobs"
BULK_MAX_DRIP_RATE = "BulkUploadMaxDripRate"

# Speaker separation modes
SPEAKER_MODE_SPEAKER = "speaker"
SPEAKER_MODE_CHANNEL = "channel"
SPEAKER_MODE_AUTO = "auto"
SPEAKER_MODES = [SPEAKER_MODE_SPEAKER, SPEAKER_MODE_CHANNEL, SPEAKER_MODE_AUTO]

# Vocabulary filter modes - gets reset to "" if configured value is not one of the list
VOCAB_FILTER_MODES = {"remove", "mask", "tag"}

# Configuration data
appConfig = {}

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
    ssm = boto3.client('ssm')
    fullParamList1 = ssm.get_parameters(Names=[CONF_COMP_LANGS, CONF_REDACTION_LANGS, CONF_ENTITYENDPOINT,
                                               CONF_ENTITY_FILE, CONF_ENTITYCONF, CONF_PREFIX_MP3_PLAYBACK,
                                               CONF_S3BUCKET_INPUT, CONF_PREFIX_RAW_AUDIO, CONF_PREFIX_FAILED_AUDIO,
                                               CONF_MAX_SPEAKERS])
    fullParamList2 = ssm.get_parameters(Names=[CONF_MINNEGATIVE, CONF_MINPOSITIVE, CONF_S3BUCKET_OUTPUT,
                                               CONF_PREFIX_PARSED_RESULTS, CONF_SPEAKER_NAMES, CONF_SPEAKER_SEPARATION,
                                               COMP_SFN_NAME, CONF_SUPPORT_BUCKET, CONF_TRANSCRIBE_LANG,
                                               CONF_TRANSCRIBE_ALTLANG])
    fullParamList3 = ssm.get_parameters(Names=[CONF_VOCABNAME, CONF_CONVO_LOCATION, CONF_ENTITY_TYPES, CONF_FILTER_MODE, CONF_FILTER_NAME])

    # Extract our parameters into our config
    extractParameters(fullParamList1, False)
    extractParameters(fullParamList2, False)
    extractParameters(fullParamList3, False)

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
    appConfig[CONF_SPEAKER_SEPARATION] = appConfig[CONF_SPEAKER_SEPARATION].lower()
    if (appConfig[CONF_SPEAKER_SEPARATION]) not in SPEAKER_MODES:
        appConfig[CONF_SPEAKER_SEPARATION] = SPEAKER_MODE_SPEAKER

    # Do any processing (casting, list expansion, etc) that we some parameters need
    appConfig[CONF_MINNEGATIVE] = float(appConfig[CONF_MINNEGATIVE])
    appConfig[CONF_MINPOSITIVE] = float(appConfig[CONF_MINPOSITIVE])
    appConfig[CONF_ENTITYCONF] = float(appConfig[CONF_ENTITYCONF])
    appConfig[CONF_ENTITY_TYPES] = appConfig[CONF_ENTITY_TYPES].split(" | ")
    appConfig[CONF_COMP_LANGS] = appConfig[CONF_COMP_LANGS].split(" | ")
    appConfig[CONF_REDACTION_LANGS] = appConfig[CONF_REDACTION_LANGS].split(" | ")
    appConfig[CONF_TRANSCRIBE_LANG] = appConfig[CONF_TRANSCRIBE_LANG].split(" | ")
    appConfig[CONF_SPEAKER_NAMES] = appConfig[CONF_SPEAKER_NAMES].split(" | ")

def isAutoLanguageDetectionSet():
    """
    Returns flag to indicate if we need to do Auto Language Detection in Transcribe,
    which is indicated by multiple languages being defined on the config parameter
    """
    return len(appConfig[CONF_TRANSCRIBE_LANG]) > 1

if __name__ == "__main__":
    loadConfiguration()
