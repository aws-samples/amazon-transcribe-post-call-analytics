import boto3
import cfnresponse
import json

def lambda_handler(event, context):
    # Init ...
    the_event = event['RequestType']
    llm_prompt_summary_template = {
        "Summary":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is a summary of the transcript?</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Topic":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is the topic of the call? For example, iphone issue, billing issue, cancellation. Only reply with the topic, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Product":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What product did the customer call about? For example, internet, broadband, mobile phone, mobile plans. Only reply with the product, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Resolved":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Did the agent resolve the customer's questions? Only reply with yes or no, nothing more. </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Callback":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was this a callback? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Politeness":"<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was the agent polite and professional? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
        "Actions":"<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What actions did the Agent take? </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:"
    }

    print("The event is: ", str(the_event))

    table_name = event['ResourceProperties']['TableName']
    response_data = {}
    dynamodb_client = boto3.client('dynamodb')
    ssm_client = boto3.client('ssm')

    # First look if LLMPromptSummaryTemplate parameter exists in the Parameter Store, so we can
    # migrate the template to DynamoDB. This is to preserve backwards compatibility when users
    # update their stack.

    try:
        summary_prompt_template = ssm_client.get_parameter(Name="LLMPromptSummaryTemplate")["Parameter"]["Value"]
    except Exception as e:
        print("No parameter found:", str(e))
        summary_prompt_template = llm_prompt_summary_template

    try:
        if the_event in ('Create'):
            response = dynamodb_client.put_item(Item={
                'LLMPromptTemplateId': {'S': 'LLMPromptSummaryTemplate'},
                'LLMPromptValue': {'S': json.dumps(summary_prompt_template)}
            },
                TableName=table_name)

        # Everything OK... send the signal back
        print("Operation successful!")
        cfnresponse.send(event,
                         context,
                         cfnresponse.SUCCESS,
                         response_data)
    except Exception as e:
        print("Operation failed...")
        print(str(e))
        response_data['Data'] = str(e)
        cfnresponse.send(event,
                         context,
                         cfnresponse.FAILED,
                         response_data)