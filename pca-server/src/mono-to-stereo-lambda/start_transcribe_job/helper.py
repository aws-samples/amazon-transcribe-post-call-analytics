# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3
import pcaconfiguration as cf
import os

def generate_job_name(object_path):
    """
    Transcribe job names cannot contain spaces.  This takes in an S3
    object key, extracts the filename part, replaces spaces with "-"
    characters and returns that as the job-name to use
    """

    # Get rid of leading path, and replace [SPACE] with "-", replace "/" with "-", , replace ":" with "-"
    response = object_path
    if "/" in object_path:
        response = response[1 + object_path.find("/"):]
    response = response.replace("/", "-")
    response = response.replace(" ", "-")
    response = response.replace(":", "-")
    return response

def check_existing_job_status(job_name, transcribe, api_mode):
    """
    Checks the status of the named transcription job, either in the Standard Transcribe APIs or
    the Call Analytics APIs.  This is required before launching a new job, as our job names are
    based upon the name of the input audio file, but Transcribe jobs need to be uniquely named

    @param job_name: Name of the transcription job to check for
    @param transcribe: Boto3 client for the Transcribe service
    @param api_mode: Transcribe API mode being used
    @return: Status of the transcription job, empty string means the job didn't exist
    """
    try:
        # Extract the standard Transcribe job status from the correct API
        if api_mode == cf.API_ANALYTICS:
            job_status = transcribe.get_call_analytics_job(CallAnalyticsJobName=job_name)["CallAnalyticsJob"]["CallAnalyticsJobStatus"]
        else:
            job_status = transcribe.get_transcription_job(TranscriptionJobName=job_name)["TranscriptionJob"]["TranscriptionJobStatus"]
    except Exception as e:
        # Job didn't already exist - carry on
        job_status = ""

    return job_status



def delete_existing_job(job_name, transcribe, api_mode):
    """
    Deletes the specified transcription job from either the Standard or Call Analytics APIs

    @param job_name: Name of the transcription job to delete
    @param transcribe: Boto3 client for the Transcribe service
    @param api_mode: Transcribe API mode being used
    """
    try:
        if api_mode == cf.API_ANALYTICS:
            transcribe.delete_call_analytics_job(CallAnalyticsJobName=job_name)
        else:
            transcribe.delete_transcription_job(TranscriptionJobName=job_name)
    except Exception as e:
        # If the job has already been deleted then we don't need to take any action
        print(f"Unable to delete previous Transcribe job {job_name}: {e}")
        
        

def add_vocabulary_filter(tag_structure, lang_code, transcribe_client):
    """
    Checks to see if our defined vocabulary base name has an instance defined within Transcribe
    for the given language code.  If it does then it is added as a tag to the provided structure

    :param tag_structure: Dictionary to hold the filter field tag
    :param lang_code: Language that we're searching for a filter for
    :param transcribe_client: Boto3 client
    """

    # Ensure we at least have something to log if there's an exception
    vocab_filter_name = ""

    try:
        # Look for a vocabulary filter variant defined for this language code
        vocab_filter_name = cf.appConfig[cf.CONF_FILTER_NAME] + '-' + lang_code.lower()
        transcribe_client.get_vocabulary_filter(VocabularyFilterName=vocab_filter_name)
        tag_structure["VocabularyFilterName"] = vocab_filter_name
    except:
        # Doesn't exist for this language code - quietly exit
        print(f"No vocabulary filter defined named {vocab_filter_name}")


def add_custom_vocabulary(tag_structure, lang_code, transcribe_client):
    """
    Checks to see if our defined vocabulary base name has an instance defined within Transcribe
    for the given language code.  If it does then it is added as a tag to the provided structure

    :param tag_structure: Dictionary to hold a "VocabularyName" field if ours exist
    :param lang_code: Language that we're searching for a vocabulary for
    :param transcribe_client: Boto3 client
    """

    # Ensure we at least have something to log if there's an exception
    vocab_name = ""

    try:
        # Look for a custom vocabulary variant defined for this language code
        vocab_name = cf.appConfig[cf.CONF_VOCABNAME] + '-' + lang_code.lower()
        our_vocab = transcribe_client.get_vocabulary(VocabularyName=vocab_name)
        if our_vocab["VocabularyState"] == "READY":
            # It exists, but we can only use it if it is ready for use
            tag_structure["VocabularyName"] = vocab_name
    except:
        # Doesn't exist for this language code - quietly exit
        print(f"No custom vocabulary defined named {vocab_name}")

        
        
