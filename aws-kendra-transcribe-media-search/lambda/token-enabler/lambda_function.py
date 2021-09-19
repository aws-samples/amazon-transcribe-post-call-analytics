# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import logging
import boto3
import cfnresponse
import random
import os

logger = logging.getLogger()
logger.setLevel(logging.INFO)

INDEX_ID = os.environ['INDEX_ID']
SIGNING_KEY_URL = os.environ['SIGNING_KEY_URL']
KENDRA = boto3.client('kendra')

def enable_access_tokens(indexId):
    logger.info(f"enable_access_tokens(indexId={indexId})")
    resp = KENDRA.update_index(Id=indexId, 
               UserTokenConfigurations=[{
                   'JwtTokenTypeConfiguration': {
                        'KeyLocation': 'URL',
                        'URL': SIGNING_KEY_URL,
                        'UserNameAttributeField': 'cognito:username',
                        'GroupAttributeField': 'cognito:groups'
                    },
               }
           ],
           UserContextPolicy='USER_TOKEN')
    logger.info(f"response:" + json.dumps(resp))
    

def lambda_handler(event, context):
    logger.info("Received event: %s" % json.dumps(event))
    if ('RequestType' in event):
        if (event['RequestType'] != 'Delete'):
            logger.info("Calling enable_access_tokens")
            enable_access_tokens(INDEX_ID)
            logger.info("returned from start_job")
    status = cfnresponse.SUCCESS
    cfnresponse.send(event, context, status, {}, None)
    return status