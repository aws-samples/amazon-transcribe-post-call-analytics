"""

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3
import os
import json
import urllib.parse
import cfnresponse

client = boto3.client('qbusiness')

Q_WEB_EXPERIENCE_ID = os.getenv('Q_WEB_EXPERIENCE_ID','')
Q_APPLICATION_ID = os.getenv('Q_APPLICATION_ID', '')
PCA_WEB_URI = os.getenv('PCA_WEB_URI', '')

def update_web_experience():
    """
    Update the website domain origins allowed to embed the Amazon Q Business web experience.

    Args:
    application_id (str): The identifier of the Amazon Q Business application.
    web_experience_id (str): The identifier of the Amazon Q Business web experience.
    allowed_domains (list): List of domain origins to allow.

    Returns:
    dict: The response from the UpdateWebExperience API call.
    """
    try:
        response = client.update_web_experience(
            applicationId=Q_APPLICATION_ID,
            webExperienceId=Q_WEB_EXPERIENCE_ID,
            authenticationConfiguration={
                'allowedDomainOrigins': [PCA_WEB_URI]
            }
        )
        return response
    except client.exceptions.ResourceNotFoundException as e:
        print(f"Resource not found: {e}")
    except client.exceptions.ValidationException as e:
        print(f"Validation error: {e}")
    except client.exceptions.AccessDeniedException as e:
        print(f"Access denied: {e}")
    except client.exceptions.ThrottlingException as e:
        print(f"Throttling error: {e}")
    except client.exceptions.InternalServerException as e:
        print(f"Internal server error: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    return None

def lambda_handler(event, context):
    """
    Lambda function entrypoint
    """
    response_data = {}

    try:
        update_web_experience()
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



