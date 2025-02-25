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
BEDROCK_MODEL_REASONING_ID = os.environ.get("BEDROCK_MODEL_REASONING_ID","")
BEDROCK_ENDPOINT_URL = os.environ.get("ENDPOINT_URL", f'https://bedrock-runtime.{AWS_REGION}.amazonaws.com')
LLM_TABLE_NAME = os.getenv('LLM_TABLE_NAME')

MAX_TOKENS = int(os.getenv('MAX_TOKENS','256'))

lambda_client = boto3.client('lambda')
bedrock_client = None
s3Client = boto3.client('s3')
dynamodb_client = boto3.client('dynamodb')

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
    client = boto3.client(
        service_name='bedrock-runtime', 
        region_name=AWS_REGION, 
        endpoint_url=BEDROCK_ENDPOINT_URL,
        config=Config(retries={'max_attempts': 50, 'mode': 'adaptive'})
    )
    return client

def get_bedrock_generate_text(response):
    generated_text = response["output"]["message"]["content"][0]["text"]
    generated_text = generated_text.replace('```','')
    return generated_text

def call_bedrock(prompt, temperature, max_tokens):
    global bedrock_client
    modelId = BEDROCK_MODEL_ID

    print(f"Bedrock request - ModelId: {modelId} Temperature: {temperature} Max Tokens: {max_tokens}")
    
    if (bedrock_client is None):
        bedrock_client = get_bedrock_client()

    message = {
        "role": "user",
        "content": [{"text": prompt}]
    }

    response = bedrock_client.converse(
        modelId=modelId,
        messages=[message],
        inferenceConfig={
            "maxTokens": max_tokens,
            "temperature": temperature
        }
    )
    
    generated_text = get_bedrock_generate_text(response)
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
                templates.append({ k_stripped:prompt })
    except Exception as e:
        print ("Exception:", e)
        raise (e)
    return templates

def get_speaker_validation_prompt_from_dynamodb():
    """
    Gets the speaker validation prompt from DynamoDB.
    Similar to get_templates_from_dynamodb() but specific for speaker validation.
    """
    try:
        # Get the template from DynamoDB
        SPEAKER_PROMPT_TEMPLATE = dynamodb_client.get_item(
            Key={'LLMPromptTemplateId': {'S': 'LLMPromptSpeakerTemplate'}},
            TableName=LLM_TABLE_NAME
        )
        
        prompt = SPEAKER_PROMPT_TEMPLATE["Item"].get('SpeakerPrompt', {}).get('S', '')
                
        if not prompt:
            raise Exception("No speaker validation prompt found in DynamoDB")
            
        # Replace encoded line breaks if they exist
        prompt = prompt.replace("<br>", "\n")
        
        return prompt
        
    except Exception as e:
        print("Exception getting speaker prompt:", e)
        # Return a default prompt in case of error
        return """Please analyze this conversation and determine if the speakers are correctly labeled as AGENT and CUSTOMER. 
                 Return a JSON with {{"isCorrect": boolean, "confidence": float}} where confidence is between 0 and 1."""
    
def generate_speaker_validation(transcript, bedrock_client=None):
    """
    Validates speaker roles in call transcripts using Amazon Bedrock.
    
    Args:
        prompt (str): The formatted prompt containing transcript and requirements
        bedrock_client (boto3.client, optional): Pre-configured Bedrock client
        
    Returns:
        dict: Contains isCorrect (bool) and confidence (float) values
    """
    try:
        base_prompt = get_speaker_validation_prompt_from_dynamodb()
        full_prompt = base_prompt.replace("{transcript}", transcript)
        
        clean_prompt = modify_prompt_based_on_model(BEDROCK_MODEL_REASONING_ID, full_prompt)
        
        parameters = {
            "temperature": 0,
            "top_p": 1, 
            "max_tokens": 256  
        }
        
        # Initialize Bedrock client if not provided
        if not bedrock_client:
            bedrock_client = get_bedrock_client()
            
        try:            
            body = get_bedrock_request_body(BEDROCK_MODEL_REASONING_ID, parameters, clean_prompt)

            print(f"Calling Bedrock with prompt: {clean_prompt}")
            response = bedrock_client.invoke_model(
                body=json.dumps(body),
                modelId=BEDROCK_MODEL_REASONING_ID,
                accept='application/json',
                contentType='application/json'
            )
            print(f"Bedrock model: {BEDROCK_MODEL_REASONING_ID}")
            generated_text = get_bedrock_generate_text(BEDROCK_MODEL_REASONING_ID, response)
            print(f"Bedrock response: {response} and {type(generated_text)} and {generated_text}")

            json_str = generated_text[generated_text.find('{'):generated_text.rfind('}')+1]
            return json.loads(json_str)            
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing Bedrock response: {e}")
            return {"isCorrect": True, "confidence": 0.85}
            
        except Exception as e:
            print(f"Error calling Bedrock: {e}")
            return {"isCorrect": True, "confidence": 0.85}
            
    except Exception as e:
        print(f"Unexpected error in speaker validation: {e}")
        return {"isCorrect": True, "confidence": 0.85}

