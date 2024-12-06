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
from botocore.exceptions import ClientError
from botocore.config import Config


AWS_REGION = os.environ["AWS_REGION_OVERRIDE"] if "AWS_REGION_OVERRIDE" in os.environ else os.environ["AWS_REGION"]
SUMMARIZE_TYPE = os.getenv('SUMMARY_TYPE', 'DISABLED')
ANTHROPIC_MODEL_IDENTIFIER = os.getenv('ANTHROPIC_MODEL_IDENTIFIER', 'claude-instant-1')
ANTHROPIC_ENDPOINT_URL = os.getenv('ANTHROPIC_ENDPOINT_URL','')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY','')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
SUMMARY_LAMBDA_ARN = os.getenv('SUMMARY_LAMBDA_ARN','')
FETCH_TRANSCRIPT_LAMBDA_ARN = os.getenv('FETCH_TRANSCRIPT_LAMBDA_ARN','')
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID","amazon.titan-text-express-v1")
BEDROCK_ENDPOINT_URL = os.environ.get("ENDPOINT_URL", f'https://bedrock-runtime.{AWS_REGION}.amazonaws.com')
LLM_TABLE_NAME = os.getenv('LLM_TABLE_NAME')

MAX_TOKENS = int(os.getenv('MAX_TOKENS','256'))

lambda_client = boto3.client('lambda')
bedrock_client = None
s3Client = boto3.client('s3')
dynamodb_client = boto3.client('dynamodb')

config = Config(
   retries = {
      'max_attempts': 100,
      'mode': 'adaptive'
   }
)

def get_third_party_llm_secret():
    print("Getting API key from Secrets Manager")
    secrets_client = boto3.client('secretsmanager')
    try:
        response = secrets_client.get_secret_value(
            SecretId=ANTHROPIC_API_KEY
        )
    except ClientError as e:
        raise e
    api_key = response['SecretString']
    return api_key

def get_bedrock_client():
    print("Connecting to Bedrock Service: ", BEDROCK_ENDPOINT_URL)
    client = boto3.client(service_name='bedrock-runtime', region_name=AWS_REGION, endpoint_url=BEDROCK_ENDPOINT_URL, config=config)
    return client
    
def get_bedrock_request_body(modelId, parameters, prompt):
    provider = modelId.split(".")[0]
    request_body = None
    if provider == "anthropic":
        if 'claude-3' in modelId:
            request_body = {
                "max_tokens": MAX_TOKENS,
                "messages": [{"role": "user", "content": prompt}],
                "anthropic_version": "bedrock-2023-05-31"
            }
        else:    
            request_body = {
                "prompt": prompt,
                "max_tokens_to_sample": MAX_TOKENS
            } 
        request_body.update(parameters)
    elif provider == "ai21":
        request_body = {
            "prompt": prompt,
            "maxTokens": MAX_TOKENS
        }
        request_body.update(parameters)
    elif provider == "amazon":
        textGenerationConfig = {
            "maxTokenCount": MAX_TOKENS
        }
        textGenerationConfig.update(parameters)
        request_body = {
            "inputText": prompt,
            "textGenerationConfig": textGenerationConfig
        }
    else:
        raise Exception("Unsupported provider: ", provider)
    return request_body

def get_bedrock_generate_text(modelId, response):
    print("generating response with ", modelId)
    provider = modelId.split(".")[0]
    generated_text = None
    if provider == "anthropic":
        if 'claude-3' in modelId:
            response_raw = json.loads(response.get("body").read().decode())
            generated_text = response_raw.get('content')[0].get('text')

        else:
            response_body = json.loads(response.get("body").read().decode())
            generated_text = response_body.get("completion")
    elif provider == "ai21":
        response_body = json.loads(response.get("body").read())
        generated_text = response_body.get("completions")[0].get("data").get("text")
    elif provider == "amazon":
        response_body = json.loads(response.get("body").read())
        generated_text = response_body.get("results")[0].get("outputText")
    else:
        raise Exception("Unsupported provider: ", provider)
    generated_text = generated_text.replace('```','')
    return generated_text

