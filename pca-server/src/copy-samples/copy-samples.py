import os
import boto3
import cfnresponse

def lambda_handler(event, context):
    """
    Copy sample entity map file to the support bucket
    Copy sample audio files to the input bucket
    """
    responseData={}
    status = cfnresponse.SUCCESS
    supportfiles_bucket = os.environ['SUPPORTFILES_BUCKET_NAME']
    input_bucket = os.environ['INPUT_BUCKET_NAME']
    prefix = os.environ['INPUT_BUCKET_RAW_AUDIO']
    if event['RequestType'] != 'Delete':
        try:
            s3Client = boto3.client('s3')
            # sample entities
            for subdir, dirs, files in os.walk("./entitystringmaps"):
                for file in files:
                    file_path = os.path.join(subdir, file)
                    s3_key = file
                    print(f"Uploading {file_path} to s3://{supportfiles_bucket}/{s3_key}")
                    response = s3Client.upload_file(file_path, supportfiles_bucket, s3_key)
            # sample audios
            for subdir, dirs, files in os.walk("./samples"):
                for file in files:
                    file_path = os.path.join(subdir, file)
                    s3_key = os.path.join(prefix, file)
                    print(f"Uploading {file_path} to s3://{input_bucket}/{s3_key}")
                    response = s3Client.upload_file(file_path, input_bucket, s3_key)
        except Exception as e:
            print(e)
            responseData["Error"] = f"Exception thrown: {e}"
            status = cfnresponse.FAILED
    cfnresponse.send(event, context, status, responseData)