def get_conflict_prompt_from_dynamodb():
    """
    Gets the conflict detection prompt from DynamoDB.
    """
    try:
        # Get the template from DynamoDB
        CONFLICT_PROMPT_TEMPLATE = dynamodb_client.get_item(
            Key={'LLMPromptTemplateId': {'S': 'LLMCallConflictTemplate'}},
            TableName=LLM_TABLE_NAME
        )
        
        prompt = CONFLICT_PROMPT_TEMPLATE["Item"].get('ConflictPrompt', {}).get('S', '')
                
        if not prompt:
            raise Exception("No conflict detection prompt found in DynamoDB")
            
        # Replace encoded line breaks if they exist
        prompt = prompt.replace("<br>", "\n")
        
        return prompt
        
    except Exception as e:
        print("Exception getting conflict prompt:", e)
        # Return a default prompt in case of error
        return """Given the transcript of a conversation, analyze it for signs of connection issues, such as:
                 - Multiple repeated greetings ("hello")
                 - Explicit connection verification phrases ("can you hear me")
                 - Voicemail messages
                 If at least two of these patterns are found, classify it as having connection issues.
                 IMPORTANT: RETURN ONLY a JSON with two fields:
                 'hasConflict': boolean indicating if issues were detected
                 'confidence': float between 0 and 1 indicating the detection confidence level
                 Transcript: {transcript}"""

def generate_conflict_validation(transcript, bedrock_client=None):
    """
    Validates conflicts in transcripts using Amazon Bedrock.
    
    Args:
        transcript (str): The transcript to analyze
        bedrock_client (boto3.client, optional): Pre-configured Bedrock client
        
    Returns:
        dict: Contains hasConflict (bool) and confidence (float)
    """
    try:
        base_prompt = get_conflict_prompt_from_dynamodb()
        full_prompt = base_prompt.replace("{transcript}", transcript)
        
        clean_prompt = modify_prompt_based_on_model(BEDROCK_MODEL_REASONING_ID, full_prompt)
        
        parameters = {
            "temperature": 0,
            "top_p": 1, 
            "max_tokens": 256
        }
        
        # Initialize Bedrock client if not provided
        if not bedrock_client:
            bedrock_client = get_bedrock_client()
            
        try:
            body = get_bedrock_request_body(BEDROCK_MODEL_REASONING_ID, parameters, clean_prompt)

            print(f"Calling Bedrock with prompt: {clean_prompt}")
            response = bedrock_client.invoke_model(
                body=json.dumps(body),
                modelId=BEDROCK_MODEL_REASONING_ID,
                accept='application/json',
                contentType='application/json'
            )
            print(f"Bedrock model: {BEDROCK_MODEL_REASONING_ID}")
            generated_text = get_bedrock_generate_text(BEDROCK_MODEL_REASONING_ID, response)
            print(f"Bedrock response: {generated_text}")

            # Extract JSON from the response
            json_str = generated_text[generated_text.find('{'):generated_text.rfind('}')+1]
            return json.loads(json_str)
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing Bedrock response: {e}")
            return {"hasConflict": False, "confidence": 0.85}
            
        except Exception as e:
            print(f"Error calling Bedrock: {e}")
            return {"hasConflict": False, "confidence": 0.85}
            
    except Exception as e:
        print(f"Unexpected error in conflict validation: {e}")
        return {"hasConflict": False, "confidence": 0.85}


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
    templates = get_templates_from_dynamodb()
    result = {}
    for item in templates:
        key = list(item.keys())[0]

        prompt = item[key] 
        # Quick fix for Titan
        prompt = modify_prompt_based_on_model(BEDROCK_MODEL_ID, prompt)

        if key == 'Summary' and SUMMARIZE_TYPE == 'BEDROCK+TCA' and api_mode == cf.API_ANALYTICS:
            continue
        else: 
            prompt = prompt.replace("{transcript}", transcript)
            generated_text = call_bedrock(prompt, 0, MAX_TOKENS)
            result[key] = generated_text
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

    if event.get('operation') == 'SPEAKER_DETECTION':
        return generate_speaker_validation(event['transcript'])
    elif event.get('operation') == 'SPEAKER_CONFLICT':
        return generate_conflict_validation(event['transcript'])
    
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
        except Exception as err:
            summary = 'An error occurred generating Anthropic summary.'
            print(err)
    elif SUMMARIZE_TYPE == 'BEDROCK' or SUMMARIZE_TYPE == 'BEDROCK+TCA':
        try:
            summary = generate_bedrock_summary(transcript_str, pca_results.analytics.transcribe_job.api_mode)
            try: 
                summary_json = json.loads(summary)
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
