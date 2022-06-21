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


class ConversationAnalytics:
    """ Class to hold the header-level analytics information about a call """
    def __init__(self):
        self.conversationLanguageCode = ""
        self.guid = ""
        self.agent = ""
        self.cust = ""
        self.conversationTime = ""
        self.conversationLocation = ""
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
                            "ProcessTime": str(datetime.now()),
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
                               "CompletionTime": str(self.completion_time),
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
            next_segment = {}

            # Pick everything off our structures
            next_segment["SegmentStartTime"] = segment.segmentStartTime
            next_segment["SegmentEndTime"] = segment.segmentEndTime
            next_segment["SegmentSpeaker"] = segment.segmentSpeaker
            next_segment["SegmentInterruption"] = segment.segmentInterruption
            next_segment["OriginalText"] = segment.segmentText
            next_segment["DisplayText"] = segment.segmentText
            next_segment["TextEdited"] = 0
            next_segment["LoudnessScores"] = segment.segmentLoudnessScores
            next_segment["SentimentIsPositive"] = int(segment.segmentIsPositive)
            next_segment["SentimentIsNegative"] = int(segment.segmentIsNegative)
            next_segment["SentimentScore"] = segment.segmentSentimentScore
            next_segment["BaseSentimentScores"] = segment.segmentAllSentiments
            next_segment["EntitiesDetected"] = segment.segmentCustomEntities
            next_segment["CategoriesDetected"] = segment.segmentCategoriesDetectedPre
            next_segment["FollowOnCategories"] = segment.segmentCategoriesDetectedPost
            next_segment["IssuesDetected"] = segment.segmentIssuesDetected
            next_segment["ActionItemsDetected"] = segment.segmentActionItemsDetected
            next_segment["OutcomesDetected"] = segment.segmentOutcomesDetected
            next_segment["WordConfidence"] = segment.segmentConfidence

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
