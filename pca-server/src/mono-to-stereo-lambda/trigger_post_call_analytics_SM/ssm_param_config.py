"""
This python function is part of the main processing workflow.  It loads in all of the configuration parameters
from the SSM Parameter Store and makes them available to all other python functions.  It also includes some helper
functions to check some logical conditions of some of these configuration parameters.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import boto3

# Parameter Store Field Names used by main workflow

COMP_SFN_NAME = "StepFunctionName"
# Configuration data
appConfig = {}


def extractParameters(ssmResponse, useTagName):
    """
    Picks out the Parameter Store results and appends the values to our
    overall 'appConfig' variable.
    """

    # Good parameters first
    for param in ssmResponse["Parameters"]:
        name = param["Name"]
        value = param["Value"]
        appConfig[name] = value

    # Now the bad/missing
    for paramName in ssmResponse["InvalidParameters"]:
        if useTagName:
            appConfig[paramName] = paramName
        else:
            appConfig[paramName] = ""


def loadConfiguration():
    """
    Loads in the configuration values from Parameter Store.  Bulk loads them in batches of 10,
    and any that are missing are set to an empty string or to the tag-name.
    """

    # Load the the core ones in from Parameter Store in batches of up to 10
    ssm = boto3.client("ssm")
    
    fullParamList2 = ssm.get_parameters(
        Names=[
            COMP_SFN_NAME,
        ]
    )
    
    # Extract our parameters into our config
   
    extractParameters(fullParamList2, False)
    

if __name__ == "__main__":
    loadConfiguration()
