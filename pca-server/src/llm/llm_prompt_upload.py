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
    response_data = {}
    s_3 = boto3.client('s3')
    # Retrieve parameters
    bucket_name = event['ResourceProperties']['BucketName']
    bucket_prefix = event['ResourceProperties']['Prefix']
    object_name = event['ResourceProperties']['ObjectName']

    try:
        if the_event in ('Create', 'Update'):
            s_3.put_object(Bucket=bucket_name,
                           Key=(bucket_prefix
                                + '/' + object_name),
                           Body=json.dumps(llm_prompt_summary_template))
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