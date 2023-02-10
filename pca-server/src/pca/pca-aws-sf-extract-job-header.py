"""
This python function is part of the main processing workflow.  It will read in all of the relevant
Transcribe job header information and write out some partial results before passing control to the
next step

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
from pcaresults import PCAResults
import pcaconfiguration as cf
import copy
import boto3


def populate_job_info(transcribe_info, job_info, api_mode, lang_code):
    """
    Updates the PCAResults data for Transcribe with data from the Transcribe Job Info.  Note, some of
    this may be overwritten later by other processes; e.g. when the word confidence average score is
    calculated, or it we change the playback URI

    :param transcribe_info: Transcribe data block within our PCAResults block
    :param job_info: Output from Transcribe's job information API call
    :param api_mode: The operational mode used for Transcribe (e.g. Standard or Anaytics)
    :param lang_code: The language of the transcript file
    """
    # Some fields we pick off the basic job info
    transcribe_info.api_mode = api_mode
    transcribe_info.streaming_mode = False
    transcribe_info.completion_time = str(job_info["CompletionTime"])
    transcribe_info.media_format = job_info["MediaFormat"]
    transcribe_info.media_sample_rate = int(job_info["MediaSampleRateHertz"])
    transcribe_info.media_original_uri = job_info["Media"]["MediaFileUri"]
    transcribe_info.media_playback_uri = transcribe_info.media_original_uri

    # Vocabulary name is optional
    if "VocabularyName" in job_info["Settings"]:
        transcribe_info.custom_vocab_name = job_info["Settings"]["VocabularyName"]

    # Vocabulary filter is optional
    if "VocabularyFilterName" in job_info["Settings"]:
        transcribe_info.vocab_filter_name = job_info["Settings"]["VocabularyFilterName"]
        transcribe_info.vocab_filter_method = job_info["Settings"]["VocabularyFilterMethod"]

    # Some fields are different in the job-status depending upon which API we were using
    if api_mode == cf.API_ANALYTICS:
        transcribe_info.transcribe_job_name = job_info["CallAnalyticsJobName"]
        transcribe_info.channel_identification = 1

        # CLM name is optional
        if "LanguageModelName" in job_info["Settings"]:
            transcribe_info.clm_name = trim_clm_name(job_info["Settings"]["LanguageModelName"], lang_code)
    else:
        transcribe_info.transcribe_job_name = job_info["TranscriptionJobName"]
        transcribe_info.channel_identification = int(job_info["Settings"]["ChannelIdentification"])

        # CLM name is optional - it's currently the only item in the "ModelSettings"
        # block in the job-info dataset, but we shouldn't assume that this will last
        if "ModelSettings" in job_info:
            if "LanguageModelName" in job_info["ModelSettings"]:
                transcribe_info.clm_name = trim_clm_name(job_info["ModelSettings"]["LanguageModelName"], lang_code)


def trim_clm_name(clm_name, lang_code):
    """
    The CLM name in Transcribe will contain a language suffix, as we define a CLM base-name and look
    for language-specific variants.  This function will strip off the code from CLM name in a case-insensitive
    fashion and return that for staring in the output JSON.  We could just read the configuration, but
    there's always a chance of the configured CLM base-name changing between the job being submitted
    and the transcript being generated

    :param clm_name: Full CLM name in Transcribe
    :param lang_code: The language of the transcript file
    :return: CLM name with the language code suffix removed, or just the CLM full name if there's no lang code
    """

    # Search for the language code in the CLM, and trim the name from that point, taking
    # into account that there will be another "-" between the name and language code
    lang_pos = clm_name.lower().find(lang_code.lower())
    if lang_pos >= 0:
        base_name = clm_name[0:lang_pos-1]
    else:
        base_name = clm_name

    return base_name


def load_transcribe_job_header(event):
    """
    Loads in the job status for the job named in input event.  The event will inform the method which of the
    Transcribe APIs should be called (e.g. standard or call analytics).  It will exception if the job either
    doesn't exist or if it is still running.

    :param event: Event info passed down from Step Functions
    :return: PCAResults() structure that just contains the Transcribe job info
    """
    # Load in the Amazon Transcribe job header information, ensuring that the job has completed
    transcribe_client = boto3.client("transcribe")
    api_mode = event["apiMode"]
    job_name = event["jobName"]
    try:
        is_redacted = False
        if api_mode == cf.API_STANDARD:
            # Standard Transcribe job
            transcribe_job_info = transcribe_client.get_transcription_job(TranscriptionJobName=job_name)["TranscriptionJob"]
            if "ContentRedaction" in transcribe_job_info:
                transcript_uri = transcribe_job_info["Transcript"]["RedactedTranscriptFileUri"]
                is_redacted = True
            else:
                transcript_uri = transcribe_job_info["Transcript"]["TranscriptFileUri"]
        elif api_mode == cf.API_ANALYTICS:
            # Call Analytics Transcribe job
            transcribe_job_info = transcribe_client.get_call_analytics_job(CallAnalyticsJobName=job_name)["CallAnalyticsJob"]
            if "RedactedTranscriptFileUri" in transcribe_job_info["Transcript"]:
                transcript_uri = transcribe_job_info["Transcript"]["RedactedTranscriptFileUri"]
                is_redacted = True
            else:
                transcript_uri = transcribe_job_info["Transcript"]["TranscriptFileUri"]

    except transcribe_client.exceptions.BadRequestException:
        assert False, f"Unable to load information for Transcribe job named '{job_name}'."

    # Now take this info data and create the analytics results header info data
    interim_results = PCAResults()
    interim_results.analytics.conversationLanguageCode = transcribe_job_info["LanguageCode"]
    job_results_header = interim_results.get_conv_analytics().get_transcribe_job()
    populate_job_info(job_results_header, transcribe_job_info, api_mode, transcribe_job_info["LanguageCode"])
    job_results_header.redacted_transcript = is_redacted

    # Pass the location of any redacted audio to the next step - it isn't
    # needed in the results, but the next step in the workflow may need it
    if "RedactedMediaFileUri" in transcribe_job_info["Media"]:
        event["redactedMediaFileUri"] = transcribe_job_info["Media"]["RedactedMediaFileUri"]

    # Potentially add some values to our SF event data to pass to the next step
    event["transcriptUri"] = transcript_uri
    if "ChannelDefinitions" in transcribe_job_info:
        event["channelDefinitions"] = transcribe_job_info["ChannelDefinitions"]

    # Return the whole results block
    return interim_results


def lambda_handler(event, context):
    """
    Lambda handler entrypoint

    :param event: Step Function input event data
    :param context: Lambda context (unused)
    :return:
    """
    # Load our configuration data
    sf_event = copy.deepcopy(event)
    cf.loadConfiguration()
    job_name = sf_event["jobName"]

    # We should only be here if the job has completed, so exit quickly if this isn't the case
    assert sf_event["transcribeStatus"] == "COMPLETED", f"Transcription job '{job_name}' has not yet completed."

    # Load in the job header and get our transcript file location
    interim_results = load_transcribe_job_header(sf_event)

    # Now write it out to our interim results location
    json_output_filename = sf_event["transcriptUri"].split("/")[-1]
    json_output, output_filename = interim_results.write_results_to_s3(object_key=json_output_filename, interim=True)
    sf_event["interimResultsFile"] = output_filename

    return sf_event


# Main entrypoint for testing
if __name__ == "__main__":
    # Test event
    test_event_analytics = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "inputType": "audio",
        "jobName": "Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED"
    }
    test_event_stereo = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "inputType": "audio",
        "jobName": "Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED"
    }
    test_event_mono = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "inputType": "audio",
        "jobName": "Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED"
    }
    lambda_handler(test_event_analytics, "")
    lambda_handler(test_event_stereo, "")
    lambda_handler(test_event_mono, "")
