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

bc = boto3.client('amplify')

app_id=os.environ['APP_ID']


def lambda_handler(event, context):
    logger.info("Received event: %s" % json.dumps(event))
    if ('RequestType' in event):
        if (event['RequestType'] != 'Delete'):
            logger.info("Calling start_job for AppId: " + app_id)
            response = bc.start_job(
                appId=app_id,
                branchName='main',
                jobType='RELEASE'
            )
            logger.info("returned from start_job")
    status = cfnresponse.SUCCESS
    cfnresponse.send(event, context, status, {}, None)
    return status