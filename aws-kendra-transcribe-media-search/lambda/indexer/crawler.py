# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import os
import json
import re
import time
import cfnresponse
import boto3

# Media file suffixes must match one of the supported file types
SUPPORTED_MEDIA_TYPES = ["mp3","mp4","wav","flac","ogg","amr","webm"]

from common import logger
from common import INDEX_ID, DS_ID, STACK_NAME
from common import S3, TRANSCRIBE
from common import start_kendra_sync_job, stop_kendra_sync_job_when_all_done, process_deletions, make_category_facetable
from common import get_crawler_state, put_crawler_state, get_file_status, put_file_status
from common import get_transcription_job
from common import parse_s3url, get_s3jsondata

MEDIA_BUCKET = os.environ['MEDIA_BUCKET']
MEDIA_FOLDER_PREFIX = os.environ['MEDIA_FOLDER_PREFIX']
METADATA_FOLDER_PREFIX = os.environ['METADATA_FOLDER_PREFIX']
TRANSCRIBEOPTS_FOLDER_PREFIX = os.environ['TRANSCRIBEOPTS_FOLDER_PREFIX']
MAKE_CATEGORY_FACETABLE = os.environ['MAKE_CATEGORY_FACETABLE']
JOBCOMPLETE_FUNCTION = os.environ['JOBCOMPLETE_FUNCTION']
TRANSCRIBE_ROLE = os.environ['TRANSCRIBE_ROLE']
LAMBDA = boto3.client('lambda')

# generate a unique job name for transcribe satisfying the naming regex requirements 
def transcribe_job_name(*args):
    timestamp=time.time()
    job_name = "__".join(args) + "_" + str(timestamp)
    job_name = re.sub(r"[^0-9a-zA-Z._-]+","--",job_name)
    return job_name

def get_transcribe_args(job_name, job_uri, role, transcribeopts_url):
    transcribeopts = None
    args = {
        'TranscriptionJobName':job_name,
        'Media':{'MediaFileUri': job_uri},
        'IdentifyLanguage':True,
        'JobExecutionSettings':{
            'AllowDeferredExecution': True,
            'DataAccessRoleArn': role
        }
    }
    if transcribeopts_url:
        logger.info(f"Merging Transcribe options data from: {transcribeopts_url}")
        opts = get_s3jsondata(transcribeopts_url)
        for key, value in opts.items():
            if key in ['TranscriptionJobName', 'Media']:
                logger.error(f"Transcribe options may not override reserved argument: {key}")
            else:
                # all other options are assigned as arguments
                args[key] = value
            if key == 'LanguageCode':
                args['IdentifyLanguage'] = False
    return args


def start_media_transcription(name, job_uri, role, transcribeopts_url):
    logger.info(f"start_media_transcription(name={name}, job_uri={job_uri}, role={role}, transcribeopts_url={transcribeopts_url})")
    job_name = transcribe_job_name(name, job_uri)
    args = get_transcribe_args(job_name, job_uri, role, transcribeopts_url)
    logger.info(f"Starting media transcription job: {job_name} - Arguments {args}")
    try:
        response = TRANSCRIBE.start_transcription_job(**args)
    except Exception as e:
        logger.error("Exception while starting: " + job_name)
        logger.error(e)
        return False
    return job_name

def restart_media_transcription(name, job_uri, role, transcribeopts_url):
    logger.info(f"restart_media_transcription(name={name}, job_uri={job_uri}, role={role}, transcribeopts_url={transcribeopts_url})")
    return start_media_transcription(name, job_uri, role, transcribeopts_url)
    
def reindex_existing_doc_with_new_metadata(transcribe_job_id):
    event = json.dumps({
        'detail':{
            'TranscriptionJobName':transcribe_job_id, 
            'Source': "Crawler Lambda",
            'Descr': "Metadata modified - reindex existing transcription"
            }
        })
    logger.info(f"Existing transcript is still available.. invoking JobComplete function directly to reindex existing transcription: Event={event}")
    LAMBDA.invoke_async(
        FunctionName=JOBCOMPLETE_FUNCTION,
        InvokeArgs=bytes(event, "utf8")
        )
    return True

