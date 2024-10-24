"""
This python function is part of the main processing workflow.  Parses the output from an Amazon Transcribe job into
turn-by-turn speech segments with sentiment analysis scores from Amazon Comprehend

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse
from math import floor
from pcakendrasearch import prepare_transcript, put_kendra_document
from pcaresults import SpeechSegment, PCAResults
import pcaconfiguration as cf
import pcacommon
import subprocess
import copy
import re
import json
import csv
import boto3
import time

# Sentiment helpers
MIN_SENTIMENT_LENGTH = 8
NLP_THROTTLE_RETRIES = 1
COMPREHEND_SENTIMENT_SCALER = 5.0

# Other Markers and helpers
PII_PLACEHOLDER = "[PII]"
PII_PLACEHOLDER_MASK = "*" * len(PII_PLACEHOLDER)
TMP_DIR = "/tmp"
BAR_CHART_WIDTH = 1.0


class TranscribeParser:

    def __init__(self, min_sentiment_pos, min_sentiment_neg, custom_entity_endpoint):
        self.pca_results = PCAResults()
        self.analytics = self.pca_results.get_conv_analytics()
        self.transcribe_job_info = self.analytics.get_transcribe_job()
        self.speechSegmentList = []
        self.min_sentiment_positive = min_sentiment_pos
        self.min_sentiment_negative = min_sentiment_neg
        self.comprehendLanguageCode = ""
        self.headerEntityDict = {}
        self.numWordsParsed = 0
        self.cummulativeWordAccuracy = 0.0
        self.maxSpeakerIndex = 0
        self.customEntityEndpointName = custom_entity_endpoint
        self.customEntityEndpointARN = ""
        self.simpleEntityMap = {}
        self.matchedSimpleEntities = {}
        self.audioPlaybackUri = ""
        self.transcript_uri = ""
        self.api_mode = cf.API_STANDARD
        self.analytics_channel_map = {}
        self.asr_output = ""

        cf.loadConfiguration()

        # Check the model exists - if now we may use simple file entity detection instead
        if self.customEntityEndpointName != "":
            # Get the ARN for our classifier endpoint, getting out quickly if there
            # isn't one defined or if we can't find the one that is defined
            comprehendClient = boto3.client("comprehend")
            recognizerList = comprehendClient.list_endpoints()
            recognizer = list(filter(lambda x: x["EndpointArn"].endswith(self.customEntityEndpointName),
                                     recognizerList["EndpointPropertiesList"]))

            # Only use it if it exists (!) and is IN_SERVICE
            if (recognizer == []) or (recognizer[0]["Status"] != "IN_SERVICE"):
                # Doesn't exist, so ignore the config
                self.customEntityEndpointName = ""
            else:
                self.customEntityEndpointARN = recognizer[0]["EndpointArn"]

        # Set flag to say if we could do simple entities
        self.simpleEntityMatchingUsed = (self.customEntityEndpointARN == "") and \
                                        (cf.appConfig[cf.CONF_ENTITY_FILE] != "")

    def process_tca_summary(self):
        if self.api_mode == cf.API_ANALYTICS and \
           self.asr_output["ConversationCharacteristics"] and \
           "ContactSummary" in self.asr_output["ConversationCharacteristics"]:
            self.analytics.contact_summary = self.asr_output["ConversationCharacteristics"]["ContactSummary"]

    def generate_sentiment_trend(self, speaker, speaker_num):
        """
        Generates an entry for the "SentimentTrends" block for the given speaker, which is the overall speaker
        sentiment score and trend over the call.  For Call Analytics calls we also store the per-quarter sentiment
        data provided by Transcribe

        @param speaker: Internal name for the speaker (e.g. spk_1)
        @param speaker_num: Channel number for the speaker (only relevant for Call Analytics)
        @return:
        """

        # Our empty result block
        speaker_trend = {}

        if self.api_mode == cf.API_ANALYTICS:
            # Speaker scores / trends using Analytics data - find our speaker data
            speaker = next(key for key, value in self.analytics_channel_map.items() if value == speaker_num)
            sentiment_block = self.asr_output["ConversationCharacteristics"]["Sentiment"]
            speaker_trend["SentimentPerQuarter"] = []

            # Store the overall score, then loop through each of the quarter's sentiment
            if speaker in sentiment_block["OverallSentiment"]:
                # We have some data for this speaker channel
                speaker_trend["SentimentScore"] = sentiment_block["OverallSentiment"][speaker]
                for period in sentiment_block["SentimentByPeriod"]["QUARTER"][speaker]:
                    speaker_trend["SentimentPerQuarter"].append(
                        {"Quarter": len(speaker_trend["SentimentPerQuarter"])+1,
                         "Score": period["Score"],
                         "BeginOffsetSecs": period["BeginOffsetMillis"]/1000.0,
                         "EndOffsetSecs": period["EndOffsetMillis"]/1000.0}
                    )

                # Trend is simply FINAL-FIRST sentiment
                speaker_trend["SentimentChange"] = speaker_trend["SentimentPerQuarter"][-1]["Score"] - \
                                                   speaker_trend["SentimentPerQuarter"][0]["Score"]
            else:
                # This speaker track has no speed data, so we need to create a zero-sentiment block
                speaker_trend["SentimentScore"] = 0.0
                speaker_trend["SentimentChange"] = 0.0

                # Initialise data for the per-quarter scores
                quarter_duration = self.analytics.duration / 4.0
                quarter_scores = []
                for quarter in range(1, 5):
                    quarter_block = {
                        "Quarter": quarter,
                        "Score": 0.0,
                        "BeginOffsetSecs": quarter_duration * (quarter - 1),
                        "EndOffsetSecs": quarter_duration * quarter,
                        "datapoints": 0
                    }
                    quarter_scores.append(quarter_block)
                speaker_trend["SentimentPerQuarter"] = quarter_scores
        else:
            # Speaker scores / trends using aggregated data from Comprehend
            # Start by initialising data structures for the sentiment total and change
            speakerTurns = 0
            sumSentiment = 0.0

            # Initialise data for the per-quarter scores
            quarter_scores = []
            for quarter in range(1,5):
                quarter_block = {
                    "Quarter": quarter,
                    "Score": 0.0,
                    "BeginOffsetSecs": 0.0,
                    "EndOffsetSecs": 0.0,
                    "datapoints": 0
                }
                quarter_scores.append(quarter_block)
            speaker_trend["SentimentPerQuarter"] = quarter_scores

            # Loop through each speech segment for this speaker
            for segment in self.speechSegmentList:
                if segment.segmentSpeaker == speaker:
                    # Increment our counter for number of speaker turns and work out our call quarter offset,
                    # and we decide which quarter a segment is in by where middle of the segment lies
                    speakerTurns += 1
                    segment_midpoint = segment.segmentStartTime + \
                                       (segment.segmentEndTime - segment.segmentStartTime) / 2
                    quarter_offset = min(floor((segment_midpoint * 4) / self.analytics.duration), 3)

                    # Update some quarter-based values that are separate from sentiment
                    quarter_scores[quarter_offset]["datapoints"] += 1
                    if quarter_scores[quarter_offset]["BeginOffsetSecs"] == 0.0:
                        quarter_scores[quarter_offset]["BeginOffsetSecs"] = segment.segmentStartTime
                    quarter_scores[quarter_offset]["EndOffsetSecs"] = segment.segmentEndTime

                    # Only really interested in Positive/Negative turns for the sentiment scores
                    if segment.segmentIsPositive or segment.segmentIsNegative:
                        # Calculate score and add it to (-ve) or subtract it from (-ve) our total
                        turn_score = segment.segmentSentimentScore
                        if segment.segmentIsNegative:
                            turn_score *= -1
                        sumSentiment += turn_score

                        # Update our quarter tracker
                        quarter_scores[quarter_offset]["Score"] += turn_score

            # Create the average score per quarter, and drop the datapoints field (as it's o longer needed)
            for quarter in quarter_scores:
                points = max(quarter["datapoints"], 1)
                quarter["Score"] /= points
                quarter.pop("datapoints", None)

            # Log our trends for this speaker
            speaker_trend["SentimentChange"] = quarter_scores[-1]["Score"] - quarter_scores[0]["Score"]
            speaker_trend["SentimentScore"] = sumSentiment / max(speakerTurns, 1)
            speaker_trend["SentimentPerQuarter"] = quarter_scores

        return speaker_trend

    def push_turn_by_turn_results(self):
        '''
        Pushes the rest of our calculated data items into the PCA Results structures.  Some
        of these are updated directly in the code, but some need explicit calculations. We just
        upload the speech segment list as-is, then do the other constructs one by one
        '''
        resultsHeaderInfo = {}

        # Ensure our results have the speech segments recorded
        self.pca_results.speech_segments = self.speechSegmentList

        # Sentiment Trends
        for speaker in range(self.maxSpeakerIndex + 1):
            full_name = self.pca_results.get_speaker_prefix(True) + str(speaker)
            self.analytics.sentiment_trends[full_name] = self.generate_sentiment_trend(full_name, speaker)

        # Build up a list of speaker labels from the config; note that if we have more speakers
        # than configured then we still return something (clear first, as we're appending)
        self.analytics.speaker_labels = []
        if self.api_mode == cf.API_STANDARD:
            # Standard Transcribe - look them up in the order in the config
            for speaker in range(self.maxSpeakerIndex + 1):
                next_label = {"Speaker": self.pca_results.get_speaker_prefix(True) + str(speaker)}
                try:
                    next_label["DisplayText"] = cf.appConfig[cf.CONF_SPEAKER_NAMES][speaker]
                except:
                    next_label["DisplayText"] = self.pca_results.get_speaker_prefix(False) + str(speaker)
                self.analytics.speaker_labels.append(next_label)
        elif self.api_mode == cf.API_ANALYTICS:
            # Analytics is more prescriptive - they're defined in the call results
            for speaker in self.analytics_channel_map:
                next_label = {"Speaker": self.pca_results.get_speaker_prefix(True) + str(
                    self.analytics_channel_map[speaker]), "DisplayText": speaker.title()}
                self.analytics.speaker_labels.append(next_label)

        # Analytics mode additional metadata
        if self.api_mode == cf.API_ANALYTICS:
            # Speaker and non-talk time
            self.analytics.speaker_time = self.extract_analytics_speaker_time(self.asr_output["ConversationCharacteristics"])
            self.analytics.categories_detected = self.analytics.extract_analytics_categories(self.asr_output["Categories"], self.speechSegmentList)
        # For non-analytics mode, we can simulate some analytics data
        elif self.api_mode == cf.API_STANDARD:
            # Calculate the speaker time from the speech segments, once per speaker (can't do silent time like this)
            speaker_time = {}
            for next_speaker in self.analytics.speaker_labels:
                next_speaker_label = next_speaker["Speaker"]
                next_speaker_time = sum(
                    (segment.segmentEndTime - segment.segmentStartTime) for segment in self.speechSegmentList if
                    segment.segmentSpeaker == next_speaker_label)
                speaker_time[next_speaker_label] = {"TotalTimeSecs": float(next_speaker_time)}
            self.analytics.speaker_time = speaker_time

        # Detected custom entity summaries next (clear first, as we're appending)
        self.analytics.custom_entities = []
        for entity in self.headerEntityDict:
            nextEntity = {"Name": entity,
                          "Instances": len(self.headerEntityDict[entity]),
                          "Values": self.headerEntityDict[entity]}
            self.analytics.custom_entities.append(nextEntity)

        # Add on any file-based entity used
        if self.simpleEntityMatchingUsed:
            self.analytics.entity_recognizer = cf.appConfig[cf.CONF_ENTITY_FILE]
        elif self.customEntityEndpointName != "":
            self.analytics.entity_recognizer = self.customEntityEndpointName

        # Some transcribe Job Info data may need to be updated
        transcribe_info = self.analytics.get_transcribe_job()

        # Update the job info with our average confidence score
        transcribe_info.cummulative_word_conf = self.cummulativeWordAccuracy / max(float(self.numWordsParsed), 1.0)

        # Did we create an MP3 output file?  If so then use it for playback rather than the original
        if self.audioPlaybackUri != "":
            transcribe_info.media_playback_uri = self.audioPlaybackUri
        else:
            transcribe_info.media_playback_uri = transcribe_info.media_original_uri

    def merge_speaker_segments(self, inputSegmentList):
        """
        Merges together two adjacent speaker segments if (a) the speaker is
        the same, and (b) if the gap between them is less than 3 seconds
        """
        outputSegmentList = []
        lastSpeaker = ""
        lastSegment = None

        # Step through each of our defined speaker segments
        for segment in inputSegmentList:
            if (segment.segmentSpeaker != lastSpeaker) or ((segment.segmentStartTime - lastSegment.segmentEndTime) >= 3.0):
                # Simple case - speaker change or > 3.0 second gap means new output segment
                outputSegmentList.append(segment)

                # This is now our base segment moving forward
                lastSpeaker = segment.segmentSpeaker
                lastSegment = segment
            else:
                # Same speaker, short time, need to copy this info to the last one
                lastSegment.segmentEndTime = segment.segmentEndTime
                lastSegment.segmentText += " " + segment.segmentText
                segment.segmentConfidence[0]["Text"] = " " + segment.segmentConfidence[0]["Text"]
                for wordConfidence in segment.segmentConfidence:
                    lastSegment.segmentConfidence.append(wordConfidence)

        return outputSegmentList

    def update_header_entity_count(self, entityType, entityValue):
        """
        Updates the header-level entity structure with the given tuple, but duplicates are not added
        """
        # Ensure we have an entry in our collection for this key
        if entityType not in self.headerEntityDict:
            self.headerEntityDict[entityType] = []

        # If we don't already have this tuple then add it to the header
        keyDetails = self.headerEntityDict[entityType]
        if not entityValue in keyDetails:
            keyDetails.append(entityValue)
            self.headerEntityDict[entityType] = keyDetails

    def extract_entities_from_line(self, entity_line, speech_segment, type_filter):
        """
        Takes a speech segment and an entity line from Comprehend - standard or custom models - and
        if the entity type is in our input type filter (or is blank) then add it to the transcript
        """
        if float(entity_line['Score']) >= cf.appConfig[cf.CONF_ENTITYCONF]:
            entityType = entity_line['Type']

            # If we have a type filter then ensure we match it before adding the entry
            if (type_filter == []) or (entityType in type_filter):

                # Update our header entry
                self.update_header_entity_count(entityType, entity_line["Text"])

                # Now do the same with the SpeechSegment, but append the full details
                speech_segment.segmentCustomEntities.append(entity_line)

    def set_comprehend_language_code(self):
        """
        Based upon the language defined by the input stream set the best-match language code for Comprehend to use
        for this conversation.  It is "best-match" as Comprehend can model in EN, but has no differentiation between
        EN-US and EN-GB.  If we cannot determine a language to use then we cannot use Comprehend standard models
        """

        try:
            for checkLangCode in cf.appConfig[cf.CONF_COMP_LANGS]:
                if self.analytics.conversationLanguageCode.startswith(checkLangCode):
                    self.comprehendLanguageCode = checkLangCode
                    break
        except:
            # If anything fails - e.g. no language  string - then we have no language for Comprehend
            self.comprehendLanguageCode = ""

    def comprehend_single_sentiment(self, text, client):
        """
        Perform sentiment analysis, but try and avert throttling by trying one more time if this exceptions.
        It is not a replacement for limit increases, but will help limit failures if usage suddenly grows
        """
        sentimentResponse = {}
        counter = 0
        while sentimentResponse == {}:
            try:
                # Get the sentiment, and strip off the MIXED response (as we won't be using it)
                sentimentResponse = client.detect_sentiment(Text=text, LanguageCode=self.comprehendLanguageCode)
                sentimentResponse["SentimentScore"].pop("Mixed", None)

                # Now scale our remaining values
                for sentiment_key in sentimentResponse["SentimentScore"]:
                    sentimentResponse["SentimentScore"][sentiment_key] *= COMPREHEND_SENTIMENT_SCALER
            except Exception as e:
                if counter < NLP_THROTTLE_RETRIES:
                    counter += 1
                    time.sleep(3)
                else:
                    raise e

        return sentimentResponse

    def comprehend_single_entity(self, text, client):
        """
        Perform entity analysis, but try and avert throttling by trying one more time if this exceptions.
        It is not a replacement for limit increases, but will help limit failures if usage suddenly grows
        """
        entityResponse = {}
        counter = 0
        while entityResponse == {}:
            try:
                entityResponse = client.detect_entities(Text=text, LanguageCode=self.comprehendLanguageCode)
            except Exception as e:
                if counter < NLP_THROTTLE_RETRIES:
                    counter += 1
                    time.sleep(3)
                else:
                    raise e

        return entityResponse

    def extract_analytics_speaker_time(self, conv_characteristics):
        """
        Generates information on the speaking time in the call analytics results.  It creates the following information:
        - Number of seconds spoken by each speaker
        - Number of second of non-talk time
        - A list of instances of non-talk time in the call

        @param conv_characteristics: "ConversationCharacteristics" block from the Call Analytics results
        @return: JSON structure for the "SpeakerTime" construct
        """
        speaker_time = {}

        # Extract the talk-time per participant, setting it to 0 is they are missing
        for speaker in self.analytics_channel_map:
            if speaker in conv_characteristics["TalkTime"]["DetailsByParticipant"]:
                speaker_talk_time = conv_characteristics["TalkTime"]["DetailsByParticipant"][speaker]["TotalTimeMillis"]
            else:
                speaker_talk_time = 0
            speaker_tag = self.pca_results.get_speaker_prefix(True) + str(self.analytics_channel_map[speaker])
            speaker_time[speaker_tag] = {"TotalTimeSecs":  float(speaker_talk_time / 1000)}

        # Extra the quiet-time instances and also generate the total quiet time value
        non_talk_list = conv_characteristics["NonTalkTime"]["Instances"]
        non_talk_instances = []
        quiet_time = 0
        for quiet in non_talk_list:
            # Update our total time, and add this instance to our list
            quiet_time += quiet["DurationMillis"]
            next_instance = {"BeginOffsetSecs": float(quiet["BeginOffsetMillis"] / 1000),
                             "EndOffsetSecs": float(quiet["EndOffsetMillis"] / 1000),
                             "DurationSecs": float(quiet["DurationMillis"] / 1000)}
            non_talk_instances.append(next_instance)

        # Insert the non-talk time metrics into our results
        speaker_time["NonTalkTime"] = {"Instances": non_talk_instances}
        speaker_time["NonTalkTime"]["TotalTimeSecs"] = float(quiet_time / 1000)

        return speaker_time

    def extract_nlp(self, segment_list):
        """
        Generates sentiment per speech segment, inserting the results into the input list.
        If we had no valid language for Comprehend to use then we use Neutral for everything.
        It also extracts standard LOCATION entities, and calls any custom entity recognition
        model that has been configured for that language
        """
        client = boto3.client("comprehend")

        lambda_client = boto3.client('lambda')

        # Setup some sentiment blocks - used when we have no Comprehend
        # language or where we need "something" for Call Analytics
        sentiment_set_neutral = {'Positive': 0.0, 'Negative': 0.0, 'Neutral': 1.0}
        sentiment_set_positive = {'Positive': 1.0, 'Negative': 0.0, 'Neutral': 0.0}
        sentiment_set_negative = {'Positive': 0.0, 'Negative': 1.0, 'Neutral': 0.0}

        # Go through each of our segments
        for next_segment in segment_list:

            # invoke a custom (named) lambda function using boto3, to process the text and return new text 
            response = lambda_client.invoke(
                FunctionName='redactPIIHungarian',
                InvocationType='RequestResponse',
                Payload=json.dumps({'original': next_segment.segmentText})
            )
            payload = json.loads(response['Payload'].read().decode("utf-8"))
            print("payload: ", payload)
            next_segment.segmentText = payload["redacted"]

            if len(next_segment.segmentText) >= MIN_SENTIMENT_LENGTH:
                nextText = next_segment.segmentText

                # First, set the sentiment scores in the transcript.  In Call Analytics mode
                # we already have a sentiment marker (+ve/-ve) per turn of the transcript
                if self.api_mode == cf.API_ANALYTICS:
                    # Just set some fake scores against the line to match the sentiment type
                    if next_segment.segmentIsPositive:
                        next_segment.segmentAllSentiments = sentiment_set_positive
                    elif next_segment.segmentIsNegative:
                        next_segment.segmentAllSentiments = sentiment_set_negative
                    else:
                        next_segment.segmentAllSentiments = sentiment_set_neutral
                # Standard Transcribe requires us to use Comprehend
                else:
                    # We can only use Comprehend if we have a language code
                    if self.comprehendLanguageCode == "":
                        # We had no language - use default neutral sentiment scores
                        next_segment.segmentAllSentiments = sentiment_set_neutral
                        next_segment.segmentIsPositive = False
                        next_segment.segmentIsNegative = False
                    else:
                        # For Standard Transcribe we need to set the sentiment marker based on score thresholds
                        sentimentResponse = self.comprehend_single_sentiment(nextText, client)
                        positiveBase = sentimentResponse["SentimentScore"]["Positive"]
                        negativeBase = sentimentResponse["SentimentScore"]["Negative"]

                        # If we're over the NEGATIVE threshold then we're negative
                        if negativeBase >= self.min_sentiment_negative:
                            next_segment.segmentSentiment = "Negative"
                            next_segment.segmentIsNegative = True
                            next_segment.segmentSentimentScore = negativeBase
                        # Else if we're over the POSITIVE threshold then we're positive,
                        # otherwise we're NEUTRAL and we don't really care
                        elif positiveBase >= self.min_sentiment_positive:
                            next_segment.segmentSentiment = "Positive"
                            next_segment.segmentIsPositive = True
                            next_segment.segmentSentimentScore = positiveBase

                        # Store all of the original sentiments for future use
                        next_segment.segmentAllSentiments = sentimentResponse["SentimentScore"]
                        next_segment.segmentPositive = positiveBase
                        next_segment.segmentNegative = negativeBase

                # If we have a language model then extract entities via Comprehend,
                # and the same methodology is used for all of the Transcribe modes
                if self.comprehendLanguageCode != "":
                    # Get sentiment and standard entity detection from Comprehend
                    pii_masked_text = nextText.replace(PII_PLACEHOLDER, PII_PLACEHOLDER_MASK)
                    entity_response = self.comprehend_single_entity(pii_masked_text, client)

                    # Filter for desired entity types
                    for detected_entity in entity_response["Entities"]:
                        self.extract_entities_from_line(detected_entity, next_segment, cf.appConfig[cf.CONF_ENTITY_TYPES])

                    # Now do the same for any entities we can find in a custom model.  At the
                    # time of writing, Custom Entity models in Comprehend are ENGLISH ONLY
                    if (self.customEntityEndpointARN != "") and (self.comprehendLanguageCode == "en"):
                        # Call the custom model and insert
                        custom_entity_response = client.detect_entities(Text=pii_masked_text,
                                                                        EndpointArn=self.customEntityEndpointARN)
                        for detected_entity in custom_entity_response["Entities"]:
                            self.extract_entities_from_line(detected_entity, next_segment, [])

    def generate_speaker_label(self, standard_ts_speaker="", analytics_ts_speaker=""):
        '''
        Takes the Transcribed-generated speaker, which could be spk_{N} or ch_{N}, and returns the label spk_{N}.
        This allows us to have a consistent label in the output JSON, which means that a header field in the
        output is able to dynamically swap the display labels.  This is needed as we cannot guarantee, especially
        with speaker-separated, who speaks first
        '''

        # Extract our speaker number
        if standard_ts_speaker != "":
            # Standard transcribe gives us ch_0 or spk_0
            index = standard_ts_speaker.find("_")
            speaker = int(standard_ts_speaker[index + 1:])
        elif (analytics_ts_speaker != "") and (self.analytics_channel_map != {}):
            # Analytics has a map of participant to channel
            speaker = self.analytics_channel_map[analytics_ts_speaker]

        # Track the maximum and return the label
        if speaker > self.maxSpeakerIndex:
            self.maxSpeakerIndex = speaker
        newLabel = "spk_" + str(speaker)
        return newLabel

    def create_turn_by_turn_segments(self, sf_event):
        """
        Creates a list of conversational turns, splitting up by speaker or if there's a noticeable pause in
        conversation.  Notes, this works differently for speaker-separated and channel-separated files. For speaker-
        the lines are already separated by speaker, so we only worry about splitting up speaker pauses of more than 3
        seconds, but for channel- we have to hunt gaps of 100ms across an entire channel, then sort segments from both
        channels, then merge any together to ensure we keep to the 3-second pause; this way means that channel- files
        are able to show interleaved speech where speakers are talking over one another.  Once all of this is done
        we inject sentiment into each segment.

        :param sf_event: Event data, as previous steps may send data of use
        """
        speechSegmentList = []

        # Decide on our operational mode and set the overall job language
        is_analytics_mode = (self.api_mode == cf.API_ANALYTICS)
        if is_analytics_mode:
            # We ignore speaker/channel mode on Analytics
            isChannelMode = False
            isSpeakerMode = False
        else:
            # Channel/Speaker-mode only relevant if not using analytics
            isChannelMode = self.analytics.transcribe_job.channel_identification
            isSpeakerMode = not isChannelMode

        lastSpeaker = ""
        lastEndTime = 0.0
        skipLeadingSpace = False
        confidenceList = []
        nextSpeechSegment = None

        # Process a Speaker-separated non-Analytics file
        if isSpeakerMode:
            # A segment is a blob of pronunciation and punctuation by an individual speaker
            for segment in self.asr_output["results"]["speaker_labels"]["segments"]:

                # If there is content in the segment then pick out the time and speaker
                if len(segment["items"]) > 0:
                    # Pick out our next data
                    nextStartTime = float(segment["start_time"])
                    nextEndTime = float(segment["end_time"])
                    nextSpeaker = self.generate_speaker_label(standard_ts_speaker=str(segment["speaker_label"]))

                    # If we've changed speaker, or there's a 3-second gap, create a new row
                    if (nextSpeaker != lastSpeaker) or ((nextStartTime - lastEndTime) >= 3.0):
                        nextSpeechSegment = SpeechSegment()
                        speechSegmentList.append(nextSpeechSegment)
                        nextSpeechSegment.segmentStartTime = nextStartTime
                        nextSpeechSegment.segmentSpeaker = nextSpeaker
                        skipLeadingSpace = True
                        confidenceList = []
                        nextSpeechSegment.segmentConfidence = confidenceList
                    nextSpeechSegment.segmentEndTime = nextEndTime

                    # Note the speaker and end time of this segment for the next iteration
                    lastSpeaker = nextSpeaker
                    lastEndTime = nextEndTime

                    # For each word in the segment...
                    for word in segment["items"]:

                        # Get the word with the highest confidence
                        pronunciations = list(filter(lambda x: x["type"] == "pronunciation", self.asr_output["results"]["items"]))
                        word_result = list(filter(lambda x: x["start_time"] == word["start_time"] and x["end_time"] == word["end_time"], pronunciations))
                        try:
                            result = sorted(word_result[-1]["alternatives"], key=lambda x: x["confidence"])[-1]
                            confidence = float(result["confidence"])
                        except:
                            result = word_result[-1]["alternatives"][0]
                            confidence = float(result["redactions"][0]["confidence"])

                        # Write the word, and a leading space if this isn't the start of the segment
                        if skipLeadingSpace:
                            skipLeadingSpace = False
                            wordToAdd = result["content"]
                        else:
                            wordToAdd = " " + result["content"]

                        # If the next item is punctuation, add it to the current word
                        try:
                            word_result_index = self.asr_output["results"]["items"].index(word_result[0])
                            next_item = self.asr_output["results"]["items"][word_result_index + 1]
                            if next_item["type"] == "punctuation":
                                wordToAdd += next_item["alternatives"][0]["content"]
                        except IndexError:
                            # There may not be a next item
                            word_result_index = -1

                        # Add word and confidence to the segment and to our overall stats
                        nextSpeechSegment.segmentText += wordToAdd
                        confidenceList.append({"Text": wordToAdd,
                                               "Confidence": confidence,
                                               "StartTime": float(word["start_time"]),
                                               "EndTime": float(word["end_time"])})
                        self.numWordsParsed += 1
                        self.cummulativeWordAccuracy += confidence

        # Process a Channel-separated file
        elif isChannelMode:

            # A channel contains all pronunciation and punctuation from a single speaker
            for channel in self.asr_output["results"]["channel_labels"]["channels"]:

                # If there is content in the channel then start processing it
                if len(channel["items"]) > 0:

                    # We have the same speaker all the way through this channel
                    nextSpeaker = self.generate_speaker_label(standard_ts_speaker=str(channel["channel_label"]))
                    for word in channel["items"]:
                        # Pick out our next data from a 'pronunciation'
                        if word["type"] == "pronunciation":
                            nextStartTime = float(word["start_time"])
                            nextEndTime = float(word["end_time"])

                            # If we've changed speaker, or we haven't and the
                            # pause is very small, then start a new text segment
                            if (nextSpeaker != lastSpeaker) or\
                                    ((nextSpeaker == lastSpeaker) and ((nextStartTime - lastEndTime) > 0.1)):
                                nextSpeechSegment = SpeechSegment()
                                speechSegmentList.append(nextSpeechSegment)
                                nextSpeechSegment.segmentStartTime = nextStartTime
                                nextSpeechSegment.segmentSpeaker = nextSpeaker
                                skipLeadingSpace = True
                                confidenceList = []
                                nextSpeechSegment.segmentConfidence = confidenceList
                            nextSpeechSegment.segmentEndTime = nextEndTime

                            # Note the speaker and end time of this segment for the next iteration
                            lastSpeaker = nextSpeaker
                            lastEndTime = nextEndTime

                            # Get the word with the highest confidence
                            pronunciations = list(filter(lambda x: x["type"] == "pronunciation", channel["items"]))
                            word_result = list(filter(lambda x: x["start_time"] == word["start_time"] and x["end_time"] == word["end_time"], pronunciations))
                            try:
                                result = sorted(word_result[-1]["alternatives"], key=lambda x: x["confidence"])[-1]
                                confidence = float(result["confidence"])
                            except:
                                result = word_result[-1]["alternatives"][0]
                                confidence = float(result["redactions"][0]["confidence"])

                            # Write the word, and a leading space if this isn't the start of the segment
                            if skipLeadingSpace:
                                skipLeadingSpace = False
                                wordToAdd = result["content"]
                            else:
                                wordToAdd = " " + result["content"]

                            # If the next item is punctuation, add it to the current word
                            try:
                                word_result_index = channel["items"].index(word_result[0])
                                next_item = channel["items"][word_result_index + 1]
                                if next_item["type"] == "punctuation":
                                    wordToAdd += next_item["alternatives"][0]["content"]
                            except IndexError:
                                # There may not be a next item
                                word_result_index = -1

                            # Add word and confidence to the segment and to our overall stats
                            nextSpeechSegment.segmentText += wordToAdd
                            confidenceList.append({"Text": wordToAdd,
                                                   "Confidence": confidence,
                                                   "StartTime": float(word["start_time"]),
                                                   "EndTime": float(word["end_time"])})
                            self.numWordsParsed += 1
                            self.cummulativeWordAccuracy += confidence

            # Sort the segments, as they are in channel-order and not speaker-order, then
            # merge together turns from the same speaker that are very close together
            speechSegmentList = sorted(speechSegmentList, key=lambda segment: segment.segmentStartTime)
            speechSegmentList = self.merge_speaker_segments(speechSegmentList)

        # Process a Call Analytics file
        elif is_analytics_mode:

            # Create our speaker mapping - we need consistent output like spk_0 | spk_1
            # across all Transcribe API variants to help the UI render it all the same
            for channel_def in sf_event["channelDefinitions"]:
                self.analytics_channel_map[channel_def["ParticipantRole"]] = channel_def["ChannelId"]

            # Lookup shortcuts
            interrupts = self.asr_output["ConversationCharacteristics"]["Interruptions"]

            # Each turn has already been processed by Transcribe, so the outputs are in order
            for turn in self.asr_output["Transcript"]:

                # Get our next speaker name
                nextSpeaker = self.generate_speaker_label(analytics_ts_speaker=turn["ParticipantRole"])

                # Setup the next speaker block
                nextSpeechSegment = SpeechSegment()
                speechSegmentList.append(nextSpeechSegment)
                nextSpeechSegment.segmentStartTime = float(turn["BeginOffsetMillis"]) / 1000.0
                nextSpeechSegment.segmentEndTime = float(turn["EndOffsetMillis"]) / 1000.0
                nextSpeechSegment.segmentSpeaker = nextSpeaker
                nextSpeechSegment.segmentText = turn["Content"]
                nextSpeechSegment.segmentLoudnessScores = turn["LoudnessScores"]
                confidenceList = []
                nextSpeechSegment.segmentConfidence = confidenceList
                skipLeadingSpace = True

                # Check if this block is within an interruption block for the speaker
                if turn["ParticipantRole"] in interrupts["InterruptionsByInterrupter"]:
                    turnStart = turn["BeginOffsetMillis"]
                    turnEnd = turn["EndOffsetMillis"]
                    for entry in interrupts["InterruptionsByInterrupter"][turn["ParticipantRole"]]:
                        if (entry["BeginOffsetMillis"] >= turnStart) and (entry["BeginOffsetMillis"] < turnEnd):
                            nextSpeechSegment.segmentInterruption = True
                            break

                # Process each word in this turn
                if "Items" in turn:
                    # Turn-level items are available
                    for word in turn["Items"]:
                        # Pick out our next data from a 'pronunciation'
                        if word["Type"] == "pronunciation":
                            # Write the word, and a leading space if this isn't the start of the segment
                            if skipLeadingSpace:
                                skipLeadingSpace = False
                                wordToAdd = word["Content"]
                            else:
                                wordToAdd = " " + word["Content"]

                            # If the word is redacted then the word confidence is a bit more buried
                            if "Confidence" in word:
                                conf_score = float(word["Confidence"])
                            elif "Redaction" in word:
                                conf_score = float(word["Redaction"][0]["Confidence"])

                            # Add the word and confidence to this segment's list and to our overall stats
                            confidenceList.append({"Text": wordToAdd,
                                                   "Confidence": conf_score,
                                                   "StartTime": float(word["BeginOffsetMillis"]) / 1000.0,
                                                   "EndTime": float(word["EndOffsetMillis"] / 1000.0)})
                            self.numWordsParsed += 1
                            self.cummulativeWordAccuracy += conf_score

                        else:
                            # Punctuation, needs to be added to the previous word
                            last_word = nextSpeechSegment.segmentConfidence[-1]
                            last_word["Text"] = last_word["Text"] + word["Content"]
                else:
                    # Turn-level items are NOT available (true for the launch of TCA Streaming)
                    # TODO This should be temporary, as TCA Streaming will support this going forward
                    word_list = turn["Content"].split(" ")
                    for wordToAdd in word_list:
                        # Go through each word and create a similar entry to the above
                        self.numWordsParsed += 1
                        confidenceList.append({"Text": wordToAdd,
                                               "Confidence": 0.0,
                                               "StartTime": 0.0,
                                               "EndTime": 0.0})

                # Record any issues, actions or outcomes detected
                self.extract_summary_data(nextSpeechSegment, nextSpeechSegment.segmentIssuesDetected,
                                          self.analytics.issues_detected, "IssuesDetected", turn)
                self.extract_summary_data(nextSpeechSegment, nextSpeechSegment.segmentActionItemsDetected,
                                          self.analytics.actions_detected, "ActionItemsDetected", turn)
                self.extract_summary_data(nextSpeechSegment, nextSpeechSegment.segmentOutcomesDetected,
                                          self.analytics.outcomes_detected, "OutcomesDetected", turn)

                # Tag on the sentiment - analytics has no per-turn numbers, so max out the
                # positive and negative, which effectively is 1.0 * COMPREHEND_SENTIMENT_SCALER
                turn_sentiment = turn["Sentiment"]
                if turn_sentiment == "POSITIVE":
                    nextSpeechSegment.segmentIsPositive = True
                    nextSpeechSegment.segmentPositive = 1.0
                    nextSpeechSegment.segmentSentimentScore = COMPREHEND_SENTIMENT_SCALER
                elif turn_sentiment == "NEGATIVE":
                    nextSpeechSegment.segmentIsNegative = True
                    nextSpeechSegment.segmentNegative = 1.0
                    nextSpeechSegment.segmentSentimentScore = COMPREHEND_SENTIMENT_SCALER

        # Inject sentiments into the segment list
        self.extract_nlp(speechSegmentList)

        # If we ended up with any matched simple entities then insert
        # them, which we can now do as we now have the sentence order
        if self.simpleEntityMap != {}:
            self.create_simple_entity_entries(speechSegmentList)

        # Now set the overall call duration if we actually had any speech
        if len(speechSegmentList) > 0:
            self.analytics.duration = float(speechSegmentList[-1].segmentConfidence[-1]["EndTime"])

        # Return our full turn-by-turn speaker segment list with sentiment
        return speechSegmentList

    def extract_summary_data(self, speech_segment, segment_summary_block, call_summary_block, summary_tag, turn):
        """
        Extracts Call Analytics call summary data of a specific tag type and stores it at both the current
        speech segment and at the call header level.  This is used to get all types of summary data, as the
        data structures for each one from Transcribe are identical

        :param speech_segment: Speech segment being populated
        :param segment_summary_block: Segment-level block to record all summary data items of this type
        :param call_summary_block: Call-level block to record all summary data items of this type
        :param summary_tag: JSON tag reference for the requested type of summary data
        :param turn: Current turn of the call being processed
        """
        if summary_tag in turn:
            for summary in turn[summary_tag]:
                # Grab the transcript offsets for the issue text
                if "CharacterOffsets" in summary:
                    # TODO Early releases of streaming TCA omitted the offsets, so be wary
                    begin_offset = summary["CharacterOffsets"]["Begin"]
                    end_offset = summary["CharacterOffsets"]["End"]
                    next_summary = {"Text": speech_segment.segmentText[begin_offset:end_offset],
                                    "BeginOffset": begin_offset,
                                    "EndOffset": end_offset}

                    # Tag this one on to our segment list and the header list
                    segment_summary_block.append(next_summary)
                    call_summary_block.append(next_summary)

    def create_simple_entity_entries(self, speech_segments):
        """
        Searches through the speech segments given and updates them with any of the simple entity mapping
        entries that we've found.  It also updates the line-level items.  Both methods simulate the same
        response that we'd generate if this was via Standard or Custom Comprehend Entities
        """

        # Need to check each of our speech segments for each of our entity blocks
        # TODO We need to match words, not partials!  See notes below
        for nextTurn in speech_segments:
            # Now check this turn for each entity
            turnText = nextTurn.segmentText.lower()
            for nextEntity in self.simpleEntityMap:
                if nextEntity in turnText:
                    self.matchedSimpleEntities[nextEntity] = self.simpleEntityMap[nextEntity]

        # Loop through each segment looking for matches in our cut-down entity list
        for entity in self.matchedSimpleEntities:

            # Start by recording this in the header
            entityEntry = self.matchedSimpleEntities[entity]
            self.update_header_entity_count(entityEntry["Type"], entityEntry["Original"])

            # Work through each segment
            # TODO Need to check we don't highlight characters in the middle of transcribed word
            # TODO Need to try and handle simple plurals (e.g. type="log" should match "logs")
            for segment in speech_segments:
                # Check if the entity text appear somewhere
                turnText = segment.segmentText.lower()
                searchFrom = 0
                index = turnText.find(entity, searchFrom)
                entityTextLength = len(entity)

                # If found then add the data in the segment, and keep going until we don't find one
                while index != -1:
                    # Got a match - add this one on, then look for another
                    # TODO if entityText is capitalised then use it, otherwise use segment text
                    nextSearchFrom = index + entityTextLength
                    newLineEntity = {}
                    newLineEntity["Score"] = 1.0
                    newLineEntity["Type"] = entityEntry["Type"]
                    newLineEntity["Text"] = entityEntry["Original"]  # TODO fix as per the above
                    newLineEntity["BeginOffset"] = index
                    newLineEntity["EndOffset"] = nextSearchFrom
                    segment.segmentCustomEntities.append(newLineEntity)

                    # Now look to see if it's repeated in this segment
                    index = turnText.find(entity, nextSearchFrom)

    def calculate_transcribe_conversation_time(self, filename):
        '''
        Tries to work out the conversation time based upon patterns in the filename.
        
        The filename parsing behavior is defined in two configuration parameters:
        
        1. FilenameDatetimeRegex:
          Regular Expression (regex) used to parse call Date/Time from audio filenames. 
          Each datetime field (year, month, etc.) must be matched using a separate parenthesized group in the regex. 
          Example: the regex '(\d{2}).(\d{2}).(\d{2}).(\d{3})-(\d{2})-(\d{2})-(\d{4})' parses
          the filename: CallAudioFile-09.25.51.067-09-26-2019.wav into a value list: [09, 25, 51, 067, 09, 26, 2019]
          The next parameter, FilenameDatetimeFieldMap, maps the values to datetime field codes.
          If the filename doesn't match the regex pattern, the current time is used as the call datetime.

        2. FilenameDatetimeFieldMap:
          Space separated ordered sequence of time field codes as used by Python's datetime.strptime() function. 
          Each field code refers to a corresponding value parsed by the regex parameter filenameTimestampRegex. 
          Example: the mapping '%H %M %S %f %m %d %Y' assembles the regex values [09, 25, 51, 067, 09, 26, 2019]
          into the full datetime: '2019-09-26 09:25:51.067000'.  
          If the field map doesn't match the value list parsed by the regex, then the current time is used as the call datetime.
        '''
        regex = cf.appConfig[cf.CONF_FILENAME_DATETIME_REGEX]
        fieldmap = cf.appConfig[cf.CONF_FILENAME_DATETIME_FIELDMAP]
        print(f"INFO: Parsing datetime from filename '{filename}' using regex: '{regex}' and fieldmap: '{fieldmap}'.")
        try:
            self.analytics.conversationLocation = cf.appConfig[cf.CONF_CONVO_LOCATION]
            match = re.search(regex, filename)
            fieldstring = " ".join(match.groups())
            self.analytics.conversationTime = str(datetime.strptime(fieldstring, fieldmap))
            print(f"INFO: Assembled datetime: '{self.analytics.conversationTime}'")
        except Exception as e:
            # If everything fails system will use "now" as the datetime in UTC, which is likely wrong
            print(e)
            print(f"WARNING: Unable to parse datetime from filename. Defaulting to current system time.")
            if self.analytics.conversationLocation == "":
                self.analytics.conversationLocation = "Etc/UTC"
                
    def set_guid(self, filename):
        '''
        Tries to parse a GUID for the call from the filename using a configurable Regular Expression.
        The GUID value must be matched using one or more parenthesized groups in the regex. 
        Example: the regex '_GUID_(.*?)_' parses
        the filename: AutoRepairs1_CUST_12345_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav 
        to extract the GUID value '2a602c1a-4ca3-4d37-a933-444d575c0222'.        
        '''
        regex = cf.appConfig[cf.CONF_FILENAME_GUID_REGEX]
        print(f"INFO: Parsing GUID from filename '{filename}' using regex: '{regex}'.")
        try:
            match = re.search(regex, filename)
            guid = " ".join(match.groups()) or 'None'
            print(f"INFO: Parsed GUID: '{guid}'")
        except:
            print(f"WARNING: Unable to parse GUID from filename {filename}, using regex: '{regex}'. Defaulting to 'None'.")
            guid = 'None'
        self.analytics.guid = guid

    def set_agent(self, filename):
        '''
        Tries to parse an Agent name or ID from the filename using a configurable Regular Expression.
        The AGENT value must be matched using one or more parenthesized groups in the regex. 
        Example: the regex '_AGENT_(.*?)_' parses
        the filename: AutoRepairs1_CUST_12345_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav 
        to extract the Agent value 'BobS'.        
        '''
        regex = cf.appConfig[cf.CONF_FILENAME_AGENT_REGEX]
        print(f"INFO: Parsing AGENT from filename '{filename}' using regex: '{regex}'.")
        try:
            match = re.search(regex, filename)
            agent = " ".join(match.groups()) or 'None'
            print(f"INFO: Parsed AGENT: '{agent}'")
        except:
            print(f"WARNING: Unable to parse Agent name/ID from filename {filename}, using regex: '{regex}'. Defaulting to 'None'.")
            agent = 'None'
        self.analytics.agent = agent

    def set_cust(self, filename):
        '''
        Regular Expression (regex) used to parse Customer from audio filenames. 
        The customer id value must be matched using one or more parenthesized groups in the regex. 
        Example: the regex '_CUST_(.*?)_' parses
        the filename: AutoRepairs1_CUST_12345_GUID_2a602c1a-4ca3-4d37-a933-444d575c0222_AGENT_BobS_DATETIME_07.55.51.067-09-16-2021.wav 
        to extract the Customer value '12345'.        
        '''
        regex = cf.appConfig[cf.CONF_FILENAME_CUST_REGEX]
        print(f"INFO: Parsing CUST from filename '{filename}' using regex: '{regex}'.")
        try:
            match = re.search(regex, filename)
            cust = " ".join(match.groups()) or 'None'
            print(f"INFO: Parsed CUST: '{cust}'")
        except:
            print(f"WARNING: Unable to parse CUST name/ID from filename {filename}, using regex: '{regex}'. Defaulting to 'None'.")
            cust = 'None'
        self.analytics.cust = cust

    def load_simple_entity_string_map(self):
        """
        Loads in any defined simple entity map for later use - this must be a CSV file, but it will be defined
        without a language code.  We will append the Comprehend language code to the filename and use that,
        as that will give us multi-language coverage with a single file.

        Example: Configured File = entityFile.csv -> Processed File for en-US audio = entityFile-en.csv
        """

        if self.simpleEntityMatchingUsed:
            # First, need to build up the real filename to use for this language.  If we don't
            # have a language (unlikely) then just try to use the base filename as a last resort
            key = cf.appConfig[cf.CONF_ENTITY_FILE]
            if (self.comprehendLanguageCode != ""):
                key = key.split('.csv')[0] + "-" + self.comprehendLanguageCode + ".csv"

            # Then check that the language-specific mapping file actually exists
            s3 = boto3.client("s3")
            bucket = cf.appConfig[cf.CONF_SUPPORT_BUCKET]
            try:
                response = s3.get_object(Bucket=bucket, Key=key)
                print(f"Loaded Entity Mapping file: s3://{bucket}/{key}.")
            except Exception as e:
                # Mapping file doesn't exist, so just quietly exit
                print(f"Unable to load Entity Mapping file: s3://{bucket}/{key}. EntityMapping disabled.")
                self.simpleEntityMatchingUsed = False
                return

            # Go download the mapping file and get it into a structure
            mapFilepath = TMP_DIR + '/' + cf.appConfig[cf.CONF_ENTITY_FILE]
            s3.download_file(bucket, key, mapFilepath)
            reader = csv.DictReader(open(mapFilepath, errors="ignore"))
            try:
                for row in reader:
                    origTerm = row.pop("Text")
                    checkTerm = origTerm.lower()
                    if not (checkTerm in self.simpleEntityMap):
                        self.simpleEntityMap[checkTerm] = {"Type": row.pop("Type"), "Original": origTerm}
            except Exception as e:
                # Something went wrong loading in the spreadsheet - disable the entities
                self.simpleEntityMatchingUsed = False
                self.simpleEntityMap = {}
                print(f"Failed to load in entity file {cf.appConfig[cf.CONF_ENTITY_FILE]}")
                print(e)
            finally:
                # Remove our temporary in case of Lambda container re-use
                pcacommon.remove_temp_file(mapFilepath)

    def create_playback_mp3_audio(self, audio_uri):
        """
        Creates and MP3-version of the audio file used in the Transcribe job, as the HTML5 <audio> playback
        controller cannot play them back if they are GSM-encoded 8Khz WAV files.  Still need to work out how
        to check for then encoding type via FFMPEG, but we do get the other info from Transcribe.

        @param audio_uri: URI of the audio file to be potentially dowloaded and converted
        """

        # Get some info on the audio file before continuing
        s3Object = urlparse(audio_uri)
        bucket = s3Object.netloc

        # 8Khz WAV audio gets converted - first, we need to download the original audio file
        fileObject = s3Object.path.lstrip('/')
        inputFilename = TMP_DIR + '/' + fileObject.split('/')[-1]
        outputFilename = inputFilename.split('.wav')[0] + '.mp3'
        s3Client = boto3.client('s3')
        s3Client.download_file(bucket, fileObject, inputFilename)

        # Transform the file via FFMPEG - this will exception if not installed
        try:
            # Just convert from source to destination format
            subprocess.call(['ffmpeg', '-nostats', '-loglevel', '0', '-y', '-i', inputFilename, outputFilename],
                            stdin=subprocess.DEVNULL)

            # Now upload the output file to the configured playback folder in the main input bucket
            s3FileKey = cf.appConfig[cf.CONF_PREFIX_AUDIO_PLAYBACK] + '/' + outputFilename.split('/')[-1]
            s3Client.upload_file(outputFilename, cf.appConfig[cf.CONF_S3BUCKET_INPUT], s3FileKey,
                                 ExtraArgs={'ContentType': 'audio/mp3'})
            self.audioPlaybackUri = "s3://" + cf.appConfig[cf.CONF_S3BUCKET_INPUT] + "/" + s3FileKey
        except Exception as e:
            print(e)
            print("Unable to create MP3 version of original audio file - could not find FFMPEG libraries")
        finally:
            # Remove our temporary files in case of Lambda container re-use
            pcacommon.remove_temp_file(inputFilename)
            pcacommon.remove_temp_file(outputFilename)

    def parse_transcribe_file(self, sf_event):
        """
        Parses the output from the specified Transcribe job
        """

        # First, load in what interim results we have so far
        output_bucket = cf.appConfig[cf.CONF_S3BUCKET_OUTPUT]
        input_bucket = cf.appConfig[cf.CONF_S3BUCKET_INPUT]
        self.pca_results.read_results_from_s3(output_bucket, sf_event["interimResultsFile"])
        self.api_mode = self.pca_results.analytics.transcribe_job.api_mode

        # Put a playback audio file in the correct folder - this can have multiple sources
        if "redactedMediaFileUri" in sf_event:
            # If we have redacted audio output from TCA then copy that to the playback folder
            redacted_url = "s3://" + "/".join(sf_event["redactedMediaFileUri"].split("/")[3:])
            s3_object = urlparse(redacted_url)
            s3_client = boto3.resource("s3")
            source = {"Bucket": s3_object.netloc, "Key": s3_object.path[1:]}
            dest_key = cf.appConfig[cf.CONF_PREFIX_AUDIO_PLAYBACK] + '/' + redacted_url.split('/')[-1]
            s3_client.meta.client.copy(source, input_bucket, dest_key)
            self.audioPlaybackUri = "s3://" + input_bucket + "/" + dest_key
        elif (self.transcribe_job_info.media_format == "wav") and (self.transcribe_job_info.media_sample_rate == 8000):
                # Certain type of WAV don't play nicely with the HTML playback control
                self.create_playback_mp3_audio(self.analytics.transcribe_job.media_playback_uri)
        else:
            # Copy the original input file to the playback folder
            s3_client = boto3.resource("s3")
            source = {"Bucket": input_bucket, "Key": sf_event["key"]}
            dest_key = cf.appConfig[cf.CONF_PREFIX_AUDIO_PLAYBACK] + '/' + sf_event["key"].split('/')[-1]
            s3_client.meta.client.copy(source, input_bucket, dest_key)
            self.audioPlaybackUri = "s3://" + input_bucket + "/" + dest_key

        # Pick out the config parameters that we need

        # Parse various fields from the Transcribe job name if possible
        job_name = self.analytics.transcribe_job.transcribe_job_name
        self.set_guid(job_name)
        self.set_agent(job_name)
        self.set_cust(job_name)
        self.calculate_transcribe_conversation_time(job_name)

        # Download the job JSON results file to a local temp file - different Transcribe modes put the files in
        # different folder structures, so strip everything past the bucket name to be the location of the tmp file
        json_filepath = TMP_DIR + '/' + sf_event["transcriptUri"].split("/")[-1]
        if sf_event["transcriptUri"].startswith("https"):
            # HTTPS URI came from Transcribe, so https://<region>/<bucket>/<key>
            transcriptResultsKey = "/".join(sf_event["transcriptUri"].split("/")[4:])
        else:
            # S3 URI came from Transcribe, so s3://<bucket>/<key>
            transcriptResultsKey = "/".join(sf_event["transcriptUri"].split("/")[3:])

        # Now download - this has been known to get a "404 HeadObject Not Found",
        # which makes no sense, so if that happens then re-try in a sec.  Only once.
        s3Client = boto3.client('s3')
        try:
            s3Client.download_file(output_bucket, transcriptResultsKey, json_filepath)
        except:
            time.sleep(3)
            s3Client.download_file(output_bucket, transcriptResultsKey, json_filepath)

        # Load in the JSON file for processing, and set our language codes for the file and Comprehend
        self.asr_output = json.load(open(Path(json_filepath).absolute(), "r", encoding="utf-8"))

        # Before we process, let's load up any required simply entity map, which needs the base language code
        self.set_comprehend_language_code()
        self.load_simple_entity_string_map()

        # Now create turn-by-turn diarisation, with associated sentiments and entities
        self.speechSegmentList = self.create_turn_by_turn_segments(sf_event)

        # Update our results data structures, generate JSON results and save them to S3
        self.push_turn_by_turn_results()

        # Update summary structures
        self.process_tca_summary()

        # Write out the JSON data back to our interim S3 location
        json_output, output_filename = self.pca_results.write_results_to_s3(bucket=output_bucket,
                                                                            object_key=sf_event["interimResultsFile"])

        # Index transcript in Kendra, if transcript search is enable
        kendraIndexId = cf.appConfig[cf.CONF_KENDRA_INDEX_ID]
        if kendraIndexId != "None":
            analysisUri = f"{cf.appConfig[cf.CONF_WEB_URI]}dashboard/parsedFiles/{json_filepath.split('/')[-1]}"
            transcript_with_markers = prepare_transcript(self.pca_results)
            conversationAnalytics = json_output["ConversationAnalytics"]
            put_kendra_document(kendraIndexId, analysisUri, conversationAnalytics, transcript_with_markers)

        # Finally, remove any Step Functions data that we don't need to pass on (they won't all exist)
        sf_event.pop("transcriptUri", None)
        sf_event.pop("channelDefinitions", None)
        sf_event.pop("redactedMediaFileUri", None)

        # delete the local file
        pcacommon.remove_temp_file(json_filepath)


def lambda_handler(event, context):
    # Load our configuration data
    sf_data = copy.deepcopy(event)
    cf.loadConfiguration()

    # Instantiate our parser and write out our processed file
    transcribeParser = TranscribeParser(cf.appConfig[cf.CONF_MINPOSITIVE],
                                        cf.appConfig[cf.CONF_MINNEGATIVE],
                                        cf.appConfig[cf.CONF_ENTITYENDPOINT])
    transcribeParser.parse_transcribe_file(sf_data)

    # Add the requested telephony CTR type
    sf_data["telephony"] = cf.appConfig[cf.CONF_TELEPHONY_CTR]
    return sf_data


# Main entrypoint for testing
if __name__ == "__main__":
    # Test event
    test_event_analytics = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "inputType": "audio",
        "jobName": "Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "redactedMediaFileUri": "https://s3.us-east-1.amazonaws.com/ak-cci-output/transcribeResults/redacted-analytics/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.wav",
        "transcriptUri": "https://s3.us-east-1.amazonaws.com/ak-cci-output/transcribeResults/redacted-analytics/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.json",
        "channelDefinitions": [{'ChannelId': 1, 'ParticipantRole': 'AGENT'}, {'ChannelId': 0, 'ParticipantRole': 'CUSTOMER'}],
        "interimResultsFile": "interimResults/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.json"
    }
    test_event_stereo = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "inputType": "audio",
        "jobName": "Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED",
        "transcriptUri": "https://s3.us-east-1.amazonaws.com/ak-cci-output/transcribeResults/redacted-Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav.json",
        "interimResultsFile": "interimResults/redacted-Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav.json"
    }
    test_event_mono = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "inputType": "audio",
        "jobName": "Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED",
        "transcriptUri": "https://s3.us-east-1.amazonaws.com/ak-cci-output/transcribeResults/redacted-Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav.json",
        "interimResultsFile": "interimResults/redacted-Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav.json"
    }
    test_stream_tca = {
        "bucket": "ak-cci-input",
        "key": "originalTranscripts/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "inputType": "transcript",
        "jobName": "TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "transcriptUri": "s3://ak-cci-output/transcribeResults/liveStreaming/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "channelDefinitions": [{'ChannelId': 1, 'ParticipantRole': 'AGENT'}, {'ChannelId': 0, 'ParticipantRole': 'CUSTOMER'}],
        "interimResultsFile": "interimResults/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json"
    }
    lambda_handler(test_event_analytics, "")
    lambda_handler(test_event_stereo, "")
    lambda_handler(test_event_mono, "")
    lambda_handler(test_stream_tca, "")
