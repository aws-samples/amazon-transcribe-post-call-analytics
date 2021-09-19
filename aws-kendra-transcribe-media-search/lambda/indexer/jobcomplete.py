# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import os
import json
import textwrap
import urllib
import dateutil.parser

from common import logger
from common import INDEX_ID, DS_ID
from common import S3, TRANSCRIBE, KENDRA
from common import stop_kendra_sync_job_when_all_done
from common import get_file_status, put_file_status
from common import get_transcription_job
from common import parse_s3url, get_s3jsondata

def get_bucket_region(bucket):
    # get bucket location.. buckets in us-east-1 return None, otherwise region is identified in LocationConstraint
    try:
        region = S3.get_bucket_location(Bucket=bucket)["LocationConstraint"] or 'us-east-1' 
    except Exception as e:
        logger.info(f"Unable to retrieve bucket region (bucket owned by another account?).. defaulting to us-east-1. Bucket: {bucket} - Message: " + str(e))
        region = 'us-east-1'
    return region
    

def iso8601_datetime(value):
    try:
        dt = dateutil.parser.isoparse(value)
    except Exception as e:
        return False
    return dt

def get_kendra_type_and_value(key, value):
    kendra_type = ""
    kendra_value = value
    if type(value) is int:
        kendra_type = "LongValue"
    elif type(value) is list:
        kendra_type = "StringListValue"
        kendra_value = list(map(lambda x: str(x), value))
    elif type(value) is str:
        kendra_type = "StringValue"
        if iso8601_datetime(value):
            kendra_type = "DateValue"
            kendra_value = iso8601_datetime(value)
    else:
        logger.error(f"Metadata attribute {key} has invalid type {type(value)} - convert to string")
        kendra_type = "StringValue"
        kendra_value = str(value)
    return [kendra_type, kendra_value]
    
def get_metadata_attributes(metadata):
    kendra_metadata_attributes=[]
    meta_attributes = metadata.get("Attributes")
    if meta_attributes:
        if type(meta_attributes) is dict:
            for key, value in meta_attributes.items():
                reserved_attributes = ["_data_source_id", "_data_source_sync_job_execution_id", "_source_uri"]
                if key not in reserved_attributes:
                    kendra_type, kendra_value = get_kendra_type_and_value(key, value)
                    kendra_attr = {
                        'Key': key,
                        'Value': {
                            kendra_type: kendra_value
                        }
                    }
                    kendra_metadata_attributes.append(kendra_attr)
                else:
                    logger.error(f"Metadata may not override reserved attribute: {key}")
        else:
            logger.error(f"Metadata 'Attributes' is not dict type: {type(meta_attributes)}")
    else:
        logger.info(f"Metadata does not contain 'Attributes'")
    return kendra_metadata_attributes
    
def get_document(dsId, indexId, s3url, item, text):
    bucket, key, file_name = parse_s3url(s3url)
    region = get_bucket_region(bucket)
    document = {
        "Id": s3url,
        "Title": file_name,
        "Attributes": [
            {
                "Key": "_data_source_id",
                "Value": {
                    "StringValue": dsId
                }
            },
            {
                "Key": "_data_source_sync_job_execution_id",
                "Value": {
                    "StringValue": item['sync_job_id']
                }
            },
            {
                "Key": "_source_uri",
                "Value": {
                    "StringValue": f"https://s3.{region}.amazonaws.com/{bucket}/{key}"
                }
            }
        ],
        "Blob": text
    }
    # merge metadata
    metadata = get_s3jsondata(item['metadata_url'])
    if metadata.get("DocumentId"):
        logger.error(f"Metadata may not override: DocumentId")
    if metadata.get("ContentType"):
        logger.error(f"Metadata may not override: ContentType") 
    if metadata.get("Title"):
        logger.info(f"Set 'Title' to: \"{metadata['Title']}\"")  
        document['Title'] = metadata['Title']
    if metadata.get("Attributes"):
        logger.info(f"Set 'Attributes'")
        metadata_attributes = get_metadata_attributes(metadata)
        document["Attributes"] += metadata_attributes
    if metadata.get("AccessControlList"):
        logger.info(f"Set 'AccessControlList'")
        document["AccessControlList"] = metadata['AccessControlList']
    return document
    
def put_document(dsId, indexId, s3url, item, text):
    logger.info(f"put_document(dsId={dsId}, indexId={indexId}, s3url={s3url}, text='{text[0:100]}...')")
    document = get_document(dsId, indexId, s3url, item, text)
    documents = [document]
    logger.info("KENDRA.batch_put_document: " + json.dumps(documents, default=str)[0:1000] + "...")
    result = KENDRA.batch_put_document(
        IndexId = indexId,
        Documents = documents
    )
    if 'FailedDocuments' in result and len(result['FailedDocuments']) > 0:
        logger.error("Failed to index document: " + result['FailedDocuments'][0]['ErrorMessage'])
    logger.info("result: " + json.dumps(result))
    return True

def prepare_transcript(transcript_uri):
    logger.info(f"prepare_transcript(transcript_uri={transcript_uri[0:100]}...)")
    duration_secs=0
    response = urllib.request.urlopen(transcript_uri)
    transcript = json.loads(response.read())
    items = transcript["results"]["items"]
    txt = ""
    sentence = ""
    for i in items:
        if (i["type"] == 'punctuation'):
            sentence = sentence + i["alternatives"][0]["content"]
            if (i["alternatives"][0]["content"] == '.'):
                #sentence completed
                txt = txt + " " + sentence + " "
                sentence = ""
        else: 
            if (sentence == ''):
                sentence = "[" + i["start_time"] + "]"
            sentence = sentence + " " + i["alternatives"][0]["content"]
            duration_secs = i["end_time"]
    if (sentence != ""):
        txt = txt + " " + sentence + " "
    out = textwrap.fill(txt, width=70)
    return [duration_secs, out]

