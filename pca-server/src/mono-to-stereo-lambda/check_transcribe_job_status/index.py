# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3

def lambda_handler(event, context):
    
    bucket = event['bucket']
    key = event['key']
    input_type = event['inputType']
    job_name = event['jobName']
    
    transcribe_client = boto3.client("transcribe")
    transcript_response = transcribe_client.get_transcription_job(TranscriptionJobName=job_name)["TranscriptionJob"]
    job_status = transcript_response['TranscriptionJobStatus']
    
    return {
        'bucket': bucket,
        'key': key,
        'inputType': input_type,
        'jobName': job_name,
        'statusCode': 200,
        'transcriptionJobStatus': job_status
    }
