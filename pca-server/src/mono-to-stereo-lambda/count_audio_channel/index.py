# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from helper import *

def lambda_handler(event, context):
    bucket = event['bucket']
    key = event['key']
    input_type = event['inputType']
    
    channel = count_audio_channels(bucket, key)
    
    return {
        'bucket': bucket,
        'key': key,
        'inputType': input_type,
        'statusCode': 200,
        'channel': channel
    }