def process_s3_media_object(crawlername, bucketname, s3url, s3object, s3metadataobject, s3transcribeoptsobject, kendra_sync_job_id, role):
    logger.info(f"process_s3_media_object() - Key: {s3url}")
    lastModified = s3object['LastModified'].strftime("%m:%d:%Y:%H:%M:%S")
    size_bytes = s3object['Size']
    metadata_url = None
    metadata_lastModified = None
    transcribeopts_url = None
    transcribeopts_lastModified = None
    if s3metadataobject:
        metadata_url = f"s3://{bucketname}/{s3metadataobject['Key']}"
        metadata_lastModified = s3metadataobject['LastModified'].strftime("%m:%d:%Y:%H:%M:%S")
    if s3transcribeoptsobject:
        transcribeopts_url = f"s3://{bucketname}/{s3transcribeoptsobject['Key']}"
        transcribeopts_lastModified = s3transcribeoptsobject['LastModified'].strftime("%m:%d:%Y:%H:%M:%S")
    item = get_file_status(s3url)
    job_name=None
    if (item == None or item.get("status") == "DELETED"):
        logger.info("NEW:" + s3url)
        job_name = start_media_transcription(crawlername, s3url, role, transcribeopts_url)
        if job_name:
            put_file_status(
                s3url, lastModified, size_bytes, duration_secs=None, status="ACTIVE-NEW", 
                metadata_url=metadata_url, metadata_lastModified=metadata_lastModified,
                transcribeopts_url=transcribeopts_url, transcribeopts_lastModified=transcribeopts_lastModified,
                transcribe_job_id=job_name, transcribe_state="RUNNING", transcribe_secs=None, 
                sync_job_id=kendra_sync_job_id, sync_state="RUNNING"
                )
    elif (lastModified != item['lastModified'] or transcribeopts_lastModified != item.get('transcribeopts_lastModified')):
        logger.info("MODIFIED:" + s3url)
        job_name = restart_media_transcription(crawlername, s3url, role, transcribeopts_url)
        if job_name:
            put_file_status(
                s3url, lastModified, size_bytes, duration_secs=None, status="ACTIVE-MODIFIED", 
                metadata_url=metadata_url, metadata_lastModified=metadata_lastModified,
                transcribeopts_url=transcribeopts_url, transcribeopts_lastModified=transcribeopts_lastModified,
                transcribe_job_id=job_name, transcribe_state="RUNNING", transcribe_secs=None,
                sync_job_id=kendra_sync_job_id, sync_state="RUNNING"
                )
    elif (metadata_lastModified != item.get('metadata_lastModified')):
        logger.info("METADATA_MODIFIED:" + s3url)
        if get_transcription_job(item['transcribe_job_id']):
            # reindex existing transcription with new metadata
            reindex_existing_doc_with_new_metadata(item['transcribe_job_id'])
            put_file_status(
                s3url, lastModified, size_bytes, duration_secs=None, status="ACTIVE-METADATA_MODIFIED", 
                metadata_url=metadata_url, metadata_lastModified=metadata_lastModified,
                transcribeopts_url=transcribeopts_url, transcribeopts_lastModified=transcribeopts_lastModified,
                transcribe_job_id=item['transcribe_job_id'], transcribe_state="DONE", transcribe_secs=item['transcribe_secs'],
                sync_job_id=kendra_sync_job_id, sync_state="RUNNING"
                )
        else:
            # previous transcription gone - retranscribe 
            job_name = restart_media_transcription(crawlername, s3url, role, transcribeopts_url)
            if job_name:
                put_file_status(
                    s3url, lastModified, size_bytes, duration_secs=None, status="ACTIVE-METADATA_MODIFIED", 
                    metadata_url=metadata_url, metadata_lastModified=metadata_lastModified,
                    transcribeopts_url=transcribeopts_url, transcribeopts_lastModified=transcribeopts_lastModified,
                    transcribe_job_id=job_name, transcribe_state="RUNNING", transcribe_secs=None,
                    sync_job_id=kendra_sync_job_id, sync_state="RUNNING"
                    )
    else:
        logger.info("UNCHANGED:" + s3url)
        put_file_status(
            s3url, lastModified, size_bytes, duration_secs=item['duration_secs'], status="ACTIVE-UNCHANGED", 
            metadata_url=metadata_url, metadata_lastModified=metadata_lastModified,
            transcribeopts_url=transcribeopts_url, transcribeopts_lastModified=transcribeopts_lastModified,
            transcribe_job_id=item['transcribe_job_id'], transcribe_state="DONE", transcribe_secs=item['transcribe_secs'],
            sync_job_id=item['sync_job_id'], sync_state="DONE"
            )
    return s3url

def is_supported_media_file(s3key):
    suffix = s3key.rsplit(".",1)[-1]
    if suffix.upper() in (mediatype.upper() for mediatype in SUPPORTED_MEDIA_TYPES):
        return True
    return False