def call_bedrock(parameters, prompt):
    global bedrock_client
    modelId = BEDROCK_MODEL_ID
    body = get_bedrock_request_body(modelId, parameters, prompt)
    print("ModelId", modelId, "-  Body: ", body)
    if (bedrock_client is None):
        bedrock_client = get_bedrock_client()
    response = bedrock_client.invoke_model(body=json.dumps(body), modelId=modelId, accept='application/json', contentType='application/json')
    generated_text = get_bedrock_generate_text(modelId, response)
    return generated_text

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

def get_templates_from_dynamodb():
    templates = []
    try:
        SUMMARY_PROMPT_TEMPLATE = dynamodb_client.get_item(Key={'LLMPromptTemplateId': {'S': 'LLMPromptSummaryTemplate'}},
                                                     TableName=LLM_TABLE_NAME)

        print ("Prompt Template:", SUMMARY_PROMPT_TEMPLATE['Item'])

        prompt_templates = SUMMARY_PROMPT_TEMPLATE["Item"]

        for k in sorted(prompt_templates):
            if (k != "LLMPromptTemplateId"):
                prompt = prompt_templates[k]['S'].replace("<br>", "\n")
                index = k.find('#')
                k_stripped = k[index+1:]
                templates.append({'key': k_stripped, 'prompt': prompt, 'source': 'TemplateQuality'})
    except Exception as e:
        print ("Exception:", e)
        raise (e)
    return templates

def get_templates_from_dynamodb_v2():
    templates = []
    try:
        SUMMARY_PROMPT_TEMPLATE = dynamodb_client.get_item(Key={'LLMPromptTemplateId': {'S': 'LLMPromptVOCSummaryTemplate'}},
                                                     TableName=LLM_TABLE_NAME)

        print ("Prompt Template:", SUMMARY_PROMPT_TEMPLATE['Item'])

        prompt_templates = SUMMARY_PROMPT_TEMPLATE["Item"]

        for k in sorted(prompt_templates):
            if (k != "LLMPromptTemplateId"):
                prompt = prompt_templates[k]['S'].replace("<br>", "\n")
                index = k.find('#')
                k_stripped = k[index+1:]
                templates.append({'key': k_stripped, 'prompt': prompt, 'source': 'TemplateVOC'})
    except Exception as e:
        print ("Exception:", e)
        raise (e)
    return templates

def get_summary_key_value_from_dynamodb():
    key_value_results = {}
    try:
        response = dynamodb_client.get_item(
            Key={'LLMPromptTemplateId': {'S': 'LLMPromptSummaryKeyValue'}},
            TableName=LLM_TABLE_NAME
        )

        print("Prompt Name:", response['Item'])

        prompt_templates = response["Item"]

        for k, v in prompt_templates.items():
            if k != "LLMPromptTemplateId":
                key_value_results[k] = v['S'].replace("<br>", "\n")
    except Exception as e:
        print("Exception:", e)
        raise e

    return key_value_results

def generate_anthropic_summary(transcript):

    # first check to see if this is one prompt, or many prompts as a json
    templates = get_templates_from_dynamodb()
    result = {}
    for item in templates:
        key = list(item.keys())[0]
        prompt = item[key]
        prompt = prompt.replace("{transcript}", transcript)
        data = {
            "prompt": prompt,
            "model": ANTHROPIC_MODEL_IDENTIFIER,
            "max_tokens_to_sample": 512,
            "stop_sequences": ["Human:", "Assistant:"]
        }
        headers = {
            "x-api-key": get_third_party_llm_secret(),
            "content-type": "application/json"
        }
        response = requests.post(ANTHROPIC_ENDPOINT_URL, headers=headers, data=json.dumps(data))
        print("API Response:", response)
        summary = json.loads(response.text)["completion"].strip()
        result[key] = summary
    if len(result.keys()) == 1:
        # This is a single node JSON with value that can be either:
        # A single inference that returns a string value
        # OR
        # A single inference that returns a JSON, enclosed in a string.
        # Refer to https://github.com/aws-samples/amazon-transcribe-post-call-analytics/blob/develop/docs/generative_ai.md#generative-ai-insights
        # for more details.
        try:
            parsed_json = json.loads(result[list(result.keys())[0]])
            print("Nested JSON...")
            return json.dumps(parsed_json)
        except:
            print("Not nested JSON...")
            return json.dumps(result)
    return json.dumps(result)

