"""
This python function is part of the main processing workflow.
It performs summarization of the call if summarization was enabled.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
import pcaconfiguration as cf
import pcaresults
import json
import re

TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
html_remover = re.compile('<[^>]*>')
filler_remover = re.compile('(^| )([Uu]m|[Uu]h|[Ll]ike|[Mm]hm)[,]?')

def remove_html(transcript_string):
    return re.sub(html_remover, '', transcript_string)

def remove_filler_words(transcript_string):
    return re.sub(filler_remover, '', transcript_string)

def truncate_number_of_words(transcript_string, truncateLength):
    #findall can retain carriage returns
    data = re.findall(r'\S+|\n|.|,',transcript_string)
    if truncateLength > 0:
      data = data[0:truncateLength]
    print('Token Count: ' + str(len(data)))
    return ''.join(data)

def generate_transcript_string(pca_results):
    # generate a text transcript:
    transcripts = []
    speakers = {}
    speech_segments = pca_results.create_output_speech_segments()
    conversation_analytics = pca_results.get_conv_analytics()
    
    for speaker in conversation_analytics.speaker_labels:
        speakers[speaker['Speaker']] = speaker['DisplayText']
    
    for segment in speech_segments:
        speaker = 'Unknown'
        if segment['SegmentSpeaker'] in speakers:
            speaker = speakers[segment['SegmentSpeaker']]
        transcripts.append(f"{speaker}: {segment['DisplayText']}\n")
    
    transcript_str = ''.join(transcripts)
    print(transcript_str)
    if TOKEN_COUNT > 0:
        transcript_str = truncate_number_of_words(transcript_str, TOKEN_COUNT)
    return transcript_str


def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """
    
    print(event)

    # Load our configuration data
    cf.loadConfiguration()

    # Load in our existing interim CCA results
    pca_results = pcaresults.PCAResults()
    pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])
    
    transcript_str = generate_transcript_string(pca_results)
    if 'tokenCount' in event:
        tokenCount = int(event['tokenCount'])
        transcript_str = truncate_number_of_words(transcript_str, tokenCount)

    if 'processTranscript' in event:
        processTranscript = event['processTranscript']
        if processTranscript:
            transcript_str = remove_filler_words(transcript_str)

    return {
        'transcript': transcript_str
    }