def submitTranscribeJob(bucket, key):
    """
    Submits the supplied audio file to Transcribe, using the suppplied language code.  The method will decide
    whether to call the standard Transcribe APIs or the Call Analytics APIs

    @param bucket: Bucket holding the audio file to be tested
    @param key: Key for the audio file in the bucket
    @return: Name of the transcription job, and the Transcript API mode
    """

    # Work out our API mode for Transcribe, and get our boto3 client
    transcribe = boto3.client('transcribe')
    api_mode = 'STANDARD'
    channel_ident = False
    # Generate job-name - delete if it already exists
    job_name = generate_job_name(key)
    current_job_status = check_existing_job_status(job_name, transcribe, api_mode)
    
    print("current_job_status ", current_job_status)
    uri = 's3://{}/{}'.format(bucket, key)

    # If there's a job already running then the input file may have been copied - quit
    if (current_job_status == "IN_PROGRESS") or (current_job_status == "QUEUED"):
        # Return empty job name
        print("A Transcription job named \'{}\' is already in progress - cannot continue.".format(job_name))
        return ""
    elif current_job_status != "":
        # But if an old one exists we can delete it
        delete_existing_job(job_name, transcribe, api_mode)

    # Setup the structures common to both Standard and Call Analytics
    job_settings = {}
    media_settings = {
        'MediaFileUri': uri
    }

#     Add our vocab filter method, then check on our language requirements
    job_settings["VocabularyFilterMethod"] = cf.appConfig[cf.CONF_FILTER_MODE]
    if len(cf.appConfig[cf.CONF_TRANSCRIBE_LANG]) == 1:
        # Specific language, so dd a CV and Vocab Filter to our job_setting if either exists for this language
        lang_code = cf.appConfig[cf.CONF_TRANSCRIBE_LANG][0]
        add_custom_vocabulary(job_settings, lang_code, transcribe)
        add_vocabulary_filter(job_settings, lang_code, transcribe)

        # Clear all Language ID settings
        language_id_settings = None
        language_options = None
    else:
        # Language ID is in play - need to build up language-specific structures
        language_id_settings = {}
        language_options = []
        for language in cf.appConfig[cf.CONF_TRANSCRIBE_LANG]:
            lang_id_options = {}
            add_custom_vocabulary(lang_id_options, language, transcribe)
            add_vocabulary_filter(lang_id_options, language, transcribe)
            language_id_settings[language] = lang_id_options
            language_options.append(language)

        # Ensure we clear our "single language" flag
        lang_code = None

    # Get our role ARN from the environment and enable content redaction (if possible,
    # and if wanted).  Note, if wanted and LangID is active then we enable it, as if the
    # detected language doesn't support PII redaction then Transcribe will ignore the setting
    role_arn = os.environ["RoleArn"]
#     role_arn = "arn:aws:iam::298757604874:role/s3_full_access"
    if cf.isTranscriptRedactionEnabled() and \
             ((lang_code in cf.appConfig[cf.CONF_REDACTION_LANGS]) or language_options is not None):
        content_redaction = {'RedactionType': 'PII', 'RedactionOutput': 'redacted_and_unredacted'}
    else:
        content_redaction = None
        
    
    job_settings['ShowSpeakerLabels'] = True
#     job_settings['ChannelIdentification'] = channel_ident remove

    # Some settings are valid dependent on the mode
    if not channel_ident:
        job_settings["MaxSpeakerLabels"] = int(cf.appConfig[cf.CONF_MAX_SPEAKERS])
#     job_settings['MaxSpeakerLabels'] =2

    # Job execution settings tp allow queueing of standard Transcribe jobs
    execution_settings = {
        "AllowDeferredExecution": True,
        "DataAccessRoleArn": role_arn
    }

    # Should have a clear run at doing the job now
    kwargs = {'TranscriptionJobName': job_name,
            'IdentifyLanguage': lang_code is None,
            'LanguageIdSettings': language_id_settings,
            'LanguageCode': lang_code,
            'LanguageOptions': language_options,
              'Media': media_settings,
            'OutputBucketName': cf.appConfig[cf.CONF_S3BUCKET_OUTPUT],
            'OutputKey': cf.appConfig[cf.CONF_PREFIX_TRANSCRIBE_RESULTS] + '/mono-file-transcription/',
              'Settings': job_settings,
              'JobExecutionSettings': execution_settings,
              'ContentRedaction': content_redaction
    }

    # Start the Transcribe job, removing any params that are "None"
    print({k: v for k, v in kwargs.items() if v is not None})
    response = transcribe.start_transcription_job(
        **{k: v for k, v in kwargs.items() if v is not None}
    )

    # Return our job name and api mode, as we need to track them
    return job_name, api_mode