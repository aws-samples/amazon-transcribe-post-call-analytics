import os
import boto3
import cfnresponse

def lambda_handler(event, context):
    """
    Copy sample audio files to the input bucket for processing.
    """
    responseData={}
    status = cfnresponse.SUCCESS
    bucket = os.environ['INPUT_BUCKET_NAME']
    prefix = os.environ['INPUT_BUCKET_RAW_AUDIO']
    samples_dir = "./samples"
    if event['RequestType'] != 'Delete':
        try:
            s3Client = boto3.client('s3')
            for subdir, dirs, files in os.walk(samples_dir):
                for file in files:
                    file_path = os.path.join(subdir, file)
                    s3_key = os.path.join(prefix, file)
                    print(f"Uploading {file_path} to s3://{bucket}/{s3_key}")
                    response = s3Client.upload_file(file_path, bucket, s3_key)
        except Exception as e:
            print(e)
            responseData["Error"] = f"Exception thrown: {e}"
            status = cfnresponse.FAILED
    cfnresponse.send(event, context, status, responseData)
