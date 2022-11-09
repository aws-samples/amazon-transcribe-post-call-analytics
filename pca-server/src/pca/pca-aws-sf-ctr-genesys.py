"""
This python function is part of the main processing workflow.  This performs any specific processing
required to handle Genesys Contact Trace Record files.

1. Copy conversation time
2. Parse IVR speaking times, tag matching PCA speech segments as being IVR segments

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import os
from pathlib import Path
from datetime import datetime
import boto3
import json
import pcaconfiguration as cf
import pcaresults
import copy

# General constants
TMP_DIR = "/tmp/"
OFFLINE_MODE = True

# Channel name constants
IVR_CHANNEL_NAME = "IVR"
NON_TALK_LABEL = "NonTalkTime"
AGENT_CHANNEL_LC_NAME = "agent"
CUST_CHANNEL_LC_NAME = "customer"

# SSM-derived configuration
FILE_SUFFIX_CONVERSATION = ""
FILE_SUFFIX_CALL = ""


def load_ctr_files(original_file):
    """
    Loads the matching CTR file for the specified audio file.  For Genesys the CTR file seems to be named
    the same as the audio file with a "_metadata.json" suffix.  We assume that this metadata file is dropped
    into the same S3 bucket/folder location as the matching audio file.  Additionally, we load in a file with
    the "_call_metadata.json" suffix - this is the call-specific record which doesn't have a fixed Genesys
    filename, but is necessary to identify where in a conversation this call came fits

    :param original_file: Full S3 key for the call audio file
    :return: JSON structures for the Conversation CTR and Call CTR files
    """
    global OFFLINE_MODE

    # Generate filenames for the metadata files
    conv_ctr_filename = original_file + FILE_SUFFIX_CONVERSATION
    conv_ctr_json = []
    call_ctr_filename = original_file + FILE_SUFFIX_CALL
    call_ctr_json = []

    try:
        # First, load in the conversation CTR file
        conv_ctr_json = load_single_ctr_file(conv_ctr_filename)

        # Now do the same for the call-specific CTR file
        try:
            call_ctr_json = load_single_ctr_file(call_ctr_filename)
        except Exception as e:
            # Exception, most likely file doesn't exist
            print(f"Unable to load/parse Genesys call CTR file '{call_ctr_filename}'\n{e}")
            conv_ctr_json = []

    except Exception as e:
        # Exception, most likely file doesn't exist
        print(f"Unable to load/parse Genesys conversation CTR file '{conv_ctr_filename}'\n{e}")

    return conv_ctr_json, call_ctr_json


def load_single_ctr_file(ctr_filename):
    """
    Downloads a CTR file from S3, then loads the JSON data and returns it

    :param ctr_filename: Name of S3 file for this specific CTR file
    :return: JSON data from this file
    """
    global OFFLINE_MODE

    # Check conv file exists
    if not OFFLINE_MODE:
        s3_client = boto3.client("s3")
        response = s3_client.get_object(Bucket=cf.appConfig[cf.CONF_S3BUCKET_INPUT], Key=ctr_filename)

    # Download to a tempfile
    json_filepath = TMP_DIR + ctr_filename.split("/")[-1]
    if not OFFLINE_MODE:
        s3_client.download_file(cf.appConfig[cf.CONF_S3BUCKET_INPUT], ctr_filename, json_filepath)

    # Load in the JSON file for processing
    json_filepath = Path(json_filepath)
    ctr_json = json.load(open(json_filepath.absolute(), "r", encoding="utf-8"))

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
    segment_start = parse_genesys_ctr_datetime(start_time).timestamp() - call_start_time
    segment_end = parse_genesys_ctr_datetime(end_time).timestamp() - call_start_time

    return segment_start, segment_end


def parse_genesys_ctr_datetime(call_time, conv_ctr=True):
    """
    Extracts the timestamp from a Genesys CTR datetime string.  Typically, the expression for this string format
    is "%Y-%m-%dT%H:%M:%S.%fZ", but it has been seen in Genesys CTR files that some entries do not have a microsecond
    component.  Hence, we may have to try several parse options.

    :param call_time: CTR datetime string
    :return: Datetime object representing the CTR datetime string
    """

    # If there's a "+" in the time then go with that format
    if "+" in call_time:
        dt_text = call_time.split("+")[0]
        genesys_call_time = datetime.strptime(dt_text, "%Y-%m-%dT%H:%M:%S.%f")
    else:
        # Otherwise try the standard "Z" style format
        try:
            # Try first with times that have a microsecond part (which is normal)
            genesys_call_time = datetime.strptime(call_time, "%Y-%m-%dT%H:%M:%S.%fZ")
        except ValueError:
            # If that fails then try again without the microsecond (which is unusual, but happens)
            genesys_call_time = datetime.strptime(call_time, "%Y-%m-%dT%H:%M:%SZ").replace(microsecond=1)

    return genesys_call_time


def set_customer_id(speaker_map, conv_ctr_json):
    """
    Finds the customer Participant ID and writes it to the PCA CUST label

    :param speaker_map: PCA speaker mapping
    :param conv_ctr_json: Genesys conversation JSON data
    """
    customer_id = None

    # Pick out the customer ID from the CTR file, and if there
    # was one defined (potentilly not) then update the speaker map
    customer = list(filter(lambda participant: participant["purpose"] == "customer", conv_ctr_json["participants"]))
    if customer:
        customer_id = customer[0]["participantId"]
        customer_lines = list(
            filter(lambda x: x["Speaker"] == get_speaker_channel(speaker_map, CUST_CHANNEL_LC_NAME), speaker_map))
        customer_lines[0]["UserId"] = customer_id

    # Return our customer ID if there was one
    return customer_id

def get_speaker_channel(speaker_map, channel_name):
    """
    Finds the original Transcribe Call Analytics channel from with the speaker map that PCA previously generated.
    Note that this will get overridden with the agent's index number after IVR processing

    :param speaker_map: PCA speaker mapping
    :param channel_name: Name of the channel being sought (e.g. "agent" or "customer"
    :return: Mapping for the AGENT channel
    """
    speaker_channel = None
    speaker_list = list(filter(lambda talker: talker["DisplayText"].lower() == channel_name, speaker_map))
    if len(speaker_list) > 0:
        speaker_channel = speaker_list[0]["Speaker"]
    return speaker_channel


def add_speaker_to_map(pca_analytics, speaker_name, user_id=None, fixed_channel=None):
    """
    Adds a new speaker to the end speaker mapping, such as an IVR or additional agent,
    and allocates them the next number in the "spk_N" sequence.  It also creates a zero-
    valued speaker time, which will get filled in later

    :param pca_analytics: PCA analytics results
    :param speaker_name: Name of new speaker to add
    :param user_id: Telephony user-id for this speaker [optional]
    :param fixed_channel: Sets the channel-id to something fixed [optional]
    :return: New "spk_N" text for this speaker
    ;return: Flag indicating if this speaker was already in the map
    """

    # Use the fixed channel if specified
    if fixed_channel is not None:
        if fixed_channel not in pca_analytics.speaker_labels:
            next_speaker_index = fixed_channel
        else:
            # We already have this channel in the map, so exit quickly
            return fixed_channel, True
    # Work out the index for our next speaker - it should be (but might not be) just maplength+1
    else:
        # Check if this agent user-id already exists, and return that channel if so
        if user_id is not None:
            for speaker in pca_analytics.speaker_labels:
                if "UserId" in speaker:
                    if speaker["UserId"] == user_id:
                        # Yes, we already kow this speaker
                        return speaker["Speaker"], True

        # Don't know who this agent is, so add them
        speaker_index_list = []
        for speaker in pca_analytics.speaker_labels:
            if speaker["Speaker"] != IVR_CHANNEL_NAME:
                speaker_index_list.append(int(speaker["Speaker"].split("_")[-1]))
        next_speaker_index = f"spk_{max(speaker_index_list) + 1}"

    # Create our speaker details, with optional user-id
    speaker_json = {"Speaker": next_speaker_index, "DisplayText": speaker_name}
    if user_id is not None:
        speaker_json["UserId"] = user_id

    # Add them to the speaker map, create a time entry and return the speaker index
    pca_analytics.speaker_labels.append(speaker_json)
    pca_analytics.speaker_time[next_speaker_index] = {"TotalTimeSecs": 0.0}
    return next_speaker_index, False


def split_ivr_speech_segment(segment, ivr_end_time, pca_results):
    """
    Takes an IVR speech segment where we have detected additional transcribed text after
    the IVR had completed its segment.  This method will split the segment into two and
    allocate the correct text to the IVR segment and put any spillover text into the new
    segment for the agent.  It will also transfer metadata to the new agent segment if
    appropriate, and generate a sentiment score for their text.

    :param segment: Speech segment containing both IVR and agent text
    :param ivr_end_time: End time for the IVR's participation in the segment
    :param pca_results: Handle to the overall PCA results so we can manipulate the speech segment results list
    """
    split_index = pca_results.speech_segments.index(segment)
    if split_index > 0:
        # Get the segments to the LHS and RHS of this matched one
        # TODO Sort out when this is the first or last item in the list
        lhs_segments = pca_results.speech_segments[0:split_index]
        rhs_segments = pca_results.speech_segments[split_index+1:]

        # Create a duplicate of our source segment, mark as
        # "Agent" and then work out which words were theirs
        # TODO Actions, Categories, Issues
        agent_segment = copy.deepcopy(segment)
        agent_segment.segmentIVR = False
        agent_segment.segmentInterruption = False
        agent_segment.segmentSpeaker = get_speaker_channel(pca_results.analytics.speaker_labels, AGENT_CHANNEL_LC_NAME)

        # Split the words up correctly for both segments - IVR first
        segment.segmentConfidence = list(filter(lambda x: x["EndTime"] < ivr_end_time, segment.segmentConfidence))
        segment.segmentEndTime = segment.segmentConfidence[-1]["EndTime"]
        segment.segmentText = regenerate_segment_text(segment)

        # Now get the words for the Agent half
        agent_segment.segmentConfidence = list(filter(lambda x: x["StartTime"] > ivr_end_time, agent_segment.segmentConfidence))
        agent_segment.segmentConfidence[0]["Text"] = agent_segment.segmentConfidence[0]["Text"].replace(" ", "")
        agent_segment.segmentStartTime = agent_segment.segmentConfidence[0]["StartTime"]
        agent_segment.segmentText = regenerate_segment_text(agent_segment)

        # Work out which custom entities belong to the agent and the IVR
        ivr_text_len = len(segment.segmentText)
        ivr_entities = []
        agent_entites = []
        for entity in segment.segmentCustomEntities:
            if entity["EndOffset"] > ivr_text_len:
                # Add to agent segment, changing offset
                entity["BeginOffset"] -= ivr_text_len + 1
                entity["EndOffset"] -= ivr_text_len + 1
                agent_entites.append(entity)
            else:
                # Add to IVR segment
                ivr_entities.append(entity)

        # Assign our entity lists back to the correct segments
        # TODO Need to add in a new scaled sentiment score
        segment.segmentCustomEntities = ivr_entities
        agent_segment.segmentCustomEntities = agent_entites

        # Now stitch everything back together again and store it back in our results
        pca_results.speech_segments = lhs_segments
        pca_results.speech_segments.append(segment)
        pca_results.speech_segments.append(agent_segment)
        pca_results.speech_segments.extend(rhs_segments)


def calculate_start_time(call_ctr_json, conv_ctr=True):
    """
    Extracts the data/time information from the supplied CTR file and returns it

    :param call_ctr_json: CTR JSON data specific to this audio file
    :param conv_ctr: Flag to indicate if this file is a Conversation or Call CTR file
    """

    # Pick out the official conversation time from the JSON
    if conv_ctr:
        return str(parse_genesys_ctr_datetime(call_ctr_json["conversationStart"], conv_ctr))
    else:
        return str(parse_genesys_ctr_datetime(call_ctr_json["startTime"], conv_ctr))


def regenerate_segment_text(segment):
    """
    Regenerates the segment's full text field segmentText

    :param segment: Segment to be updated
    :return: Regenerated text
    """
    new_full_text = ""
    for word in segment.segmentConfidence:
        new_full_text = new_full_text + word["Text"]
    return new_full_text


def get_filtered_json_data(json_data, key_term, key_value):
    """
    Returns a filtered list of items in the JSON_DATA block.  It returns any items where entries have
    a specific KEY_TERM with the value KEY_VALUE.  This uses lambdas, and is used  in the code wherever
    something was doing a list(filter(lambda x:))) calculation

    :param json_data: JSON data to search inside
    :param key_term: Key name we're looking for in the section
    :param key_value: Value we're searching for in the section
    :return: List of filtered speech segments
    """
    return list(filter(lambda x: x[key_term] == key_value, json_data))


def extract_ivr_lines(agent_channel, call_start_time, ctr_json, pca_analytics, pca_results):
    """
    This goes through each of our speech segments and compares the timings with the IVR entries
    in the Genesys CTR file.  If a speech assigned to an agent starts within a Genesys IVR window
    then we assign it to a new speaker channel, naming it "Genesys IVR".  We also clear any sentiment
    values, as they no longer make any sense, and calculate the overall IVR speaking time

    :param agent_channel: Speaker channel for our Agent segments
    :param call_start_time: Start time for the call
    :param ctr_json: CTR JSON data for this audio file
    :param pca_analytics: Analytics patt of PCA results
    :param pca_results: Entire PCA results set
    """

    # Extract all the IVR lines - these are those where the
    # "participant" entry has a "purpose" tag is set to "ivr"
    # ivr_lines = get_filtered_json_data(ctr_json["participants"], "purpose", "ivr")
    # acd_lines = get_filtered_json_data(ctr_json["participants"], "purpose", "acd")
    ivr_lines = list(filter(lambda x: x["purpose"] == "ivr", ctr_json["participants"]))
    acd_lines = list(filter(lambda x: x["purpose"] == "acd", ctr_json["participants"]))

    # If we found any IVR lines then update the relevant speech segments
    if ivr_lines or acd_lines:

        # We  need to know what the speaker number should be for the IVR entries
        ivr_speaker_name = cf.appConfig[cf.CONF_TELEPHONY_CTR].capitalize() + " " + IVR_CHANNEL_NAME
        ivr_speaker_channel, known_channel = add_speaker_to_map(pca_results.analytics, ivr_speaker_name,
                                                                fixed_channel=IVR_CHANNEL_NAME)

        # Go through and extract all do the IVR times when it was speaking
        # sessions / segments / segmentType == "ivr" (not system) implies voice
        # sessions / segments / segmentStart/End time
        ivr_times = []
        for ivr_entry in ivr_lines:
            for session in ivr_entry["sessions"]:
                for segment in session["segments"]:
                    if segment["segmentType"] == "ivr":
                        # Work out this IVR entry's start/end time in seconds relative to the start of the call
                        segment_start, segment_end = convert_times_to_seconds(segment["segmentStart"],
                                                                              segment["segmentEnd"],
                                                                              call_start_time)

                        # If it starts BEFORE zero seconds then it's part of the conversation, but NOT this call
                        if segment_start >= 0.00:
                            ivr_times.append({"Start": segment_start, "End": segment_end})

        # We now need to do the same with ACD times - whilst these strictly-speaking aren't IVR entries
        # the caller is still in the automated call distribution system.  The customer has been routed,
        # so are out of the root of the IVR, but it's still an automated voice
        # sessions / segments / segmentType == "interact"
        # sessions / segments / segmentStart/End time
        for acd_entry in acd_lines:
            for session in acd_entry["sessions"]:
                for segment in session["segments"]:
                    if segment["segmentType"] == "interact":
                        # Work out this IVR entry's start/end time in seconds relative to the start of the call
                        segment_start, segment_end = convert_times_to_seconds(segment["segmentStart"],
                                                                              segment["segmentEnd"],
                                                                              call_start_time)

                        # If it starts BEFORE zero seconds then it's part of the conversation, but NOT this call
                        if segment_start >= 0.00:
                            ivr_times.append({"Start": segment_start, "End": segment_end})

        # Now go through each speech segment, and if it STARTS within
        # a start/end point of an agent segment, and its first word ENDS
        # before the end of the IVR tine, then flag as IVR
        segments_to_split = []
        for ivr in ivr_times:
            for segment in pca_results.speech_segments:
                # If this IVR block starts inside the segment, and it doesn't end before the
                # first word in the segment, and it's an agent channel, then we have an IVR overlap
                if (ivr["Start"] <= segment.segmentStartTime <= ivr["End"]) and \
                        (ivr["End"] >= segment.segmentConfidence[0]["EndTime"]) and \
                        (segment.segmentSpeaker == agent_channel):
                    # Mark this segment as an IVR segment
                    segment.segmentIVR = True
                    segment.segmentSpeaker = ivr_speaker_channel

                    # Erase the segment's sentiment
                    segment.segmentIsNegative = False
                    segment.segmentIsPositive = False
                    segment.segmentAllSentiments = {"Positive": 0.0, "Negative": 0.0, "Neutral": 1.0}

                    # If this segment has speech after the IVR has finished then this
                    # will be agent speech, so we need to spit this segment up later
                    if segment.segmentEndTime > ivr["End"]:
                        segments_to_split.append([segment, ivr["End"]])

        # If we found any segments that we need to split then do that now
        for split_segment in segments_to_split:
            split_ivr_speech_segment(split_segment[0], split_segment[1], pca_results)

        # Run through our IVR segments calculate the time that the IVR was speaking, and
        # whilst we're there remove any found entities (as they aren't relevant for BI)
        regenerate_entities = False
        ivr_speaking_time = 0.0
        if ivr_times:
            for segment in pca_results.speech_segments:
                if segment.segmentIVR:
                    # Increment the IVR speaking time by this segment and wipe the entities
                    ivr_speaking_time += segment.segmentEndTime - segment.segmentStartTime
                    segment.segmentCustomEntities = []
                    regenerate_entities = True

        # Remove that speaking time from the "Agent" speaking total, and add an IVR one
        if ivr_speaking_time > 0.0:
            pca_analytics.speaker_time[ivr_speaker_channel] = {"TotalTimeSecs": ivr_speaking_time}
            new_agent_speaking_time = pca_analytics.speaker_time[agent_channel]["TotalTimeSecs"] - ivr_speaking_time
            pca_analytics.speaker_time[agent_channel] = {"TotalTimeSecs": new_agent_speaking_time}
        else:
            # No IVR lines, so we should remove that from the speaker map
            pca_analytics.speaker_time.pop("IVR")
            pca_analytics.speaker_labels.pop()

        # Finally, regenerated our header entity list if we just removed some
        if regenerate_entities:
            pca_results.regenerate_header_entities()


def handle_multiple_agents(agent_channel, call_start_time, ctr_json, pca_results, conv_offset):
    """
    This picks out the various Agent interactions from the Genesys CTR file, walks through our speech
    segments and re-allocates everything after the first agent to a new speaker channel.  We also add in
    the relevant new or updated timings for each of the speakers.

    :param agent_channel: Speaker channel for our Agent segments
    :param call_start_time: Start time for the call
    :param ctr_json: CTR JSON data for this audio file
    :param pca_results: Entire PCA results set
    :param conv_offset: Offset of this call's start time in the wider Genesys conversation
    :return Number of unique agents on the call
    """
    # Extract all the agent speaking lines
    agent_lines = list(filter(lambda x: x["purpose"] == AGENT_CHANNEL_LC_NAME, ctr_json["participants"]))
    agent_index = 0

    # Extract the timings for each agent speech segment, tracking the agent-id
    if agent_lines:
        agent_slots = []
        call_timings = {}

        # Get the timings for each agent's speech segment
        # sessions / segments / segmentType == "interact" implies agent voice
        # sessions / segments / segmentStart/End time
        # userId => system id for user
        for agent in agent_lines:
            # Update our agent index tracker and add this to the
            agent_index += 1
            agent_name = f"Agent {agent_index}"
            agent_userid = agent["userId"]

            # Ensure this agent is properly represented in the speaker map
            if agent_index == 1:
                # First agent is easy - it maps directly to the audio file's speaker channel
                agent_speaker = get_speaker_channel(pca_results.analytics.speaker_labels, AGENT_CHANNEL_LC_NAME)
                agent_lines = list(
                    filter(lambda x: x["Speaker"] == agent_speaker, pca_results.analytics.speaker_labels))
                agent_lines[0]["DisplayText"] = agent_name
                agent_lines[0]["UserId"] = agent_userid
            else:
                agent_speaker, known_channel = add_speaker_to_map(pca_results.analytics, agent_name, agent_userid)
                if known_channel:
                    # This agent was already known, so roll back our agent counter
                    agent_index -= 1

            # We need to sum their individual speaking times later, so start tracking at zero
            call_timings[agent_speaker] = 0.0

            # Work through this agent's sessions/segments - there could be multiple,
            # and we need to ignore any session that doesn't have mediatype=voice
            for session in agent["sessions"]:
                if session["mediaType"] == "voice":
                    for segment in session["segments"]:
                        if segment["segmentType"] == "interact":
                            # Start with the basic agent information
                            next_agent = {"SpeakerID": agent_speaker}

                            # Work out our start / end times for speaking
                            agent_start, agent_end = convert_times_to_seconds(segment["segmentStart"],
                                                                              segment["segmentEnd"],
                                                                              call_start_time)

                            # Record the speaking timestamps and add this one to our list
                            next_agent["Start"] = agent_start
                            next_agent["End"] = agent_end
                            agent_slots.append(next_agent)

        # Now work through the speech segments and re-tag any segments with the correct speaker tag
        for segment in pca_results.speech_segments:
            for agent in agent_slots:
                if (agent["Start"] <= segment.segmentStartTime <= agent["End"]) and \
                        segment.segmentSpeaker == agent_channel:
                    # Mark this segment as being from this agent
                    segment.segmentSpeaker = agent["SpeakerID"]

                    # Update the speaking time for this agent
                    call_timings[agent["SpeakerID"]] += (segment.segmentEndTime - segment.segmentStartTime)

        # Write in our updated speaker timings
        for timing in call_timings:
            pca_results.analytics.speaker_time[timing]["TotalTimeSecs"] = call_timings[timing]

        # Return the number of distinct agents that we found
        return agent_index


def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """
    global OFFLINE_MODE
    global FILE_SUFFIX_CONVERSATION
    global FILE_SUFFIX_CALL

    # Setup some offline data
    OFFLINE_MODE = "offline" in event
    if OFFLINE_MODE:
        cf.appConfig[cf.CONF_FILENAME_DATETIME_REGEX] = "(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}).(\d{2})"
        cf.appConfig[cf.CONF_FILENAME_DATETIME_FIELDMAP] = "%Y %m %d %H %M %S %f"
        cf.appConfig[cf.CONF_TELEPHONY_CTR] = "genesys"
        cf.appConfig[cf.CONF_S3BUCKET_OUTPUT] = "ak-cci-output"
        cf.appConfig[cf.CONF_SPEAKER_NAMES] = ["Customer", "Agent"]
        cf.appConfig[cf.CONF_TELEPHONY_CTR_SUFFIX] = ["_metadata.json", "_call_metadata.json"]

    # Load our configuration data
    if not OFFLINE_MODE:
        cf.loadConfiguration()

    # Extract out the call suffix filenames, which may or may not exist
    suffixes = cf.appConfig[cf.CONF_TELEPHONY_CTR_SUFFIX]
    if len(suffixes) > 0:
        FILE_SUFFIX_CONVERSATION = cf.appConfig[cf.CONF_TELEPHONY_CTR_SUFFIX][0]
        if len(suffixes) > 1:
            FILE_SUFFIX_CALL = cf.appConfig[cf.CONF_TELEPHONY_CTR_SUFFIX][1]

    # Load in any associated CTR files
    conv_ctr_json, call_ctr_json = load_ctr_files(event["key"])

    # Only continue if we managed to load matching CTR files
    if conv_ctr_json:
        # Load in our existing interim CCA results
        pca_results = pcaresults.PCAResults()
        pca_analytics = pca_results.get_conv_analytics()
        pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"],
                                         offline=OFFLINE_MODE)

        # Pick out the official call start time from the call metadata, and get the timestamp too.
        # Then get the call start time for the conversation as a whole
        pca_analytics.conversationTime = calculate_start_time(call_ctr_json, conv_ctr=False)
        call_start_time = datetime.strptime(pca_analytics.conversationTime, "%Y-%m-%d %H:%M:%S.%f").timestamp()
        conv_start_time = datetime.strptime(calculate_start_time(conv_ctr_json), "%Y-%m-%d %H:%M:%S.%f").timestamp()
        conv_stat_time_offset = call_start_time - conv_start_time

        # Get the speaker channel for the AGENT, as that's where the IVR will be
        # If we can't find the agent channel then we can't do much more here
        agent_channel = get_speaker_channel(pca_results.analytics.speaker_labels, AGENT_CHANNEL_LC_NAME)
        if agent_channel in pca_analytics.sentiment_trends:

            # We need to override the display name for Agent sentiment, as it will show the name of the agent
            # assigned to the agent channel, and we may have multiple agents.  Hence, override it.
            # pca_analytics.sentiment_trends[agent_channel]["NameOverride"] = pca_analytics.speaker_labels
            channel_index = int(agent_channel.split("_")[1])
            pca_analytics.sentiment_trends[agent_channel]["NameOverride"] = \
                cf.appConfig[cf.CONF_SPEAKER_NAMES][channel_index]

            # Extract all the IVR lines and update the segments
            extract_ivr_lines(agent_channel, call_start_time, conv_ctr_json, pca_analytics, pca_results)

            # Split up our single agent tag to multiple tags if there is more than one agent on the call
            unique_agents = handle_multiple_agents(agent_channel, call_start_time, conv_ctr_json, pca_results,
                                                   conv_stat_time_offset)

            # Now that we potentially have multiple agents we should update the result header's
            # AGENTID field to show the agent that had the most interactions on the call
            if unique_agents > 0:
                # Create a list of speaker identifiers that are not Agent channels
                filtered_speakers = [IVR_CHANNEL_NAME, NON_TALK_LABEL,
                                     get_speaker_channel(pca_analytics.speaker_labels, CUST_CHANNEL_LC_NAME)]

                # Create a filtered list of speakers that are just Agents, then sort by speaking time
                filtered_speaker_time = dict(filter(lambda x: (x[0] not in filtered_speakers),
                                                    pca_analytics.speaker_time.items()))
                sorted_speakers = list(sorted(filtered_speaker_time.items(), key=lambda item: item[1]["TotalTimeSecs"],
                                              reverse=True))

                # Now loop through our speakers and add their display names to the AGENTS list field
                for speaker in filtered_speaker_time:
                    speaker_details = list(filter(lambda x: (x["Speaker"] == speaker), pca_analytics.speaker_labels))
                    if speaker_details:
                        pca_analytics.agent_list.append(speaker_details[0]["DisplayText"])

                        # If this speaker was also the top-talker then put them in the AGENT field
                        if speaker_details[0]["Speaker"] == sorted_speakers[0][0]:
                            pca_analytics.agent = speaker_details[0]["DisplayText"]

            # TODO Recalculate the various sentiment trends to cater for IVR and split segments

            # Finally, write some of the CTR data back into the main results - note
            # that some comes from the call metatdata file, some from the conversation
            telephony = {"conversationStart": conv_ctr_json["conversationStart"],
                         "originatingDirection": conv_ctr_json["originatingDirection"]}

            # We may not hava a call-specific file, and some of this info comes from that file
            # TODO Some of the call-file values could be inferred from the conversation file
            if call_ctr_json:
                telephony["id"] = call_ctr_json["id"]
                telephony["conversationId"] = call_ctr_json["conversationId"]
                telephony["startTime"] = call_ctr_json["startTime"]
                telephony["endTime"] = call_ctr_json["endTime"]

            # Extract unique queueId values
            queue_ids = []
            for participant in conv_ctr_json["participants"]:
                for session in participant["sessions"]:
                    # TODO Could pick out ani and dnis values here
                    for segment in session["segments"]:
                        if "queueId" in segment:
                            if segment["queueId"] not in queue_ids:
                                queue_ids.append(segment["queueId"])
            telephony["queueIds"] = queue_ids

            # Write this all into the Analytics header
            pca_analytics.telephony = {
                "Genesys": telephony
            }

        else:
            print("No AGENT channel defined or present in transcription output")

        # Now ensure that the Customer ID is set if it is defined in the CTR
        customer_id = set_customer_id(pca_analytics.speaker_labels, conv_ctr_json)
        if customer_id:
            pca_analytics.cust = customer_id

        # Finished all updates - write results back to our interim location
        if not OFFLINE_MODE:
            pca_results.write_results_to_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])

    # Return our original event data for the next step
    return event


# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/fd4bd0f6-52c2-4fab-97de-8f7518474403.wav",
        "jobName": "fd4bd0f6-52c2-4fab-97de-8f7518474403.wav",
        "interimResultsFile": "interimResults/fd4bd0f6-52c2-4fab-97de-8f7518474403.wav.json",
        # "key": "originalAudio/fef9f532-08e~0-436c-b0cc-7df991521e96.wav",
        # "jobName": "fef9f532-08e0-436c-b0cc-7df991521e96.wav",
        # "interimResultsFile": "interimResults/fef9f532-08e0-436c-b0cc-7df991521e96.wav.json",
        # "key": "originalAudio/006c7659-258e-4adc-a036-df717505e25a.wav",
        # "jobName": "006c7659-258e-4adc-a036-df717505e25a.wav",
        # "interimResultsFile": "interimResults/006c7659-258e-4adc-a036-df717505e25a.wav.json",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "telephony": "genesys"
    }

    # If we're not offline then copy our copy of the interim results file
    if "offline" not in event:
        s3_resource = boto3.resource("s3")
        src_key = "interimResults/copy-" + event["interimResultsFile"].split("/")[-1]
        copy_source = {
            'Bucket': "ak-cci-output",
            'Key': src_key
        }
        s3_resource.meta.client.copy(copy_source, "ak-cci-output", event["interimResultsFile"])
    # But if we are offline then copy the copy that we have in /tmp
    else:
        command = "cp /tmp/copy-" + event["interimResultsFile"].split("/")[-1] + " /tmp/" + event["interimResultsFile"].split("/")[-1]
        os.popen(command)

    lambda_handler(event, "")