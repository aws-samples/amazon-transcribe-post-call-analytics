"""
This python function is part of the main processing workflow.  It contains a number of common functions that other
python functions in this application need to share.

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import os


def generate_job_name(key):
    """
    Transcribe job names cannot contain spaces.  This takes in an S3
    object key, extracts the filename part, replaces spaces with "-"
    characters and returns that as the job-name to use
    """

    # Get rid of leading path, and replace [SPACE] with "-", replace "/" with "-", , replace ":" with "-"
    response = key
    if "/" in key:
        response = response[1 + key.find("/") :]
    response = response.replace("/", "-")
    response = response.replace(" ", "-")
    response = response.replace(":", "-")
    return response


def remove_temp_file(file_path):
    """
    Checks if the specified file exists and deletes it if it does

    @param file_path: Path to the file to be deleted
    """
    # Delete the file if it exists
    if os.path.exists(file_path):
        os.remove(file_path)