def generate_bedrock_summary(transcript, api_mode):

    # first check to see if this is one prompt, or many prompts as a json
    templates = get_templates_from_dynamodb() + get_templates_from_dynamodb_v2()
    qualityResult = {}
    vocResult = {}
    for item in templates:
        key = item['key']
        prompt = item['prompt']
        source = item['source']

        # Quick fix for Titan
        prompt = modify_prompt_based_on_model(BEDROCK_MODEL_ID, prompt)

        if key == 'Summary' and SUMMARIZE_TYPE == 'BEDROCK+TCA' and api_mode == cf.API_ANALYTICS:
            continue
        else: 
            prompt = prompt.replace("{transcript}", transcript)
            parameters = {
                "temperature": 0
            }
            generated_text = call_bedrock(parameters, prompt)
            if source == 'TemplateQuality':
                qualityResult[key] = generated_text
            else:
                vocResult[key] = generated_text
    if len(qualityResult.keys()) == 1:
        # This is a single node JSON with value that can be either:
        # A single inference that returns a string value
        # OR
        # A single inference that returns a JSON, enclosed in a string.
        # Refer to https://github.com/aws-samples/amazon-transcribe-post-call-analytics/blob/develop/docs/generative_ai.md#generative-ai-insights
        # for more details.
        try:
            parsed_json = json.loads(qualityResult[list(qualityResult.keys())[0]])
            print("Nested JSON...")
            return json.dumps(parsed_json)
        except:
            print("Not nested JSON...")
            return json.dumps(qualityResult), json.dumps(vocResult)
    return json.dumps(qualityResult), json.dumps(vocResult)

def modify_prompt_based_on_model(model_id, prompt):
    if model_id == "amazon.titan-text-express-v1":
        prompt = prompt.replace("Human:", "")
        prompt = prompt.replace("Assistant:", "")
    return prompt

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
    voc_summary = 'No VOC Summary Available'
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
        except Exception as err:
            summary = 'An error occurred generating Anthropic summary.'
            print(err)
    elif SUMMARIZE_TYPE == 'BEDROCK' or SUMMARIZE_TYPE == 'BEDROCK+TCA':
        try:
            summary, voc_summary = generate_bedrock_summary(transcript_str, pca_results.analytics.transcribe_job.api_mode)
            try: 
                summary_json = json.loads(summary)
                voc_summary_json = json.loads(voc_summary)
            except:
                print('no json detected in summary.')
        except Exception as err:
            summary = 'An error occurred generating Bedrock summary.'
            print(err)
    elif SUMMARIZE_TYPE == 'LAMBDA':
        try:
            summary_json = generate_custom_lambda_summary(event["interimResultsFile"])
        except Exception as err:
            summary = 'An error occurred generating summary with custom Lambda function'
            print(err)
    elif SUMMARIZE_TYPE == 'TCA-ONLY':
        print("Skip summary due to TCA")
    else:
        summary = 'Summarization disabled.'
    
    if summary_json:
        pca_results.analytics.summary = summary_json
        print("Summary JSON: " + summary)
    elif SUMMARIZE_TYPE != 'TCA-ONLY':
        pca_results.analytics.summary = {}
        pca_results.analytics.summary['Summary'] = summary
        print("Summary: " + summary)

    if voc_summary_json:
        pca_results.analytics.voc_summary = voc_summary_json
        print("Summary JSON: " + voc_summary)
    elif SUMMARIZE_TYPE != 'TCA-ONLY':
        pca_results.analytics.voc_summary = {}
        pca_results.analytics.voc_summary['VOCSummary'] = voc_summary
        print("VOCSummary: " + voc_summary)
    # Try to get key value template from DynamoDB for match with summary title prompts    
    try:
        summary_key_value = get_summary_key_value_from_dynamodb()
        pca_results.analytics.summary_key_value = summary_key_value
        print("Summary Key-Value: ", summary_key_value)
    except Exception as err:
        print("An error occurred fetching summary key-value from DynamoDB")
        print(err)
    
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
