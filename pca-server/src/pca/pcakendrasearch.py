import os
import json
import boto3
import textwrap
import urllib
import dateutil.parser
import pcaconfiguration as cf

KENDRA = boto3.client('kendra')
S3 = boto3.client('s3')

def prepare_transcript_standard(transcript):
    print(f"prepare_transcript_callanalytics(...)")
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
    if (sentence != ""):
        txt = txt + " " + sentence + " "
    out = textwrap.fill(txt, width=70)
    return out

def prepare_transcript_callanalytics(transcript):
    print(f"prepare_transcript_callanalytics(...)")
    turns = transcript["Transcript"]
    txt = ""
    sentence = ""
    for turn in turns:
        items = turn["Items"]
        for i in items:
            if (i["Type"] == 'punctuation'):
                sentence = sentence + i["Content"]
                if (i["Content"] == '.'):
                    #sentence completed
                    txt = txt + " " + sentence + " "
                    sentence = ""
            else: 
                if (sentence == ''):
                    start_time = i["BeginOffsetMillis"]/1000
                    sentence = "[" + str(start_time) + "]"
                sentence = sentence + " " + i["Content"]
    if (sentence != ""):
        txt = txt + " " + sentence + " "
    out = textwrap.fill(txt, width=70)
    return out    

def prepare_transcript(transcript_file):
    """
    Parses the output from the Transcribe job, inserting time markers at the start of each sentence.
    The time markers enable Kendra search results to link to the relevant time marker in the 
    correspondiong audio recording.
    """
    print(f"prepare_transcript(transcript_file={transcript_file[0:100]}...)")
    with open(transcript_file) as f:
        transcript = json.load(f)
    # detect if transcript is from Transcribe standard or Transcribe Call Analytics
    if "results" in transcript:
        return prepare_transcript_standard(transcript)
    else:
        return prepare_transcript_callanalytics(transcript)

    
def parse_s3uri(s3ur1):
    """
    Parses bucket, key, and filename from an S3 uri, eg s3://bucket/prefix/filename 
    """
    r = urllib.parse.urlparse(s3ur1, allow_fragments=False)
    bucket = r.netloc
    key = r.path.lstrip("/")
    file_name = key.split("/")[-1]
    return [bucket, key, file_name]

def get_bucket_region(bucket):
    """
    get bucket location.. buckets in us-east-1 return None, otherwise region is identified in LocationConstraint
    """
    try:
        region = S3.get_bucket_location(Bucket=bucket)["LocationConstraint"] or 'us-east-1' 
    except Exception as e:
        print(f"Unable to retrieve bucket region (bucket owned by another account?).. defaulting to us-east-1. Bucket: {bucket} - Message: " + str(e))
        region = 'us-east-1'
    return region
    
def get_http_from_s3_uri(s3uri):
    """
    Convert URI from s3:// to https://
    """
    bucket, key, file_name = parse_s3uri(s3uri)
    region = get_bucket_region(bucket)
    http_uri = f"https://s3.{region}.amazonaws.com/{bucket}/{key}"
    return http_uri

def iso8601_datetime(value):
    """
    Convert string to datetime
    """
    try:
        dt = dateutil.parser.isoparse(value)
    except Exception as e:
        return False
    return dt
    
def get_entity_values(entityType, dicts):
    """
    Return string array of entity values for specified type, from the inpout array of entityType dicts
    """
    list=["None"]
    entityDict = next((item for item in dicts if item["Name"] == entityType), None)
    if entityDict:
        list = entityDict["Values"]
    return list

def durationBucket(durationStr):
    """
    Return string category label for call duration
    """
    duration = int(float(durationStr))
    if duration < 60:
        return "0 to 1 min"
    elif duration < 120:
        return "1 min to 2 min"
    elif duration < 180:
        return "2 min to 3 min"
    elif duration < 300:
        return "3 min to 5 min"
    elif duration < 600:
        return "5 min to 10 min"
    else:
        return "over 10 min"

def put_kendra_document(indexId, analysisUri, conversationAnalytics, text):
    """
    index the prepared transcript in Kendra, setting all the document index attributes to support 
    filtering, faceting, and search.
    """
    print(f"put_document(indexId={indexId}, analysisUri={analysisUri}, conversationAnalytics={conversationAnalytics}, text='{text[0:100]}...')")
    document = {
        "Id": conversationAnalytics["SourceInformation"][0]["TranscribeJobInfo"]["MediaOriginalUri"],
        "Title": conversationAnalytics["SourceInformation"][0]["TranscribeJobInfo"]["TranscriptionJobName"],
        "Attributes": [
            {
                "Key": "_source_uri",
                "Value": {
                    "StringValue": get_http_from_s3_uri(conversationAnalytics["SourceInformation"][0]["TranscribeJobInfo"]["MediaFileUri"])
                }
            },
            {
                "Key": "ANALYSIS_URI",
                "Value": {
                    "StringValue": analysisUri
                }
            },
            {
                "Key": "DATETIME",
                "Value": {
                    "DateValue": iso8601_datetime(conversationAnalytics["ConversationTime"])
                }
            },
            {
                "Key": "GUID",
                "Value": {
                    "StringValue": conversationAnalytics["GUID"]
                }
            },
            {
                "Key": "AGENT",
                "Value": {
                    "StringValue": conversationAnalytics["Agent"]
                }
            },
            {
                "Key": "DURATION",
                "Value": {
                    "StringValue": durationBucket(conversationAnalytics["Duration"])
                }
            },
            {
                "Key": "ENTITY_PERSON",
                "Value": {
                    "StringListValue": get_entity_values("PERSON", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_LOCATION",
                "Value": {
                    "StringListValue": get_entity_values("LOCATION", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_ORGANIZATION",
                "Value": {
                    "StringListValue": get_entity_values("ORGANIZATION", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_COMMERCIAL_ITEM",
                "Value": {
                    "StringListValue": get_entity_values("COMMERCIAL_ITEM", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_EVENT",
                "Value": {
                    "StringListValue": get_entity_values("EVENT", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_DATE",
                "Value": {
                    "StringListValue": get_entity_values("DATE", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_QUANTITY",
                "Value": {
                    "StringListValue": get_entity_values("QUANTITY", conversationAnalytics["CustomEntities"])
                }
            },
            {
                "Key": "ENTITY_TITLE",
                "Value": {
                    "StringListValue": get_entity_values("TITLE", conversationAnalytics["CustomEntities"])
                }
            }
        ],
        "Blob": text
    }
    documents = [document]
    print("KENDRA.batch_put_document: " + json.dumps(documents, default=str)[0:1000] + "...")
    result = KENDRA.batch_put_document(
        IndexId = indexId,
        Documents = documents
    )
    if 'FailedDocuments' in result and len(result['FailedDocuments']) > 0:
        print("ERROR: Failed to index document: " + result['FailedDocuments'][0]['ErrorMessage'])
    print("result: " + json.dumps(result))
    return True