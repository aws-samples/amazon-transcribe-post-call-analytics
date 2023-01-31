# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import os

def remove_temp_file(file_path):
    """
    Checks if the specified file exists and deletes it if it does

    @param file_path: Path to the file to be deleted
    """
    # Delete the file if it exists
    if os.path.exists(file_path):
        os.remove(file_path)