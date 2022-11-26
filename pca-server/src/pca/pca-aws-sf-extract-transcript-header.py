"""
This python function is part of the main processing workflow.  It will generate equivalent values
for Transcribe job header information from an input Transcribe results file, and then write out some
partial results before passing control to the next step.  This allow the delivery of transcriptions
from an external Transcribe Live Call Analytics streaming job

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
from pcaresults import PCAResults
from datetime import datetime
from pathlib import Path
import pcaconfiguration as cf
import pcacommon
import boto3
import json
import time
import copy

# Useful constants
TMP_DIR = "/tmp"


def load_transcript_file(transcript_bucket, transcript_path):
    """
    Loads the transcription file from its S3 location

    :param transcript_bucket: S3 bucket holding the transcript file
    :param transcript_path: Full path to the transcript file in the bucket
    :return: JSON transcript results file
    """
    # Download the job JSON results file to a local temp file
    json_filepath = TMP_DIR + '/' + transcript_path.split("/")[-1]

    # Now download - this has been known to get a "404 HeadObject Not Found",
    # which makes no sense, so if that happens then re-try in a sec.  Only once.
    s3Client = boto3.client('s3')
    try:
        s3Client.download_file(transcript_bucket, transcript_path, json_filepath)
    except:
        time.sleep(3)
        s3Client.download_file(transcript_bucket, transcript_path, json_filepath)

    # Load in and the JSON file for processing, and set our language codes for the file and Comprehend
    asr_output = json.load(open(Path(json_filepath).absolute(), "r", encoding="utf-8"))

    # Clean up and return the result
    pcacommon.remove_temp_file(json_filepath)
    return asr_output


def update_audio_file_metadata(sf_event, interim_results):
    """
    Extracts metadata from the associated audio file, such as sample rate and format

    :param sf_event: Step Function input event data
    :param interim_results:
    """
    # First, we need to download the original audio file, which for streaming analytics
    # will be in the playbackAudio folder, named after the transcript, and will be a WAV
    ts_info = interim_results.get_conv_analytics().get_transcribe_job()
    base_filename = (sf_event["key"].split('/')[-1]).split('.json')[0] + '.wav'
    output_filename = TMP_DIR + "/" + base_filename
    input_filename = cf.appConfig[cf.CONF_PREFIX_AUDIO_PLAYBACK] + "/" + base_filename

    # Now download and process that audio file
    try:
        # Download
        s3Client = boto3.client('s3')
        s3Client.download_file(cf.appConfig[cf.CONF_S3BUCKET_INPUT], input_filename, output_filename)

        # Extract some stream-based metadata from the audio file
        ts_info.media_sample_rate = int(pcacommon.ffprobe_get_stream_entries("stream=sample_rate", output_filename))
        ts_info.media_format = pcacommon.ffprobe_get_stream_entries("format=format_name", output_filename)

        # Update our audio file locations
        ts_info.media_original_uri = "s3://" + cf.appConfig[cf.CONF_S3BUCKET_INPUT] + "/" + input_filename
        ts_info.media_playback_uri = ts_info.media_original_uri

        # Remove any temp tile
        pcacommon.remove_temp_file(output_filename)
    except Exception as e:
        print(e)
        print(f"Unable to download/process audio file associated with transcript {sf_event['key']}")


def create_participant_map(sf_event, asr_output):
    """
    Creates a participant/channel map, which is needed in future steps.  Note, we have to assume
    that the first entry in the JSON transcript's [Participants] block came from channel 0.

    :param sf_event:  Step Function input event data
    :param asr_output: JSON transcript to be processed
    """
    index = 0
    participant_map = []
    for participant in asr_output["Participants"]:
        new_entry = {"ChannelId": index,
                     "ParticipantRole": participant["ParticipantRole"]}
        participant_map.append(new_entry)
        index += 1

    sf_event["channelDefinitions"] = participant_map


def create_transcribe_job_header(sf_event, asr_output):
    """
    Based on the Step Functions input data and the transcript, generate as much data as possible in the
    TranscribeJobInfo header block, and some basic analytics entries, so that when the next workflow step
    tp process the transcript is called it has the same header data from a transcript as is does from an
    audio file.  This will not be perfect - e.g. entries for Custom Vocabulary or Vacabulary filters simply
    don't exist in Streaming Analytics files.

    :param sf_event:  Step Function input event data
    :param asr_output: JSON transcript to be processed
    :return: Our initial header results to be used by later workflow steps
    """

    # Mark the Step Functions data with the type of processing
    # TODO this will have to be more programmatic as we support other Transcribe output formats
    assert ("ConversationCharacteristics" in asr_output) and ("JobName" not in asr_output),\
        "Only Transcribe Streaming Analytics transcripts are supported"

    # Add on the event values that we'd expect to have from an audio file
    # TODO The API mode should streaming analytics, but wait until the UI can cope
    sf_event["apiMode"] = cf.API_ANALYTICS
    sf_event["jobName"] = asr_output["SessionId"]
    sf_event["transcribeStatus"] = asr_output["JobStatus"]

    interim_results = PCAResults()
    interim_results.analytics.conversationLanguageCode = asr_output["LanguageCode"]

    # Setup the simple [TranscribeJobInfo] data points
    transcribe_header = interim_results.get_conv_analytics().get_transcribe_job()
    transcribe_header.streaming_mode = True
    transcribe_header.completion_time = str(datetime.now())
    transcribe_header.channel_identification = 1
    transcribe_header.cummulative_word_conf = 0.0

    # Scan transcript for redacted lines - awkward, as each [PII] block is actually marked as
    # what it was - e.g [NAME] - so we look for [, as that shouldn't be in the content line
    pii_lines = list(filter(lambda x: "[" in x["Content"], asr_output["Transcript"]))
    transcribe_header.redacted_transcript = len(pii_lines) > 0

    # Extract audio metadata from the audio file, which also sets our file S3 locations
    update_audio_file_metadata(sf_event, interim_results)

    # Create a channel/participant map
    create_participant_map(sf_event, asr_output)

    # Copy the transcript file to the standard transcript output location
    copy_transcript_file(sf_event)

    # We don't have a job name - we could re-purpose the filename, but later
    # lookups using it could read incorrect data.  So go with the stream session
    transcribe_header.transcribe_job_name = sf_event["key"].split('/')[-1]
    transcribe_header.streaming_session = asr_output["SessionId"]

    return interim_results


def copy_transcript_file(sf_event):
    """
    Copies the transcript file from the input bucket to the location in the output bucket
    and folder that holds the raw transcripts; this will be inside a "liveStreaming", as the
    other TCA outputs are also inside a subfolder

    :param sf_event: Step Functions event
    """
    # Now copy the transcript file to the output folder (where the others all live)
    s3_client = boto3.resource("s3")
    source = {"Bucket": cf.appConfig[cf.CONF_S3BUCKET_INPUT], "Key": sf_event["key"]}
    dest_key = cf.appConfig[cf.CONF_PREFIX_TRANSCRIBE_RESULTS] + "/liveStreaming/" + sf_event["key"].split('/')[-1]
    s3_client.meta.client.copy(source, cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], dest_key)
    sf_event["transcriptUri"] = "s3://" + cf.appConfig[cf.CONF_S3BUCKET_OUTPUT] + "/" + dest_key


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

    # Load up our transcript file and create our baseline data
    asr_output = load_transcript_file(sf_event["bucket"], sf_event["key"])
    interim_results = create_transcribe_job_header(sf_event, asr_output)

    # Now write it out to our interim results location
    json_output_filename = sf_event["key"].split("/")[-1]
    json_output, output_filename = interim_results.write_results_to_s3(object_key=json_output_filename, interim=True)
    sf_event["interimResultsFile"] = output_filename

    return sf_event


# Main entrypoint for testing
if __name__ == "__main__":
    # Test event
    test_event_tca = {
        "bucket": "ak-cci-input",
        "key": "originalTranscripts/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "inputType": "transcript"
    }
    lambda_handler(test_event_tca, "")
