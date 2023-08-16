"""
This python function is part of the main processing workflow.
It performs summarization of the call if summarization was enabled.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
import pcaconfiguration as cf
import pcaresults
import json
import re
import requests

SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'DISABLED')
ANTHROPIC_MODEL_IDENTIFIER = os.getenv('ANTHROPIC_MODEL_IDENTIFIER', 'claude-instant-v1-100k')
ANTHROPIC_ENDPOINT_URL = os.getenv('ANTHROPIC_ENDPOINT_URL','')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY','')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
SUMMARY_PROMPT_TEMPLATE = os.getenv('SUMMARY_PROMPT_TEMPLATE',"<br><br>Human:<br>{transcript}<br><br>Summarize the above transcript in no more than 5 sentences, using gender neutral pronouns. Were the caller's needs met during the call?<br><br>Assistant: Here is a summary in 5 sentences:")
SUMMARY_LAMBDA_ARN = os.getenv('SUMMARY_LAMBDA_ARN','')
FETCH_TRANSCRIPT_LAMBDA_ARN = os.getenv('FETCH_TRANSCRIPT_LAMBDA_ARN','')

lambda_client = boto3.client('lambda')

def generate_sagemaker_summary(transcript):
    summary = 'An error occurred generating Sagemaker summary.'
    endpoint = os.getenv('SUMMARY_SAGEMAKER_ENDPOINT','')
    runtime = boto3.Session().client('sagemaker-runtime')
    payload = {'inputs': transcript}

    response = runtime.invoke_endpoint(EndpointName=endpoint, 
        ContentType='application/json',
        Body=bytes(json.dumps(payload), 'utf-8'))
    result = json.loads(response['Body'].read().decode())
    
    if len(result) > 0:
        summaryResult = result[0]
        # print("Summary: " + summary["generated_text"])
        summary = summaryResult["generated_text"]
    else:
        print("No Summary")
        summary = "No summary"
    return summary

def generate_anthropic_summary(transcript):
    prompt = SUMMARY_PROMPT_TEMPLATE.replace("<br>", "\n").replace("{transcript}", transcript)
    print("Prompt: ",prompt)
    data = {
        "prompt": prompt,
        "model": ANTHROPIC_MODEL_IDENTIFIER,
        "max_tokens_to_sample": 512,
        "stop_sequences": ["Human:", "Assistant:"]
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "content-type": "application/json"
    }
    response = requests.post(ANTHROPIC_ENDPOINT_URL, headers=headers, data=json.dumps(data))
    print("API Response:", response)
    summary = json.loads(response.text)["completion"].strip()
    print("Summary: ", summary)
    return summary

def get_transcript_str(interimResultsFile):
    payload = {
        'interimResultsFile': interimResultsFile,
        'processTranscript': True, 
        'tokenCount': TOKEN_COUNT 
    }
    print(payload)
    transcript_response = lambda_client.invoke(
        FunctionName=FETCH_TRANSCRIPT_LAMBDA_ARN,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload)
    )
    transcript_data = transcript_response['Payload'].read().decode()
    transcript_json = json.loads(transcript_data)
    print(transcript_json)
    return transcript_json['transcript']

def generate_custom_lambda_summary(interimResultsFile):
    payload = {
        'interimResultsFile': interimResultsFile,
    }
    print(payload)
    lambda_response = lambda_client.invoke(
        FunctionName=SUMMARY_LAMBDA_ARN,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload)
    )
    response_data = lambda_response['Payload'].read().decode()
    response_json = json.loads(response_data)
    print(response_json)
    return response_json

def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """
    
    print(event)

    # Load our configuration data
    cf.loadConfiguration()

    # Load in our existing interim CCA results
    pca_results = pcaresults.PCAResults()
    pca_results.read_results_from_s3(cf.appConfig[cf.CONF_S3BUCKET_OUTPUT], event["interimResultsFile"])

    # --------- Summarize Here ----------
    summary = 'No Summary Available'
    transcript_str = get_transcript_str(event["interimResultsFile"])
    summary_json = None

    if SUMMARIZE_TYPE == 'SAGEMAKER':
        try:
            summary = generate_sagemaker_summary(transcript_str)
        except:
            summary = 'An error occurred generating a Sagemaker summary.'
    elif SUMMARIZE_TYPE == 'ANTHROPIC':
        try:
            summary = generate_anthropic_summary(transcript_str)
            try: 
                summary_json = json.loads(summary)
            except:
                print('no json detected in summary.')
        except:
            summary = 'An error occurred generating Anthropic summary.'
    elif SUMMARIZE_TYPE == 'LAMBDA':
        try:
            summary_json = generate_custom_lambda_summary(event["interimResultsFile"])
        except:
            summary = 'An error occurred generating summary with custom Lambda function'
    else:
        summary = 'Summarization disabled.'
    
    if summary_json:
        pca_results.analytics.summary = summary_json
    else:
        pca_results.analytics.summary['Summary'] = summary
    print("Summary: " + summary)
    
    # Write out back to interim file
    pca_results.write_results_to_s3(bucket=cf.appConfig[cf.CONF_S3BUCKET_OUTPUT],
                                    object_key=event["interimResultsFile"])

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
