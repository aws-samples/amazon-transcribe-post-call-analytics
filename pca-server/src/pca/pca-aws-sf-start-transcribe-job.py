"""
This python function is part of the main processing workflow.  It will start a job in the Amazon Transcribe service,
using whatever configuration parameters are set.  It handles all of the cross-validation of parameters, and takes
into account the audio format - it will then degrade certain feature requests; e.g. if you have configured the app
to do channel-separated audio jobs but the audio file is mono then it switch to speaker-separation mode.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import copy
import boto3
import subprocess
import pcaconfiguration as cf
import pcacommon
import os

# Local temporary folder for file-based operations
TMP_DIR = "/tmp/"


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
        pass


def count_audio_channels(bucket, key):
    """
    Examines an audio file using the FFPROBE utility to determine the number of audio channels in the file.  If
    any errors occurs then it will default to returning "1", implying that it has just a single channel.

    @param bucket: Bucket holding the audio file to be tested
    @param key: Key for the audio file in the bucket
    @return: Number of audio channels found in the file
    """

    # First, we need to download the original audio file
    ffmpegInputFilename = TMP_DIR + key.split('/')[-1]
    s3Client = boto3.client('s3')
    s3Client.download_file(bucket, key, ffmpegInputFilename)

    # Use ffprobe to count the number of channels in the audio file
    try:
        command = ['ffprobe', '-i', ffmpegInputFilename, '-show_entries', 'stream=channels', '-select_streams',
                   'a:0', '-of', 'compact=p=0:nk=1', '-v', '0']
        probResult = subprocess.check_output(command, stderr=subprocess.STDOUT).decode()
        channels_found = int(probResult)
    except Exception as e:
        print(f'Failed to get number of audio streams from input file: {str(e)}')
        channels_found = 1
    finally:
        # Delete our downloaded audio
        pcacommon.remove_temp_file(ffmpegInputFilename)

    return channels_found


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
    api_mode, channel_ident = evaluate_transcribe_mode(bucket, key)

    # Generate job-name - delete if it already exists
    job_name = pcacommon.generate_job_name(key)
    current_job_status = check_existing_job_status(job_name, transcribe, api_mode)
    uri = 's3://' + bucket + '/' + key

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

    # Add our vocab filter method, then check on our language requirements
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
    if cf.isTranscriptRedactionEnabled() and \
            ((lang_code in cf.appConfig[cf.CONF_REDACTION_LANGS]) or language_options is not None):
        content_redaction = {'RedactionType': 'PII', 'RedactionOutput': 'redacted_and_unredacted'}
    else:
        content_redaction = None

    # Now sort out the mode-specific parameters
    if api_mode == cf.API_ANALYTICS:
        # CALL ANALYTICS JOB MODE - start with redaction and language
        if content_redaction is not None:
            job_settings["ContentRedaction"] = content_redaction

        # Work out where our AGENT channel is - this will default to AGENT=0 if it can't work it out
        conf_channels = [speaker_name.lower() for speaker_name in cf.appConfig[cf.CONF_SPEAKER_NAMES]]
        if "agent" in conf_channels:
            # Pick out the index, but if > 1 then we need to default to 0
            agent_channel_number = conf_channels.index("agent")
            if agent_channel_number > 1:
                agent_channel_number = 0
        else:
            # No agent name defined - default to channel-0
            agent_channel_number = 0

        # Now build up or channel definitions
        chan_def_agent = {'ChannelId': agent_channel_number, 'ParticipantRole': 'AGENT'}
        chan_def_cust = {'ChannelId': agent_channel_number ^ 1, 'ParticipantRole': 'CUSTOMER'}

        # Add our language ID or fixed language to "Settings"
        if lang_code is None:
            job_settings["LanguageOptions"] = language_options
            job_settings["LanguageIdSettings"] = language_id_settings
        else:
            job_settings["LanguageOptions"] = [lang_code]

        # Should have a clear run at doing the job now
        kwargs = {'CallAnalyticsJobName': job_name,
                  'Media': media_settings,
                  'OutputLocation': f"s3://{cf.appConfig[cf.CONF_S3BUCKET_OUTPUT]}/{cf.appConfig[cf.CONF_PREFIX_TRANSCRIBE_RESULTS]}/",
                  'DataAccessRoleArn': role_arn,
                  'Settings': job_settings,
                  'ChannelDefinitions': [chan_def_agent, chan_def_cust]
        }

        # Start the Transcribe job, removing any params that are "None"
        response = transcribe.start_call_analytics_job(
            **{k: v for k, v in kwargs.items() if v is not None}
        )
    else:
        # STANDARD TRANSCRIBE JOB MODE - start with some simple flags
        job_settings['ShowSpeakerLabels'] = not channel_ident
        job_settings['ChannelIdentification'] = channel_ident

        # Some settings are valid dependent on the mode
        if not channel_ident:
            job_settings["MaxSpeakerLabels"] = int(cf.appConfig[cf.CONF_MAX_SPEAKERS])

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
                  'OutputKey': cf.appConfig[cf.CONF_PREFIX_TRANSCRIBE_RESULTS] + '/',
                  'Settings': job_settings,
                  'JobExecutionSettings': execution_settings,
                  'ContentRedaction': content_redaction
        }

        # Start the Transcribe job, removing any params that are "None"
        response = transcribe.start_transcription_job(
            **{k: v for k, v in kwargs.items() if v is not None}
        )

    # Return our job name and api mode, as we need to track them
    return job_name, api_mode


def add_vocabulary_filter(tag_structure, lang_code, transcribe_client):
    """
    Checks to see if our defined vocabulary base name has an instance defined within Transcribe
    for the given language code.  If it does then it is added as a tag to the provided structure

    :param tag_structure: Dictionary to hold the filter field tag
    :param lang_code: Language that we're searching for a filter for
    :param transcribe_client: Boto3 client
    """

    try:
        # Look for a vocabulary filter variant defined for this language code
        vocab_filter_name = cf.appConfig[cf.CONF_FILTER_NAME] + '-' + lang_code.lower()
        transcribe_client.get_vocabulary_filter(VocabularyFilterName=vocab_filter_name)
        tag_structure["VocabularyFilterName"] = vocab_filter_name
    except:
        # Doesn't exist for this language code - quietly exit
        pass


def add_custom_vocabulary(tag_structure, lang_code, transcribe_client):
    """
    Checks to see if our defined vocabulary base name has an instance defined within Transcribe
    for the given language code.  If it does then it is added as a tag to the provided structure

    :param tag_structure: Dictionary to hold a "VocabularyName" field if ours exist
    :param lang_code: Language that we're searching for a vocabulary for
    :param transcribe_client: Boto3 client
    """

    try:
        # Look for a custom vocabulary variant defined for this language code
        vocab_name = cf.appConfig[cf.CONF_VOCABNAME] + '-' + lang_code.lower()
        our_vocab = transcribe_client.get_vocabulary(VocabularyName=vocab_name)
        if our_vocab["VocabularyState"] == "READY":
            # It exists, but we can only use it if it is ready for use
            tag_structure["VocabularyName"] = vocab_name
    except:
        # Doesn't exist for this lamguage code - quietly exit
        pass


def evaluate_transcribe_mode(bucket, key):
    """
    The user can configure which API and which speaker separation method to use, but this will validate that those
    options are valid for the current file and will overrule/downgrade the options.  The rules are:

    (1) If you ask for speaker-separation and you're not doing ANALYTICS then you get it
    (2) If you ask for channel-separation or ANALYTICS but the file is mono then you get STANDARD speaker-separation
    (3) If you ask for ANALYTICS on a 2-channel file then it ignores your speaker/channel-separation setting
    (4) If the audio has neither 1 nor 2 channels then you get STANDARD API with speaker-separation

    @param bucket: Bucket holding the audio file to be tested
    @param key: Key for the audio file in the bucket
    @return: Transcribe API mode and flag for channel separation
    """
    # Determine the correct API and speaker separation that we'll be using
    api_mode = cf.appConfig[cf.CONF_TRANSCRIBE_API]
    channel_count = count_audio_channels(bucket, key)
    channel_mode = cf.appConfig[cf.CONF_SPEAKER_MODE]
    if channel_count == 1:
        # Mono files are always sent through Standard Transcribe with speaker separation, as using
        # either Call Analytics or channel separation will results in sub-standard transcripts
        api_mode = cf.API_STANDARD
        channel_ident = False
    elif channel_count == 2:
        # Call Analytics only works on stereo files - if you configure both
        # ANALYTICS and SPEAKER_SEPARATION then the ANALYTICS mode wins
        if api_mode == cf.API_ANALYTICS:
            channel_ident = True
        else:
            # We're in standard mode with a stereo file - use speaker separation
            # if that was configured, otherwise we'll use channel separation
            channel_ident = (channel_mode != cf.SPEAKER_MODE_SPEAKER)
    else:
        # We could have a file with 0 or > 2 channels - default to 1 (but the file will likely break)
        api_mode = cf.API_STANDARD
        channel_ident = False

    return api_mode, channel_ident


def lambda_handler(event, context):
    # Load our configuration data
    cf.loadConfiguration()
    sfData = copy.deepcopy(event)

    # Get the object from the event and show its content type
    bucket = sfData["bucket"]
    key = sfData["key"]

    try:
        job_name, api_mode = submitTranscribeJob(event["bucket"], key)
        sfData["jobName"] = job_name
        sfData["apiMode"] = api_mode
        return sfData
    except Exception as e:
        print(e)
        raise Exception(
            'Error submitting Transcribe job for file \'{}\' from bucket \'{}\'.'.format(
                key, bucket))


# Main entrypoint for testing
if __name__ == "__main__":
    # Standard test event
    event = {
        "bucket": "ak-cci-input",
        # "key": "originalAudio/mono.wav",
        "key": "originalAudio/AutoRepairs1_GUID_4628bb26-9631-487f-8d7b-0ac8e84074fd_AGENT_AndrewK_DATETIME_07.55.51.067-09-16-2021.wav"
    }
    os.environ['RoleArn'] = 'arn:aws:iam::543648494853:role/PostCallAnalytics-PCAServer-176G28X-TranscribeRole-190N3L79VHCF9'
    lambda_handler(event, "")
