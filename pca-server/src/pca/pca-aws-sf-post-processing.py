"""
This python function is part of the main processing workflow.  It performs any final processing steps required
when the main processing has completed, along with any additional optional processing carried out by the
telephony-specific Contract Trace Record handling

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import pcaconfiguration as cf


def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """

    # Load our configuration data
    cf.loadConfiguration()
    results_bucket = cf.appConfig[cf.CONF_S3BUCKET_OUTPUT]

    # This function just has to move the interim results file to the full results file
    s3_resource = boto3.resource("s3")
    dest_key = cf.appConfig[cf.CONF_PREFIX_PARSED_RESULTS] + "/" + event["interimResultsFile"].split("/")[-1]
    copy_source = {
        'Bucket': results_bucket,
        'Key': event["interimResultsFile"]
    }
    s3_resource.meta.client.copy(copy_source, results_bucket, dest_key)

    # Then delete the interim file
    s3_client = boto3.client("s3")
    s3_client.delete_object(Bucket=results_bucket, Key=event["interimResultsFile"])

# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "ak-cci-input",
        "langCode": "en-US",
        "transcribeStatus": "COMPLETED",
        "apiMode": "analytics",
        "key": "originalAudio/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "jobName": "Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "parsedJsonFile": "interimResults/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.json",
        "telephony": "none"
    }
    lambda_handler(event, "")
