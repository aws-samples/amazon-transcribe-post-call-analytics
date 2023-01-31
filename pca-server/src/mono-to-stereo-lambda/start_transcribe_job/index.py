# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import copy
import pcaconfiguration as cf
from helper import *

def lambda_handler(event, context):
    bucket = event['bucket']
    key = event['key']
    input_type = event['inputType']
    
    cf.loadConfiguration()
    
    sfData = copy.deepcopy(event)
    
    print(sfData)
    job_name, api_mode = submitTranscribeJob(bucket,key)
    
    
    return {
        'statusCode': 200,
        'bucket': bucket,
        'key': key,
        'inputType': input_type,
        "jobName": job_name
    }
