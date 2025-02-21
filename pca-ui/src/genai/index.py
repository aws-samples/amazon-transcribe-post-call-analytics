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
from botocore.config import Config

AWS_REGION = os.environ["AWS_REGION_OVERRIDE"] if "AWS_REGION_OVERRIDE" in os.environ else os.environ["AWS_REGION"]
QUERY_TYPE = os.getenv('QUERY_TYPE', 'DISABLED')
ANTHROPIC_MODEL_IDENTIFIER = os.getenv('ANTHROPIC_MODEL_IDENTIFIER', 'claude-instant-1')
ANTHROPIC_ENDPOINT_URL = os.getenv('ANTHROPIC_ENDPOINT_URL','')
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY','')
TOKEN_COUNT = int(os.getenv('TOKEN_COUNT', '0')) # default 0 - do not truncate.
LLM_QUERY_LAMBDA_ARN = os.getenv('LLM_QUERY_LAMBDA_ARN','')
FETCH_TRANSCRIPT_LAMBDA_ARN = os.getenv('FETCH_TRANSCRIPT_LAMBDA_ARN','')
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID","amazon.text-express-v1")
BEDROCK_ENDPOINT_URL = os.getenv("ENDPOINT_URL", f'https://bedrock-runtime.{AWS_REGION}.amazonaws.com')
LLM_TABLE_NAME = os.getenv('LLM_TABLE_NAME', '')
MAX_TOKENS = int(os.getenv('MAX_TOKENS','256'))

lambda_client = boto3.client('lambda')
dynamodb_client = boto3.client('dynamodb')
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

def get_template_from_dynamodb():
    try:
        QUERY_PROMPT_TEMPLATE = dynamodb_client.get_item(Key={'LLMPromptTemplateId': {'S': 'LLMPromptQueryTemplate'}},
                                                         TableName=LLM_TABLE_NAME)
        print ("Prompt Template:", QUERY_PROMPT_TEMPLATE['Item']['LLMPromptTemplateValue']['S'])

        prompt_template = QUERY_PROMPT_TEMPLATE["Item"]['LLMPromptTemplateValue']['S']
        prompt_template = prompt_template.replace("<br>", "\n")
    except Exception as e:
        print("Exception", e)
        prompt_template = "Human: Answer the following question in 1 sentence based on the transcript. If the question is not relevant to the transcript, reply with I'm sorry, this is not relevant. \n<question>{question}</question>\n\n<transcript>\n{transcript}</transcript>\n\nAssistant: Based on the transcript: "
    return prompt_template

def generate_anthropic_query(transcript, question):

    # first check to see if this is one prompt, or many prompts as a json
    prompt = get_template_from_dynamodb()

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
    prompt = get_template_from_dynamodb()

    prompt = prompt.replace("{transcript}", transcript)
    prompt = prompt.replace("{question}", question)

    generated_text = call_bedrock(prompt, 0, MAX_TOKENS)

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
