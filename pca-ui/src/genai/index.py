"""
This python function is part of the main processing workflow.
It performs summarization of the call if summarization was enabled.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
import json
import re
import requests
import urllib.parse
from botocore.exceptions import ClientError

AWS_REGION = os.environ["AWS_REGION_OVERRIDE"] if "AWS_REGION_OVERRIDE" in os.environ else os.environ["AWS_REGION"]
QUERY_TYPE = os.getenv('QUERY_TYPE', 'DISABLED')
ANTHROPIC_MODEL_IDENTIFIER = os.getenv('ANTHROPIC_MODEL_IDENTIFIER', 'claude-instant-v1-100k')
ANTHROPIC_ENDPOINT_URL = os.getenv('ANTHROPIC_ENDPOINT_URL','')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY','')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
LLM_QUERY_LAMBDA_ARN = os.getenv('LLM_QUERY_LAMBDA_ARN','')
FETCH_TRANSCRIPT_LAMBDA_ARN = os.getenv('FETCH_TRANSCRIPT_LAMBDA_ARN','')
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID","amazon.titan-tg1-large")
BEDROCK_ENDPOINT_URL = os.getenv("ENDPOINT_URL", f'https://bedrock.{AWS_REGION}.amazonaws.com')
CONF_LLM_PROMPT_QUERY_TEMPLATE = os.getenv("CONF_LLM_PROMPT_QUERY_TEMPLATE","LLMPromptQueryTemplate")
MAX_TOKENS = int(os.getenv('MAX_TOKENS','256'))

lambda_client = boto3.client('lambda')
ssmClient = boto3.client("ssm")
bedrock_client = None

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
    client = boto3.client(service_name='bedrock', region_name=AWS_REGION, endpoint_url=BEDROCK_ENDPOINT_URL)
    return client
    
def get_bedrock_request_body(modelId, parameters, prompt):
    provider = modelId.split(".")[0]
    request_body = None
    if provider == "anthropic":
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

def get_template_from_ssm():
    try:
        prompt_template = ssmClient.get_parameter(Name=CONF_LLM_PROMPT_QUERY_TEMPLATE)["Parameter"]["Value"]
        prompt_template = prompt_template.replace("<br>", "\n")
    except:
       prompt_template = "Human: Answer the following question in 1 sentence based on the transcript. If the question is not relevant to the transcript, reply with I'm sorry, this is not relevant. \n<question>{question}</question>\n\n<transcript>\n{transcript}</transcript>\n\nAssistant: Based on the transcript: "
    return prompt_template

def generate_anthropic_query(transcript, question):

    # first check to see if this is one prompt, or many prompts as a json
    prompt = get_template_from_ssm()

    prompt = prompt.replace("{transcript}", transcript)
    prompt = prompt.replace("{question}", question)
    print("Prompt:", prompt)
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
    # print("API Response:", response)
    summary_json = json.loads(response.text)
    # print(summary_json)
    summary = summary_json["completion"].strip()
    
    return summary


def generate_bedrock_query(transcript, question):

    # first check to see if this is one prompt, or many prompts as a json
    prompt = get_template_from_ssm()

    prompt = prompt.replace("{transcript}", transcript)
    prompt = prompt.replace("{question}", question)
    parameters = {
        "temperature": 0
    }
    generated_text = call_bedrock(parameters, prompt)

    return generated_text

def get_transcript_str(call_filename):
    payload = {
        'interimResultsFile': call_filename,
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

def generate_custom_lambda_query(call_filename, question):
    payload = {
        'interimResultsFile': call_filename,
    }
    print(payload)
    lambda_response = lambda_client.invoke(
        FunctionName=LLM_QUERY_LAMBDA_ARN,
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
    
    queryStringParameters = event['queryStringParameters']
    pathParameters = event['pathParameters']
    
    # Access the values of the query string parameters
    filename = urllib.parse.unquote(queryStringParameters['filename'])
    query_str = urllib.parse.unquote(queryStringParameters['query'])


    # --------- Summarize Here ----------
    transcript_str = get_transcript_str(filename)

    if QUERY_TYPE == 'ANTHROPIC':
        try:
            query_response = generate_anthropic_query(transcript_str, query_str)
        except Exception as err:
            query_response = 'An error occurred generating Anthropic query response.'
            print(err)
    elif QUERY_TYPE == 'BEDROCK':
        try:
            query_response = generate_bedrock_query(transcript_str, query_str)
        except Exception as err:
            query_response = 'An error occurred generating Bedrock query response.'
            print(err)
    elif QUERY_TYPE == 'LAMBDA':
        try:
            query_response = generate_custom_lambda_query(event["filename"], query_str)
        except Exception as err:
            query_response = 'An error occurred generating summary with custom Lambda function'
            print(err)
    else:
        query_response = 'Query response disabled.'
    print("Answer:", query_response)
    response = {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
            "Content-Type": "application/json",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "OPTIONS,GET"
        },
        "body": json.dumps({
            "response":query_response
        })
    }
    return response