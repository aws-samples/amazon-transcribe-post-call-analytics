# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import boto3
import json
import ssm_param_config as cf

def lambda_handler(event, context):
    # Load our configuration
    cf.loadConfiguration()

    bucket = event['bucket']
    key = event['key']
    input_type = event['inputType']

    # File looks good - go find our Step Function
    ourStepFunction = cf.appConfig[cf.COMP_SFN_NAME] ## trigger the Mono-to-Stereo workflow
    sfnClient = boto3.client('stepfunctions')
    sfnMachinesResult = sfnClient.list_state_machines(maxResults=1000)
    sfnArnList = list(filter(lambda x: x["stateMachineArn"].endswith(ourStepFunction), sfnMachinesResult["stateMachines"]))
    if sfnArnList == []:
        raise Exception(
            'Cannot find configured Step Function \'{}\' in the AWS account in this region - cannot begin workflow.'.format(ourStepFunction))
    sfnArn = sfnArnList[0]['stateMachineArn']

    # Trigger a new Step Function execution                 
    parameters = '{\n  \"bucket\": \"' + bucket + '\",\n' + \
                 '  \"key\": \"' + key + '\",\n' + \
                 '  \"inputType\": \"' + input_type + '\"\n' + \
                 '}'
                 
    sfnClient.start_execution(stateMachineArn = sfnArn, input = parameters)
    final_message = f"Post-call analytics workflow for file {key} successfully started."

    # Return our final message
    return {
        'bucket': bucket,
        'key': key,
        'inputType': input_type,
        'statusCode': 200,
        'body': json.dumps(final_message)
    }