def is_supported_metadata_file(s3key):
    if s3key.endswith(".metadata.json"):
        # it's a metadata file, but does it reference a supported media file type?
        ref_key = s3key.replace(".metadata.json","")
        if is_supported_media_file(ref_key):
            return True
    return False

def is_supported_transcribeopts_file(s3key):
    if s3key.endswith(".transcribeopts.json"):
        # it's a transcribeopts file, but does it reference a supported media file type?
        ref_key = s3key.replace(".transcribeopts.json","")
        if is_supported_media_file(ref_key):
            return True
    return False
    
def get_metadata_ref_file_key(s3key, media_prefix, metadata_prefix):
    ref_key = None
    if s3key.startswith(media_prefix):
        # metadata in media folder
        ref_key = s3key.replace(".metadata.json","")
    else:
        # metadata in parallel metadata folder
        # path of metadata file is <metadata_prefix>/<media_prefix>
        # i.e. metadata file path is parallel inside the <metadata_prefix> to be consistent with s3 datasource connector
        ref_key = s3key.replace(".metadata.json","").replace(metadata_prefix,"")
    return ref_key

def get_transcribeopts_ref_file_key(s3key, media_prefix, transcribeopts_prefix):
    ref_key = None
    if s3key.startswith(media_prefix):
        # transcribeopts in media folder
        ref_key = s3key.replace(".transcribeopts.json","")
    else:
        # transcribeopts in parallel folder.. follows same structure as kendra metadata
        ref_key = s3key.replace(".transcribeopts.json","").replace(transcribeopts_prefix,"")
    return ref_key

def list_s3_objects(bucketname, media_prefix, metadata_prefix, transcribeopts_prefix):
    logger.info(f"list_s3_media_objects(bucketname{bucketname}, media_prefix={media_prefix}, metadata_prefix={metadata_prefix})")
    s3mediaobjects={}
    s3metadataobjects={}
    s3transcribeoptsobjects={}
    logger.info(f"Find media and metadata files under media_prefix: {media_prefix}")
    paginator = S3.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucketname, Prefix=media_prefix)
    for page in pages:
        if "Contents" in page:
            for s3object in page["Contents"]:
                if is_supported_media_file(s3object['Key']):
                    logger.info("Supported media file type: " + s3object['Key'])
                    media_url = f"s3://{bucketname}/{s3object['Key']}"
                    s3mediaobjects[media_url]=s3object
                elif metadata_prefix=="" and is_supported_metadata_file(s3object['Key']):
                    ref_media_key = get_metadata_ref_file_key(s3object['Key'], media_prefix, metadata_prefix)
                    logger.info(f"Metadata file: {s3object['Key']}. References media file: {ref_media_key}")
                    media_url = f"s3://{bucketname}/{ref_media_key}"
                    s3metadataobjects[media_url]=s3object
                elif transcribeopts_prefix=="" and is_supported_transcribeopts_file(s3object['Key']):
                    ref_media_key = get_transcribeopts_ref_file_key(s3object['Key'], media_prefix, transcribeopts_prefix)
                    logger.info(f"Transcribe options file: {s3object['Key']}. References media file: {ref_media_key}")
                    media_url = f"s3://{bucketname}/{ref_media_key}"
                    s3transcribeoptsobjects[media_url]=s3object
                else:
                    logger.info("File type not supported. Skipping: " + s3object['Key'])
        else:
            logger.info(f"No files found in {bucketname}/{media_prefix}")
    # if media files were found, AND metadataprefix is defined, then find metadata files under metadataprefix
    if s3mediaobjects and metadata_prefix:
        logger.info(f"Find Kendra metadata files under metadata_prefix: {metadata_prefix}")
        pages = paginator.paginate(Bucket=bucketname, Prefix=metadata_prefix)
        for page in pages:
            if "Contents" in page:
                for s3object in page["Contents"]:
                    if is_supported_metadata_file(s3object['Key']):
                        ref_media_key = get_metadata_ref_file_key(s3object['Key'], media_prefix, metadata_prefix)
                        logger.info(f"Kendra metadata file: {s3object['Key']}. References media file: {ref_media_key}")
                        media_url = f"s3://{bucketname}/{ref_media_key}"
                        s3metadataobjects[media_url]=s3object
                    else:
                        logger.info("not a Kendra metadatafile. Skipping: " + s3object['Key'])
            else:
                logger.info(f"No metadata files found in {bucketname}/{metadata_prefix}")  
    # if media files were found, AND transcribeopts_prefix is defined, then find transcribe options files under transcribeopts_prefix
    if s3mediaobjects and transcribeopts_prefix:
        logger.info(f"Find Transcribe job options files under transcribeopts_prefix: {transcribeopts_prefix}")
        pages = paginator.paginate(Bucket=bucketname, Prefix=transcribeopts_prefix)
        for page in pages:
            if "Contents" in page:
                for s3object in page["Contents"]:
                    if is_supported_transcribeopts_file(s3object['Key']):
                        ref_media_key = get_transcribeopts_ref_file_key(s3object['Key'], media_prefix, transcribeopts_prefix)
                        logger.info(f"Transcribe options file: {s3object['Key']}. References media file: {ref_media_key}")
                        media_url = f"s3://{bucketname}/{ref_media_key}"
                        s3transcribeoptsobjects[media_url]=s3object
                    else:
                        logger.info("not a Transcribe options file. Skipping: " + s3object['Key'])
            else:
                logger.info(f"No Transcribe options files found in {bucketname}/{transcribeopts_prefix}")   
    return [s3mediaobjects, s3metadataobjects, s3transcribeoptsobjects]

