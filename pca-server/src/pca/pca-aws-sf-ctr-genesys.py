"""
This python function is part of the main processing workflow.  This performs any specific processing
required to handle Genesys Contact Trace Record files.

1. Copy conversation time
2. Parse IVR speaking times, tag matching PCA speech segments as being IVR segments

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
from pathlib import Path
from datetime import datetime
import boto3
import json
import pcaconfiguration as cf
import pcaresults
import re

TMP_DIR = "/tmp/"


def load_ctr_file(original_file):
    """
    Loads the matching CTR file for the specified audio file.  For Genesys the CTR file seems to be named
    the same as the audio file with a "_metadata.json" suffix.  We assume that this metadata file is dropped
    into the same S3 bucket/folder location as the matching audio file

    :param original_file: Full S3 key for the call audio file
    :return: Full S3 key for the matching CTR metadata file
    """
    # Generate filename for the metadata file
    ctr_filename = original_file + "_metadata.json"
    ctr_json = []

    try:
        # Check file exists
        s3_client = boto3.client("s3")
        response = s3_client.get_object(Bucket=cf.appConfig[cf.CONF_S3BUCKET_INPUT], Key=ctr_filename)

        # Download to a tempfile
        json_filepath = TMP_DIR + ctr_filename.split("/")[-1]
        s3_client.download_file(cf.appConfig[cf.CONF_S3BUCKET_INPUT], ctr_filename, json_filepath)

        # Load in the JSON file for processing
        json_filepath = Path(json_filepath)
        ctr_json = json.load(open(json_filepath.absolute(), "r", encoding="utf-8"))
    except Exception as e:
        # Exception, most likely file doesn't exist
        print(f"Unable to load Genesys CTR file '{ctr_filename}'")

    return ctr_json


def convert_times_to_seconds(start_time, end_time, call_start_time):
    """
    Converts a given call segment start- and end-time. as defined in the CTR file, to zero-offset times
    based upon the start time of the call (as specified in the CTR file).  This is required as Genesys stores
    this information as 24-hour clock values, which PCA call segments are all offset from 0.00 seconds

    :param start_time: Start time of call segment
    :param end_time: End time of call segment
    :param call_start_time: Start time of call

    :return: Zero-offset timings both start- and end-time
    """
    segment_start = datetime.strptime(start_time, "%Y-%m-%dT%H:%M:%S.%fZ").timestamp() - call_start_time
    segment_end = datetime.strptime(end_time, "%Y-%m-%dT%H:%M:%S.%fZ").timestamp() - call_start_time

    return segment_start, segment_end


def get_agent_channel(speaker_map):
    """
    Finds the AGENT channel from with the speaker map that PCA previously generated

    :param speaker_map: PCA speaker mapping
    :return: Mapping for the AGENT channel
    """
    agent_channel = None
    agent_list = list(filter(lambda talker: talker["DisplayText"].lower() == "agent", speaker_map))
    if len(agent_list) > 0:
        agent_channel = agent_list[0]["Speaker"]
    return agent_channel


def add_speaker_to_map(speaker_map, speaker_name):
    """
    Adds a new speaker to the end speaker mapping, such as an IVR or additional agent,
    and allocates them the next number in the "spk_N" sequence

    :param speaker_map: PCA speaker mapping
    :param speaker_name: Name of new speaker to add
    :return:
    """

    # Work out the index for our next speaker - it should be (but might not be) just maplength+1
    speaker_index_list = []
    for speaker in speaker_map:
        speaker_index_list.append(int(speaker["Speaker"].split("_")[-1]))
    next_speaker_index = f"spk_{max(speaker_index_list) + 1}"

    # Add them to the speaker map and return it
    speaker_map.append({"Speaker": next_speaker_index, "DisplayText": speaker_name})
    return next_speaker_index


def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """

    # Load our configuration data
    cf.loadConfiguration()

    # Load in any associated CTR files
    ctr_json = load_ctr_file(event["key"])

    # Only continue if we managed to load a matching CTR file
    if ctr_json:
        # Load in our existing interim CCA results
        pca_results = pcaresults.PCAResults()
        pca_analytics = pca_results.get_conv_analytics()
        pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])

        # Pick out the official conversation time
        # TODO Push all the regexes to pcacommon.py and simplify/abstract
        match = re.search(cf.appConfig[cf.CONF_FILENAME_DATETIME_REGEX], ctr_json["conversationStart"])
        matched_fields = " ".join(match.groups())
        pca_analytics.conversationTime = str(datetime.strptime(matched_fields,
                                                               cf.appConfig[cf.CONF_FILENAME_DATETIME_FIELDMAP]))

        # Get the speaker channel for the AGENT, as that's where the IVR will be
        # If we can't find the agent channel then we can't do much more here
        agent_channel = get_agent_channel(pca_results.analytics.speaker_labels)
        if agent_channel is not None:
            # Extract all of the IVR lines
            ivr_lines = list(filter(lambda x: x["purpose"] == "ivr", ctr_json["participants"]))

            # If we found any IVR lines then update the relevant speech segments
            if ivr_lines:

                # We need the call start time in seconds in order to work out call timing offsets
                # We also need to know what the speaker number should be for the IVR entries
                call_start_time = datetime.strptime(pca_analytics.conversationTime, "%Y-%m-%d %H:%M:%S.%f").timestamp()
                ivr_speaker_name = cf.appConfig[cf.CONF_TELEPHONY_CTR].capitalize() + " IVR"
                ivr_speaker_channel = add_speaker_to_map(pca_results.analytics.speaker_labels, ivr_speaker_name)

                # Go through and extract all do the IVR times when it was speaking
                # sessions / segments / segmentType == "ivr" (not system) implies voice
                # sessions / segments / segmentStart/End time
                ivr_times = []
                for ivr_entry in ivr_lines:
                    for session in ivr_entry["sessions"]:
                        for segment in session["segments"]:
                            if segment["segmentType"] == "ivr":
                                segment_start, segment_end = convert_times_to_seconds(segment["segmentStart"],
                                                                                      segment["segmentEnd"],
                                                                                      call_start_time)
                                ivr_times.append({"Start": segment_start, "End": segment_end})

                # Now go through each speech segment, and if it STARTS within a start/end point then flag as IVR.
                for segment in pca_results.speech_segments:
                    for ivr in ivr_times:
                        if (ivr["Start"] <= segment.segmentStartTime <= ivr["End"]) and \
                                segment.segmentSpeaker == agent_channel:
                            segment.segmentIVR = True
                            segment.segmentSpeaker = ivr_speaker_channel
                            print(f"IVR found at {ivr['Start']} seconds; duration {segment.segmentEndTime - segment.segmentStartTime} secs.")
                            print(f">>> {segment.segmentText}")

                # TODO We will need to split lines where an IVR statement and following
                # TODO agent statement run together into one line from Transcribe

                # Run through our IVR segments calculate the time that the IVR was speaking
                ivr_speaking_time = 0.0
                for segment in pca_results.speech_segments:
                    if segment.segmentIVR:
                        ivr_speaking_time += segment.segmentEndTime - segment.segmentStartTime

                # Remove that speaking time from the "Agent" speaking total, and add an IVR one
                pca_analytics.speaker_time[ivr_speaker_channel] = {"TotalTimeSecs": ivr_speaking_time}
                new_agent_speaking_time = pca_analytics.speaker_time[agent_channel]["TotalTimeSecs"] - ivr_speaking_time
                pca_analytics.speaker_time[agent_channel] = {"TotalTimeSecs": new_agent_speaking_time}
        else:
            print("Unable find AGENT channel - no Genesys CTR file processing possible")

        # Finished all updates - write results back to our interim location
        pca_results.write_results_to_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])


# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/b27d6650-09e7-41c1-a10a-dc1c77cb5bcd.wav",
        "jobName": "b27d6650-09e7-41c1-a10a-dc1c77cb5bcd.wav",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "interimResultsFile": "interimResults/b27d6650-09e7-41c1-a10a-dc1c77cb5bcd.wav.json",
        "telephony": "genesys"
    }
    lambda_handler(event, "")