def get_transcription_job_duration(transcription_job):
    start_time = transcription_job['TranscriptionJob']['StartTime']
    completion_time = transcription_job['TranscriptionJob']['CompletionTime']
    delta = completion_time - start_time
    return delta.seconds

# jobcompete handler - this lambda processes and indexes a single media file transcription
# invoked by EventBridge trigger as the Amazon Transcribe job for each media file (started by the crawler lambda) completes
def lambda_handler(event, context):
    logger.info("Received event: %s" % json.dumps(event))
    
    job_name = event['detail']['TranscriptionJobName']
    logger.info(f"Transcription job name: {job_name}")
    
    # get results of Amazon Transcribe job
    logger.info("** Retrieve transcription job **")
    transcription_job = get_transcription_job(job_name)
    
    if transcription_job == None or ('TranscriptionJob' not in transcription_job):
        logger.error("Unable to retrieve transcription from job.")
    else:
        job_status = transcription_job['TranscriptionJob']['TranscriptionJobStatus']
        media_s3url = transcription_job['TranscriptionJob']['Media']['MediaFileUri']
        item = get_file_status(media_s3url)
        if item == None:
            logger.info("Transcription job for media file not tracked in Indexer Media File table.. possibly this is a job that is not started by MediaSearch indexer")
            return
        if job_status == "FAILED":
            # job failed
            failure_reason = transcription_job['TranscriptionJob']['FailureReason']
            logger.error(f"Transcribe job failed: {job_status} - Reason {failure_reason}")
            put_file_status(
                media_s3url, lastModified=item['lastModified'], size_bytes=item['size_bytes'], duration_secs=None, status=item['status'],
                metadata_url=item['metadata_url'], metadata_lastModified=item['metadata_lastModified'],
                transcribeopts_url=item['transcribeopts_url'], transcribeopts_lastModified=item['transcribeopts_lastModified'],
                transcribe_job_id=item['transcribe_job_id'], transcribe_state="FAILED", transcribe_secs=None,
                sync_job_id=item['sync_job_id'], sync_state="NOT_SYNCED"
                )            
        else:
            # job completed
            transcript_uri = transcription_job['TranscriptionJob']['Transcript']['TranscriptFileUri']
            transcribe_secs = get_transcription_job_duration(transcription_job)
            # Update transcribe_state
            put_file_status(
                media_s3url, lastModified=item['lastModified'], size_bytes=item['size_bytes'], duration_secs=None, status=item['status'], 
                metadata_url=item['metadata_url'], metadata_lastModified=item['metadata_lastModified'],
                transcribeopts_url=item['transcribeopts_url'], transcribeopts_lastModified=item['transcribeopts_lastModified'],
                transcribe_job_id=item['transcribe_job_id'], transcribe_state="DONE", transcribe_secs=transcribe_secs,
                sync_job_id=item['sync_job_id'], sync_state=item['sync_state']
                )
            try:
                logger.info("** Process transcription and prepare for indexing **")
                [duration_secs, text] = prepare_transcript(transcript_uri)
                logger.info("** Index transcription document in Kendra **")
                put_document(dsId=DS_ID, indexId=INDEX_ID, s3url=media_s3url, item=item, text=text)
                # Update sync_state
                put_file_status(
                    media_s3url, lastModified=item['lastModified'], size_bytes=item['size_bytes'], duration_secs=duration_secs, status=item['status'], 
                    metadata_url=item['metadata_url'], metadata_lastModified=item['metadata_lastModified'],
                    transcribeopts_url=item['transcribeopts_url'], transcribeopts_lastModified=item['transcribeopts_lastModified'],
                    transcribe_job_id=item['transcribe_job_id'], transcribe_state="DONE", transcribe_secs=transcribe_secs,
                    sync_job_id=item['sync_job_id'], sync_state="DONE"
                    )
            except Exception as e:
                logger.error("Exception thrown during indexing: " + str(e))
                put_file_status(
                    media_s3url, lastModified=item['lastModified'], size_bytes=item['size_bytes'], duration_secs=None, status=item['status'], 
                    metadata_url=item['metadata_url'], metadata_lastModified=item['metadata_lastModified'],
                    transcribeopts_url=item['transcribeopts_url'], transcribeopts_lastModified=item['transcribeopts_lastModified'],
                    transcribe_job_id=item['transcribe_job_id'], transcribe_state="DONE", transcribe_secs=transcribe_secs, 
                    sync_job_id=item['sync_job_id'], sync_state="FAILED"
                    )
    # Finally, in all cases stop sync job if not more transcription jobs are pending.
    stop_kendra_sync_job_when_all_done(dsId=DS_ID, indexId=INDEX_ID)

if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    #lambda_handler({"detail":{"TranscriptionJobName":"testjob"}},{})
    metadata_invalid=get_s3jsondata("s3://bobs-recordings/metadatatest/f1.mp4.metadata.json")
    metadata=get_s3jsondata("s3://bobs-recordings/metadatatest/f2.mp4.metadata.json")
    attr=get_metadata_attributes(metadata)
    logger.info(attr)