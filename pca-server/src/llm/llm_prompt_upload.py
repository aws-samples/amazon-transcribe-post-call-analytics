import boto3
import cfnresponse
import json

def lambda_handler(event, context):
    # Init ...
    the_event = event['RequestType']
    print("The event is: ", str(the_event))

    table_name = event['ResourceProperties']['TableName']
    llm_prompt_summary_template = event['ResourceProperties']['LLMPromptSummaryTemplate']
    llm_prompt_query_template = event['ResourceProperties']['LLMPromptQueryTemplate']

    response_data = {}
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)
    ssm_client = boto3.client('ssm')

    # First look if LLMPromptSummaryTemplate parameter exists in the Parameter Store, so we can
    # migrate the template to DynamoDB. This is to preserve backwards compatibility when users
    # update their stack.

    try:
        summary_prompt_template = ssm_client.get_parameter(Name="LLMPromptSummaryTemplate")["Parameter"]["Value"]
    except Exception as e:
        print("No parameter found:", str(e))
        summary_prompt_template = json.dumps(llm_prompt_summary_template)

    try:
      summary_prompt_template = json.loads(summary_prompt_template)
    except Exception as e:
      print("Not a valid JSON:", str(e))
      summary_prompt_template = {"Summary": summary_prompt_template}

    update_expression = "SET"
    expression_attribute_names = {}
    expression_attribute_values = {}

    i = 1
    for key, value in summary_prompt_template.items():
        update_expression += f" #{i} = :{i},"
        expression_attribute_names[f"#{i}"] = f"{i}#{key}"
        expression_attribute_values[f":{i}"] = value
        i += 1

    update_expression = update_expression[:-1] # remove last comma

    # Next look if LLMPromptQueryTemplate parameter exists in the Parameter Store, so we can
    # migrate the template to DynamoDB. This is to preserve backwards compatibility when users
    # update their stack.

    try:
        query_prompt_template = ssm_client.get_parameter(Name="LLMPromptQueryTemplate")["Parameter"]["Value"]
    except Exception as e:
        print("No parameter found:", str(e))
        query_prompt_template = llm_prompt_query_template

    try:
        if the_event in ('Create'):
          response = table.update_item(
                      Key={'LLMPromptTemplateId': 'LLMPromptSummaryTemplate'},
                      UpdateExpression=update_expression,
                      ExpressionAttributeValues=expression_attribute_values,
                      ExpressionAttributeNames=expression_attribute_names
                    )

          item = {
            'LLMPromptTemplateId': 'LLMPromptQueryTemplate',
            'LLMPromptTemplateValue': query_prompt_template
          }

          response = table.put_item(Item=item)

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