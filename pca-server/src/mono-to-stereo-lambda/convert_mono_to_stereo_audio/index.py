# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
import boto3
from urllib.parse import urlparse
import ssm_param_config as cf
import os
from helper import *

def lambda_handler(event, context):
    key = event["key"]
    input_type = event['inputType']
    job_name = event["jobName"]
    
    s3_client = boto3.client("s3")

    cf.loadConfiguration()
    
    transcribe_client = boto3.client("transcribe")
    transcript_response = transcribe_client.get_transcription_job(TranscriptionJobName=job_name)["TranscriptionJob"]

    
    ip_file_s3_uri = transcript_response["Media"]["MediaFileUri"]
    redacted_transcript_uri = transcript_response["Transcript"]["RedactedTranscriptFileUri"]
    
    parse_temp = urlparse(ip_file_s3_uri, allow_fragments=False)
    
    ip_file_name = ip_file_s3_uri.split("/")[-1]
    ip_file_tmp_location = '/tmp/'+ip_file_name
    ip_bucket = parse_temp.netloc
    ip_file_key = parse_temp.path[1:]
    
    op_bucket = urlparse(redacted_transcript_uri).path.split("/")[1]
    
    li = urlparse(redacted_transcript_uri).path.split("/")[2:]
    op_key = "/".join(li)
    
    op_file_name = urlparse(redacted_transcript_uri).path.split("/")[-1]
    op_file_tmp_location = '/tmp/'+op_file_name

    s3_client.download_file(op_bucket, op_key, op_file_tmp_location)
    s3_client.download_file(ip_bucket, ip_file_key, ip_file_tmp_location)
    
    f = open(op_file_tmp_location)
    transcript = json.load(f)
    print(transcript)
    
    speaker_dict = {}
    segments = transcript['results']['speaker_labels']['segments']
    for item in segments:
        speaker_label = item['speaker_label']
        s = 'volume=enable=\'between(t,' + item['start_time'] + ',' + item['end_time'] + ')\':volume=0' + ", "
        speaker_dict[speaker_label] = speaker_dict.get(speaker_label, "") + s


    for key,val in speaker_dict.items():
        clip_time = "\"" + val[:-2] + "\""
        clip_op_file_name = "{}_{}".format(key, ip_file_name)
        clip_op_tmp_location = '/tmp/'+clip_op_file_name
        command_ = "ffmpeg -i {} -af {} {} -y".format(ip_file_tmp_location, clip_time, clip_op_tmp_location)
        os.system(command_)
    

    mono_file1 = "spk_0_"+ip_file_name
    mono_file1_tmp_loc = '/tmp/'+mono_file1
    mono_file2 = "spk_1_"+ip_file_name
    mono_file2_tmp_loc = '/tmp/'+mono_file2
    stereo_file = "stereo_op_"+ip_file_name
    stereo_file_tmp_loc = '/tmp/'+stereo_file
    
    merge_command = 'ffmpeg -i {} -i {} -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]" -map "[a]" {} -y'\
                    .format(mono_file1_tmp_loc, mono_file2_tmp_loc, stereo_file_tmp_loc)
    
    os.system(merge_command)
    
    converted_audio_prefix = cf.appConfig[cf.CONF_PREFIX_MONO_STEREO_CONVERTED_AUDIO]
    stereo_file_key = converted_audio_prefix + "/"+ stereo_file
    s3_client.upload_file(stereo_file_tmp_loc, ip_bucket, stereo_file_key)
    
    message_str = "File has been saved at s3://{}/{}".format(ip_bucket, stereo_file_key)

    remove_temp_file(mono_file1_tmp_loc)
    remove_temp_file(mono_file2_tmp_loc)
    remove_temp_file(stereo_file_tmp_loc)
    
    return {
        'statusCode': 200,
        'body': json.dumps(message_str),
        'bucket': ip_bucket,
        'key': stereo_file_key,
        'inputType': input_type
    }