def exit_status(event, context, status):
    logger.info(f"exit_status({status})")
    if ('ResourceType' in event):
        if (event['ResourceType'].find('CustomResource') > 0):
            logger.info("cfnresponse:" + status)
            cfnresponse.send(event, context, status, {}, None)
    return status       
    
def lambda_handler(event, context):
    logger.info("Received event: %s" % json.dumps(event))
    
    # Handle Delete event from Cloudformation custom resource
    # In all other cases start crawler
    if (('RequestType' in event) and (event['RequestType'] == 'Delete')):
        logger.info("Cfn Delete event - no action - return Success")
        return exit_status(event, context, cfnresponse.SUCCESS)
    
    # exit if crawler is already running
    crawler_state = get_crawler_state(STACK_NAME)
    if (crawler_state):
        logger.info(f"crawler sync state: {crawler_state}")
        if (crawler_state == "RUNNING"):
            logger.info("Previous crawler invocation is running. Exiting")
            return exit_status(event, context, cfnresponse.SUCCESS)
            
    #Make _category facetable if needed
    if (MAKE_CATEGORY_FACETABLE == 'true'):
        logger.info("Make _catetory facetable")
        make_category_facetable(indexId=INDEX_ID)
    # Start crawler, and set status in DynamoDB table
    logger.info("** Start crawler **")
    kendra_sync_job_id = start_kendra_sync_job(dsId=DS_ID, indexId=INDEX_ID)
    if (kendra_sync_job_id == None):
        logger.info("Previous sync job still running. Exiting")
        return exit_status(event, context, cfnresponse.SUCCESS)
    put_crawler_state(STACK_NAME,'RUNNING')  
        
    # process S3 media objects
    s3files=[]
    try:
        logger.info("** List and process S3 media objects **")
        [s3mediaobjects, s3metadataobjects, s3transcribeoptsobjects] = list_s3_objects(MEDIA_BUCKET, MEDIA_FOLDER_PREFIX, METADATA_FOLDER_PREFIX, TRANSCRIBEOPTS_FOLDER_PREFIX)
        for s3url in s3mediaobjects.keys():
            process_s3_media_object(STACK_NAME, MEDIA_BUCKET, s3url, s3mediaobjects.get(s3url), s3metadataobjects.get(s3url), s3transcribeoptsobjects.get(s3url), kendra_sync_job_id, TRANSCRIBE_ROLE)
            s3files.append(s3url)
        # detect and delete indexed docs where files that are no longer in the source bucket location
        # reasons: file deleted, or indexer config updated to crawl a new location
        logger.info("** Process deletions **")
        process_deletions(DS_ID, INDEX_ID, kendra_sync_job_id=kendra_sync_job_id, s3files=s3files)
    except Exception as e:
        logger.error("Exception: " + str(e))
        put_crawler_state(STACK_NAME, 'STOPPED')            
        stop_kendra_sync_job_when_all_done(dsId=DS_ID, indexId=INDEX_ID)
        return exit_status(event, context, cfnresponse.FAILED)

    # Stop crawler
    logger.info("** Stop crawler **")
    put_crawler_state(STACK_NAME, 'STOPPED')
    
    # Stop media sync job if no new transcription jobs were started
    stop_kendra_sync_job_when_all_done(dsId=DS_ID, indexId=INDEX_ID)
    
    # All done
    return exit_status(event, context, cfnresponse.SUCCESS)
    
    
    
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    lambda_handler({},{})

