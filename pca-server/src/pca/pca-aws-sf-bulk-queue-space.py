"""
This python function is part of the bulk files workflow.  Checks the current state of the Transcribe job queue,
taking into account running and queued jobs.  It then returns the calculated head-space in the queue that the
Bulk process is able to use.  If any of the API calls to Transcribe or S3 get throttled then we say the queue
is full this cycle and carry on

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
"""
import copy
import boto3


def countTranscribeJobsInState(status, client, filesLimit):
    """
    Queries Transcribe for the number of jobs with the given status.  If there are more than 100
    then this will need multiple queries until we build up the total. If we reach or overshoot
    a specific limit (effectively the queue limit) then stop counting
    """
    response = client.list_transcription_jobs(Status=status)
    found = len(response["TranscriptionJobSummaries"])
    while ("NextToken" in response) and (found <= filesLimit):
        response = client.list_transcription_jobs(Status=status, NextToken=response["NextToken"])
        found += len(response["TranscriptionJobSummaries"])

    return found


def lambda_handler(event, context):

    # Load our event, but we no longer need "filesToMove"
    sfData = copy.deepcopy(event)
    filesLimit = sfData["filesLimit"]
    sfData.pop("filesToMove", None)

    # Count the number of IN_PROGRESS and QUEUED Transcribe jobs
    transcribeClient = boto3.client("transcribe")
    try:
        inProgress = countTranscribeJobsInState("IN_PROGRESS", transcribeClient, filesLimit)
        queued = countTranscribeJobsInState("QUEUED", transcribeClient, (filesLimit - inProgress))
        found = inProgress + queued
    except Exception as e:
        # This COULD exception through throttling - in which case
        # we just say that the queue is full this time and go round
        found = filesLimit

    # Return current event data with the headroom left in our queue limit
    sfData["queueSpace"] = max(0, (filesLimit - found))
    return sfData


if __name__ == "__main__":
    event = {
        ''
        "sourceBucket": "pca-bulk-upload",
        "targetBucket": "pca-raw-audio-1234",
        "targetAudioKey": "nci",
        "filesLimit": 250,
        "dripRate": 50,
        "filesProcessed": 0,
        "filesToMove": 2
    }
    lambda_handler(event, "")

