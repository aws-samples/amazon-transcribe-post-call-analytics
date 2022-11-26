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

    # Then delete the interim file if we're not debugging
    if "debug" not in event:
        s3_client = boto3.client("s3")
        s3_client.delete_object(Bucket=results_bucket, Key=event["interimResultsFile"])

    return event


# Main entrypoint for testing
if __name__ == "__main__":
    # Test event
    test_event_analytics = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "inputType": "audio",
        "jobName": "Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "interimResultsFile": "interimResults/Card2_GUID_102_AGENT_AndrewK_DT_2022-03-22T12-23-49.wav.json"
    }
    test_event_stereo = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "inputType": "audio",
        "jobName": "Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED",
        "interimResultsFile": "interimResults/redacted-Auto3_GUID_003_AGENT_BobS_DT_2022-03-21T17-51-51.wav.json"
    }
    test_event_mono = {
        "bucket": "ak-cci-input",
        "key": "originalAudio/Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "inputType": "audio",
        "jobName": "Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav",
        "apiMode": "standard",
        "transcribeStatus": "COMPLETED",
        "interimResultsFile": "interimResults/redacted-Auto0_GUID_000_AGENT_ChrisL_DT_2022-03-19T06-01-22_Mono.wav.json"
    }
    test_stream_tca = {
        "bucket": "ak-cci-input",
        "key": "originalTranscripts/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "inputType": "transcript",
        "jobName": "TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json",
        "apiMode": "analytics",
        "transcribeStatus": "COMPLETED",
        "interimResultsFile": "interimResults/TCA_GUID_3c7161f7-bebc-4951-9cfb-943af1d3a5f5_CUST_17034816544_AGENT_BabuS_2022-11-22T21-32-52.145Z.json"
    }
    lambda_handler(test_event_analytics, "")
    lambda_handler(test_event_stereo, "")
    lambda_handler(test_event_mono, "")
    lambda_handler(test_stream_tca, "")
