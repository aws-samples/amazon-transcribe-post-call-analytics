"""
This python function is part of the main processing workflow.  It performs any final processing steps required
when the main processing has completed, along with any additional optional processing carried out by the
telephony-specific Contract Trace Record handling

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import pcaconfiguration as cf
import pcaresults

def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """

    # Load our configuration data
    cf.loadConfiguration()
    results_bucket = cf.appConfig[cf.CONF_S3BUCKET_OUTPUT]

    # Load in our existing interim CCA results
    pca_results = pcaresults.PCAResults()
    pca_analytics = pca_results.get_conv_analytics()
    pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])

    # --------- Do any post processing here ----------


    # Write out back to interim file
    pca_results.write_results_to_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])


    return event


# Main entrypoint for testing
if __name__ == "__main__":
    event = {
        "bucket": "ak-cci-input",
        "langCode": "en-US",
        "transcribeStatus": "COMPLETED",
        "apiMode": "analytics",
        "key": "originalAudio/b27d6650-09e7-41c1-a10a-dc1c77cb5bcd.wav",
        "jobName": "Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "interimResultsFile": "interimResults/b27d6650-09e7-41c1-a10a-dc1c77cb5bcd.wav.json",
        "telephony": "none",
        "debug": True
    }
    lambda_handler(event, "")
