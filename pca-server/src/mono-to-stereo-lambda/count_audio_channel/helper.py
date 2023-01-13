# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os
import boto3
import subprocess

def remove_temp_file(file_path):
    """
    Checks if the specified file exists and deletes it if it does

    @param file_path: Path to the file to be deleted
    """
    # Delete the file if it exists
    if os.path.exists(file_path):
        os.remove(file_path)
        
def count_audio_channels(bucket, key):
    """
    Examines an audio file using the FFPROBE utility to determine the number of audio channels in the file.  If
    any errors occurs then it will default to returning "1", implying that it has just a single channel.

    @param bucket: Bucket holding the audio file to be tested
    @param key: Key for the audio file in the bucket
    @return: Number of audio channels found in the file
    """

    # First, we need to download the original audio file
    ffmpegInputFilename = "/tmp/" + key.split('/')[-1]
    s3Client = boto3.client('s3')
    s3Client.download_file(bucket, key, ffmpegInputFilename)

    # Use ffprobe to count the number of channels in the audio file
    try:
        command = ['ffprobe', '-i', ffmpegInputFilename, '-show_entries', 'stream=channels', '-select_streams',
                   'a:0', '-of', 'compact=p=0:nk=1', '-v', '0']
        probResult = subprocess.check_output(command, stderr=subprocess.STDOUT).decode()
        channels_found = int(probResult)
    except Exception as e:
        print(f'Failed to get number of audio streams from input file: {str(e)}')
        channels_found = 1
    finally:
        # Delete our downloaded audio
        remove_temp_file(ffmpegInputFilename)

    return channels_found