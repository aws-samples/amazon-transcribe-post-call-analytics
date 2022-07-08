"""
This python function is part of the main processing workflow.  It contains the data structures and functions
required to hold the results of a post-processing run, as well as being responsible for generating the output
JSON that is stored in S3.

- PCAResults - this is the main parent for the constructs, and is responsible for writing out the results
- ConversationAnalytics - holds all of the header-level call and analytical data for the call
- TranscribeJobInfo - holds information about the underlying Transcribe job
- SpeechSegment - single instance of a speech segment, and PCAResults holds an array of these for the call

The output JSON is split into the following high-level structure.

   +--ConversationalAnalytics
   |  |
   |  +--TranscribeJobInfo
   |
   +--SpeechSegment[]

Please refer the output_json_structure.md file for full details on the output schema.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import json
import pcaconfiguration as cf
from datetime import datetime
from pathlib import Path

TMP_DIR = "/tmp/"


class SpeechSegment:
    """ Class to hold information about a single speech segment """
    def __init__(self):
        self.segmentStartTime = 0.0
        self.segmentEndTime = 0.0
        self.segmentSpeaker = ""
        self.segmentText = ""
        self.segmentConfidence = []
        self.segmentSentimentScore = 0.0
        self.segmentPositive = 0.0
        self.segmentNegative = 0.0
        self.segmentIsPositive = False
        self.segmentIsNegative = False
        self.segmentAllSentiments = []
        self.segmentCustomEntities = []
        self.segmentLoudnessScores = []
        self.segmentInterruption = False
        self.segmentIssuesDetected = []
        self.segmentActionItemsDetected = []
        self.segmentOutcomesDetected = []
        self.segmentCategoriesDetectedPre = []
        self.segmentCategoriesDetectedPost = []

        # Not in original version, so may not exist in legacy files
        self.segmentIVR = False


class ConversationAnalytics:
    """ Class to hold the header-level analytics information about a call """
    def __init__(self):
        self.conversationLanguageCode = ""
        self.guid = ""
        self.agent = ""
        self.cust = ""
        self.conversationTime = ""
        self.conversationLocation = ""
        self.processingTime = str(datetime.now())
        self.entity_recognizer = ""
        self.duration = 0.0
        self.sentiment_trends = {}
        self.speaker_labels = []
        self.custom_entities = []
        self.speaker_time = {}
        self.categories_detected = []
        self.combined_graphic_url = ""
        self.issues_detected = []
        self.actions_detected = []
        self.outcomes_detected = []
        self.transcribe_job = TranscribeJobInfo()

    def get_transcribe_job(self):
        """
        Returns a reference to the Transcribe job information structure
        """
        return self.transcribe_job

    def create_json_output(self):
        """
        Generates output JSON for the [ConversationAnalytics] section of the output results document, which
        includes information about the call, speaker labels, sentiment trends and entities.  It also includes
        the orchestration of the [TranscribeJobInfo] block, as that's included in this one's schema
        """

        # Extract the information from our structures and create the output results JSON
        conv_header_info = {"GUID": self.guid,
                            "Agent": self.agent,
                            "Cust": self.cust,
                            "ConversationTime": self.conversationTime,
                            "ConversationLocation": self.conversationLocation,
                            "ProcessTime": self.processingTime,
                            "LanguageCode": self.conversationLanguageCode,
                            "Duration": str(self.duration),
                            "SpeakerLabels": self.speaker_labels,
                            "CustomEntities": self.custom_entities,
                            "EntityRecognizerName": self.entity_recognizer,
                            "SentimentTrends": self.sentiment_trends}

        # If we don't have a set conversation time then copy the [ProcessTime] field
        if self.conversationTime == "":
            conv_header_info["ConversationTime"] = conv_header_info["ProcessTime"]

        # SpeakerTime plus any additional Analytics metadata
        conv_header_info["SpeakerTime"] = self.speaker_time
        if self.transcribe_job.api_mode == cf.API_ANALYTICS:
            # TCA includes categories, issues, actions, outcomes and the large call metadata graphic
            conv_header_info["CategoriesDetected"] = self.categories_detected
            conv_header_info["IssuesDetected"] = self.issues_detected
            conv_header_info["ActionItemsDetected"] = self.actions_detected
            conv_header_info["OutcomesDetected"] = self.outcomes_detected
            conv_header_info["CombinedAnalyticsGraph"] = self.combined_graphic_url

        # Decide which source information block to add - only one for now, so straightforward
        transcribe_job_info = {"TranscribeJobInfo": self.transcribe_job.create_json_output()}
        conv_header_info["SourceInformation"] = [transcribe_job_info]

        return conv_header_info

    def parse_json_input(self, json_input):
        """
        Creates the internal data structures required for the Conversation Analytics data from the supplied
        JSON fragment.

        :param json_input: "ConversationAnalytics" block from a PCA results file
        """
        # Extract the information from our structures and create the output results JSON
        self.guid = json_input["GUID"]
        self.agent = json_input["Agent"]
        self.cust = json_input["Cust"]
        self.conversationTime = json_input["ConversationTime"]
        self.conversationLocation = json_input["ConversationLocation"]
        self.processingTime = json_input["ProcessTime"]
        self.conversationLanguageCode = json_input["LanguageCode"]
        self.duration = float(json_input["Duration"])
        self.speaker_labels = json_input["SpeakerLabels"]
        self.custom_entities = json_input["CustomEntities"]
        self.entity_recognizer = json_input["EntityRecognizerName"]
        self.sentiment_trends = json_input["SentimentTrends"]
        self.conversationTime = json_input["ConversationTime"]
        self.speaker_time = json_input["SpeakerTime"]

        # Load in all analytics data if it exists
        if "CategoriesDetected" in json_input:
            self.categories_detected = json_input["CategoriesDetected"]
            self.issues_detected = json_input["IssuesDetected"]
            self.actions_detected = json_input["ActionItemsDetected"]
            self.outcomes_detected = json_input["OutcomesDetected"]
            self.combined_graphic_url = json_input["CombinedAnalyticsGraph"]

        # # Decide which source information block to add - only one for now, so straightforward
        self.transcribe_job.parse_json_input(json_input["SourceInformation"][0]["TranscribeJobInfo"])


    def extract_analytics_categories(self, categories, speech_segments):
        """
        This will extract and return the header information for detected categories, but it will also inject
        markers into the SpeechSegments to indicate on which line of the transcript a particular category should
        be highlighted in a UI

        @param categories: "Categories" block from the Call Analytics results
        @param speech_segments: Current speech segment list that this function needs to update
        @return: JSON structure for header-level "CategoriesDetected" block
        """

        # Work around each of the matched categories
        timed_categories = {}
        categories_detected = []
        for matched_cat in categories["MatchedCategories"]:

            # Record the name and the instance count, which will be 0 for a "not found" type of category
            next_category = {"Name": matched_cat,
                             "Instances": len(categories["MatchedDetails"][matched_cat]["PointsOfInterest"])}
            timestamp_array = []

            # Map across all of the instance timestamps - if there are no instances, which there won't be
            # for categories that look for when things don't occur, then there can be no in-transcript tag
            for instance in categories["MatchedDetails"][matched_cat]["PointsOfInterest"]:
                # Store the timestamps for the header
                next_poi_time = {"BeginOffsetSecs": float(instance["BeginOffsetMillis"] / 1000),
                                 "EndOffsetSecs": float(instance["EndOffsetMillis"] / 1000)}
                timestamp_array.append(next_poi_time)

                # Keep our time-keyed category list up to date
                if next_poi_time["BeginOffsetSecs"] not in timed_categories:
                    timed_categories[next_poi_time["BeginOffsetSecs"]] = [matched_cat]
                else:
                    timed_categories[next_poi_time["BeginOffsetSecs"]].append(matched_cat)

            # Put it all together
            next_category["Timestamps"] = timestamp_array
            categories_detected.append(next_category)

        # If we had some categories then ensure each segment is tagged with them
        if len(timed_categories) > 0:
            # Go through each speech segment and see if a category fits here
            for segment in speech_segments:
                for cat_time in timed_categories.copy().keys():
                    if cat_time <= segment.segmentStartTime:
                        segment.segmentCategoriesDetectedPre += timed_categories[cat_time]
                        timed_categories.pop(cat_time)

            # If we have any categories left then tag them to the final segment
            for category in timed_categories:
                speech_segments[-1].segmentCategoriesDetectedPost += timed_categories[category]

        # Return the header structure for detected categories
        return categories_detected


class TranscribeJobInfo:
    """ Class to hold the information about an underlying Transcribe job """
    def __init__(self):
        self.api_mode = cf.API_ANALYTICS
        self.completion_time = ""
        self.media_format = ""
        self.media_sample_rate = 8000
        self.media_original_uri = ""
        self.media_playback_uri = ""
        self.cummulative_word_conf = 0.0
        self.custom_vocab_name = ""
        self.vocab_filter_name = ""
        self.vocab_filter_method = ""
        self.transcribe_job_name = ""
        self.channel_identification = 1

    def create_json_output(self):
        """
        Creates the information about the underlying Transcribe job

        @return: JSON structure representing the original Transcribe job
        """

        # Some fields we pick off the basic job info
        transcribe_job_info = {"TranscribeApiType": self.api_mode,
                               "CompletionTime": self.completion_time,
                               "MediaFormat": self.media_format,
                               "MediaSampleRateHertz": self.media_sample_rate,
                               "MediaOriginalUri": self.media_original_uri,
                               "AverageWordConfidence": self.cummulative_word_conf,
                               "MediaFileUri": self.media_playback_uri,
                               "TranscriptionJobName": self.transcribe_job_name,
                               "ChannelIdentification": self.channel_identification}

        # Vocabulary name is optional
        if self.custom_vocab_name != "":
            transcribe_job_info["VocabularyName"] = self.custom_vocab_name

        # Vocabulary filter is optional
        if self.vocab_filter_name != "":
            transcribe_job_info["VocabularyFilter"] = self.vocab_filter_name + " [" + self.vocab_filter_method + "]"

        return transcribe_job_info

    def parse_json_input(self, json_input):
        """
        Creates the internal data structures required for the TranscribeJobInfo data from the supplied
        JSON fragment.

        :param json_input: "TranscribeJobInfo" block from a PCA results file
        """
        # Pick off the standard fields
        self.api_mode = json_input["TranscribeApiType"]
        self.completion_time = json_input["CompletionTime"]
        self.media_format = json_input["MediaFormat"]
        self.media_sample_rate = json_input["MediaSampleRateHertz"]
        self.media_original_uri = json_input["MediaOriginalUri"]
        self.media_playback_uri = json_input["MediaFileUri"]
        self.cummulative_word_conf = float(json_input["AverageWordConfidence"])
        self.transcribe_job_name = json_input["TranscriptionJobName"]
        self.channel_identification = int(json_input["ChannelIdentification"])

        # Some of the following may not be in the JSON
        if "VocabularyName" in json_input:
            self.custom_vocab_name = json_input["VocabularyName"]
        if "VocabularyFilter" in json_input:
            filter_string = json_input["VocabularyFilter"]
            self.vocab_filter_name = filter_string.split(" ")[0]
            self.vocab_filter_method = filter_string.split("[")[-1].split("]")[0]


class PCAResults:
    """ Class to hold the full structure of the PCA Results, along with reader/writer methods """

    # Other markers and helpers
    KNOWN_SPEAKER_PREFIX = "spk_"
    UNKNOWN_SPEAKER_PREFIX = "Unknown_"

    def __init__(self):
        self.speech_segments = []
        self.analytics = ConversationAnalytics()

    def get_speaker_prefix(self, known_speaker):
        """
        Returns the pre-defined speaker prefix, which is used based upon whether the caller is dealing with a
        known or unknown speaker

        :param known_speaker: Flag set to indicate that we want the prefix for a known caller
        :return: Speaker prefix text
        """
        if known_speaker:
            return self.KNOWN_SPEAKER_PREFIX
        else:
            return self.UNKNOWN_SPEAKER_PREFIX

    def get_conv_analytics(self):
        """
        Returns a reference to the Conversational Analytics information structure
        """
        return self.analytics

    def create_output_speech_segments(self):
        """
        Creates a list of speech segments for this conversation
        """
        speech_segments = []

        # Loop through each of our speech segments
        # for segment in self.speechSegmentList:
        for segment in self.speech_segments:
            # Pick everything off our structures
            next_segment = {"SegmentStartTime": segment.segmentStartTime,
                            "SegmentEndTime": segment.segmentEndTime,
                            "SegmentSpeaker": segment.segmentSpeaker,
                            "SegmentInterruption": segment.segmentInterruption,
                            "IVRSegment": segment.segmentIVR,
                            "OriginalText": segment.segmentText,
                            "DisplayText": segment.segmentText,
                            "TextEdited": 0,
                            "LoudnessScores": segment.segmentLoudnessScores,
                            "SentimentIsPositive": int(segment.segmentIsPositive),
                            "SentimentIsNegative": int(segment.segmentIsNegative),
                            "SentimentScore": segment.segmentSentimentScore,
                            "BaseSentimentScores": segment.segmentAllSentiments,
                            "EntitiesDetected": segment.segmentCustomEntities,
                            "CategoriesDetected": segment.segmentCategoriesDetectedPre,
                            "FollowOnCategories": segment.segmentCategoriesDetectedPost,
                            "IssuesDetected": segment.segmentIssuesDetected,
                            "ActionItemsDetected": segment.segmentActionItemsDetected,
                            "OutcomesDetected": segment.segmentOutcomesDetected,
                            "WordConfidence": segment.segmentConfidence}

            # Add what we have to the full list
            speech_segments.append(next_segment)

        return speech_segments

    def write_results_to_s3(self, bucket, object_key):
        """
        Writes out the PCA result data to the specified bucket/key location.

        :param bucket: Bucket where the results are to be uploaded to
        :param object_key: Name of the output file for the results
        :return: JSON results object
        """

        # Generate the JSON output from our internal structures
        json_data = {}
        json_data["ConversationAnalytics"] = self.analytics.create_json_output()
        json_data["SpeechSegments"] = self.create_output_speech_segments()

        # Write out the JSON data to the specified S3 location
        s3_resource = boto3.resource('s3')
        s3_object = s3_resource.Object(bucket, object_key)
        s3_object.put(
            Body=(bytes(json.dumps(json_data).encode('UTF-8')))
        )

        # Return the JSON in case the caller needs it
        return json_data

    def read_results_from_s3(self, bucket, object_key):

        # Download results file from S3
        local_filename = TMP_DIR + object_key.split('/')[-1]
        s3_client = boto3.client('s3')
        s3_client.download_file(bucket, object_key, local_filename)

        # Load data into JSON structure
        json_filepath = Path(local_filename)
        # json_filepath = Path("/Users/andkane/Downloads/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.json")
        json_data = json.load(open(json_filepath.absolute(), "r", encoding="utf-8"))

        # First parse out the main analytics
        self.analytics.parse_json_input(json_data["ConversationAnalytics"])

        # Loop around each defined segment in the JSON, and create a new data structure
        self.speech_segments = []
        for next_segment in json_data["SpeechSegments"]:
            new_segment = SpeechSegment()

            # Standard segment data
            new_segment.segmentStartTime = float(next_segment["SegmentStartTime"])
            new_segment.segmentEndTime = float(next_segment["SegmentEndTime"])
            new_segment.segmentSpeaker = next_segment["SegmentSpeaker"]
            new_segment.segmentInterruption = bool(next_segment["SegmentInterruption"])
            new_segment.segmentText = next_segment["OriginalText"]
            new_segment.segmentLoudnessScores = next_segment["LoudnessScores"]
            new_segment.segmentIsPositive = bool(next_segment["SentimentIsPositive"])
            new_segment.segmentIsNegative = bool(next_segment["SentimentIsNegative"])
            new_segment.segmentSentimentScore = float(next_segment["SentimentScore"])
            new_segment.segmentAllSentiments = next_segment["BaseSentimentScores"]
            new_segment.segmentCustomEntities = next_segment["EntitiesDetected"]
            new_segment.segmentCategoriesDetectedPre = next_segment["CategoriesDetected"]
            new_segment.segmentCategoriesDetectedPost = next_segment["FollowOnCategories"]
            new_segment.segmentIssuesDetected = next_segment["IssuesDetected"]
            new_segment.segmentActionItemsDetected = next_segment["ActionItemsDetected"]
            new_segment.segmentOutcomesDetected = next_segment["OutcomesDetected"]
            new_segment.segmentConfidence = next_segment["WordConfidence"]

            # Additional segment data (not in original version)
            if "IVRSegment" in next_segment:
                new_segment.segmentIVR = bool(next_segment["IVRSegment"])

            # Add what we have to the full list
            self.speech_segments.append(new_segment)
