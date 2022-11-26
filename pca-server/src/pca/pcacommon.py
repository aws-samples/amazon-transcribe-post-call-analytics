"""
This python function is part of the main processing workflow.  It contains a number of common functions that other
python functions in this application need to share.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import os
import time
import subprocess
import pcaconfiguration as cf


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


def remove_temp_file(file_path):
    """
    Checks if the specified file exists and deletes it if it does

    @param file_path: Path to the file to be deleted
    """
    # Delete the file if it exists
    if os.path.exists(file_path):
        os.remove(file_path)


def ffprobe_get_stream_entries(select_data, filename):
    """
    Calls FFPROBE to look at the streams-based metadata for a given audio file, but you specify which
    aspect of the stream data to be returned.  To see what's available in the stream run this:

    ffprobe -hide_banner -loglevel panic -show_format -show_streams -of json <filename>

    Note that this could exception for many reason, so the caller should be prepared for failure

    :param select_data: The stream data that you're trying to parse; e.g. stream=sample_rate
    :param filename: Full path to local file to be probed
    :return: Data returned from FFPROBE
    """
    command = ['ffprobe', '-v', 'error', '-select_streams', 'a', '-of',
               'default=noprint_wrappers=1:nokey=1', '-show_entries',
               select_data, filename]
    prob_result = subprocess.check_output(command, stderr=subprocess.STDOUT).decode()

    return prob_result.strip('\n')


def comprehend_single_sentiment(text, lang_code, scalar=1.0, client=None):
    """
    Perform sentiment analysis of the text against the current language.  A pre-initialised boto3
    instance can be provided for Comprehend, but a new one will be created if required.  All sentiment
    values are scaled, as Transcribe Call Analytics sentiment trends assume +/- 5.0 for the range,
    whereas Comprehend uses +/- 1.0.

    :param text: Text to be examined for sentiment
    :param lang_code: Language for the Comprehend API check
    :param scalar: Scaling factor to use
    :param client: Pre-initialised boto3 client for the Comprehend APIs
    :return:
    """
    sentimentResponse = {}
    counter = 0
    while sentimentResponse == {}:
        try:
            # Get the sentiment, and strip off the MIXED response (as we won't be using it)
            sentimentResponse = client.detect_sentiment(Text=text, LanguageCode=lang_code)
            sentimentResponse["SentimentScore"].pop("Mixed", None)

            # Now scale our remaining values
            for sentiment_key in sentimentResponse["SentimentScore"]:
                sentimentResponse["SentimentScore"][sentiment_key] *= scalar
        except Exception as e:
            if counter < cf.NLP_THROTTLE_RETRIES:
                counter += 1
                time.sleep(3)
            else:
                raise e

    return sentimentResponse

