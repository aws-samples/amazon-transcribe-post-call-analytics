# Transcribe Parser

The Transcribe Parser python Lambda function will be triggered on completion of an Amazon Transcribe job, although other sources will be supported in the future.  It will read the Transcribe job information, download the relevant transcription output JSON into local storage and then write out the parsed JSON to a configured S3 location.

```json
{
  "ConversationAnalytics": {},
  "SpeechSegments": []
}
```

### ConversationAnalytics

###### Section Structure

Contains header-level information around the analytics that have been generated, along with information specific to the type of source input that the conversation came from - the majority of the analytics have their own detailed sections later.

**-- NEW FIELDS --** Added new *Agent* and *GUID* fields

**-- NEW SECTIONS --** Added new *SpeakerTime*, *CategoriesDetected* and *IssuesDetected* sections

```json
"ConversationAnalytics": {
  "Agent": "string",
  "GUID": "string",
  "ConversationTime": "string",
  "ConversationLocation": "string",
  "ProcessTime": "string",
  "Duration": "float",
  "LanguageCode": "string",
  "EntityRecognizerName": "string",
  "SpeakerLabels": [ ],
  "SentimentTrends": { },
  "SpeakerTime": { },
  "CustomEntities": [ ],
  "CategoriesDetected": [ ],
  "IssuesDetected": [ ],
  "SourceInformation": [ ]
}
```

| Field                | Type   | Description                                                  |
| -------------------- | ------ | ------------------------------------------------------------ |
| Agent                | string | A unique GUID that identifies the input source for the conversation |
| GUID                 | string | An indentifier for the Agent that was involved in the conversation |
| ConversationTime     | string | A timestamp that shows the when the conversation occurred    |
| ConversationLocation | string | The **TZ database name** for the source location for the calls, which can be looked up in https://en.wikipedia.org/wiki/List_of_tz_database_time_zones |
| ProcessTime          | string | A timestamp that shows when the analytics job was completed  |
| Duration             | float  | Duration of the call in seconds                              |
| LanguageCode         | string | The language code for the input data; e.g. "en-US" for voice or just "en" for text |
| EntityRecognizerName | string | The name of the Comprehend custom entity recognizer used when processing the transcription job |
| SpeakerLabels        | -      | List of speaker labels to use for display purposes           |
| SentimentTrends      | -      | List of sentiment trends per speaker, both at the summary level and on a per call quarter level |
| CustomEntities       | -      | Summary of the custom entities detected throughout the conversation |
| CategoriesDetected   | -      | A list of categories detected by *Call Analytics*            |
| IssuesDetected       | -      | A list of issues detected by *Call Analytics*                |
| SourceInformation    | -      | Source-specific details for the conversation.  Contains just one of any of the possible supported sources |

###### SpeakerLabels

The system generates internal speaker markers, but you can assign (and change) explicit displayable text fro each one.  The *DisplayText* field is user-configurable, but Transcribe Call Analytics has its own configured names and these override the customer definitions.

```json
"SpeakerLabels": [
  {
    "Speaker": "string",
    "DisplayText": "string"
  }
]
```

| Field       | Type   | Description                                                  |
| ----------- | ------ | ------------------------------------------------------------ |
| Speaker     | string | Internal speaker name in the format `spk_0`, `spk_1` up to `spk_n` |
| DisplayText | string | Text label to display for that speaker                       |

###### SentimentTrends

Sentiment trends for each caller.  The sentiment score is either:

- The sum of any postive and negative scores divided by the number of turns *(Standard Transcribe)*
- The pre-calculated value based upon the number of sentiment markers *(Call Analytics)*

The per-quarter sentiment scores are similar - we either use the values provided by *Call Analytics* or we calculate them on-the-fly.

**-- CHANGE --** Renamed *AverageSentiment* to *SentimentScore*, inserted all per-quarter sentiment, which may be missing (but I'll look to try and generate it before launch)

**-- CHANGE --** Rather than being a list of data dictionaries we now just have dictionary with an entry per speaker, and each is a dictionary of the original values

**-- NEW --** The *SentimentPerQuarter* block includes a list of per-quarter sentiment scores for the speaker

```json
"SentimentTrends": {
  "<SpeakerLabels|Speaker>": {
    "SentimentScore": "float",
    "SentimentChange": "float",
    "SentimentPerQuarter": [
      {
        "Quarter": "int",
        "Score": "float",
        "BeginOffsetSecs": "float",
        "EndOffsetSecs": "float"
      }
    ]
  }
}
```

| Field           | Type   | Description                                                  |
| --------------- | ------ | ------------------------------------------------------------ |
| Speaker         | string | Internal speaker name in the format `spk_n`, starting with n=0 |
| SentimentScore  | float  | The sentiment for this speaker this period, in range [-5.0, 5.0] |
| SentimentChange | float  | Change in sentiment from start to end of call                |
| Quarter         | int    | Period number, in range [1, 4]                               |
| Score           | float  | The sentiment for this speaker this period, in range [-5.0, 5.0] |
| BeginOffsetSecs | float  | Start time for this speaker talking in this period           |
| EndOffsetSecs   | float  | End time for this speaker talking in this period             |

###### CustomEntities

A list of the custom entities that have been detected via Amazon Comprehend Custom Entity Detection, or via the string-matching algorithm.  This is summarised by entity type, and doesn't give any indication as to where the entity lies in the text - that is part of the *SpeechSegments* structure.

**-- CHANGE --** Changed name from *Count* to *Instances* to be consistent with other blocks

```json
"CustomEntities": [
  {
    "Name": "string",
    "Instances": "integer",
    "Values": [ "string" ]
  }  
]
```

| Field     | Type       | Description                                                  |
| --------- | ---------- | ------------------------------------------------------------ |
| Name      | string     | The name of the custom entity type; e.g. `Product`           |
| Instances | int        | The number of times that this entity was identified in the transcript |
| Values    | [ string ] | An array of literal text values for this type that have been flagged; e.g. `Kit Kat` |

###### SpeakerTime

**-- THIS SECTION IS ALL NEW --**

Note: this information is only available from Call Analytics calls.

Each speaker on the call has their total talk time in seconds included in this block.  Additionally, the total amount of quiet non-talk time is also recorded, along with the location within the call when each of those quiet periods occured.

The sum of talk times for all speakers may add up to more than the duraction of the call, as it only reports the time they were speaking, which could overlap with when other speakers were talking.

```json
"SpeakerTime": {
  "<SpeakerLabels|Speaker>": {
    "TotalTimeSecs": "float"
  },
  "NonTalkTime": {
    "TotalTimeSecs": "float",
    "Instances": [
      {
        "BeginOffsetSecs": "float",
        "EndOffsetSecs": "float",
        "DurationSecs": "float"
      }
    ]
  }
}
```

| Field              | Type   | Description                                                  |
| ------------------ | ------ | ------------------------------------------------------------ |
| **Label:** Speaker | string | Internal speaker name in the format `spk_n`, starting with n=0 |
| TotalTimeSecs      | float  | The amoung of time that this speaker was talking on the call, or the total amount of non-talk time |
| BeginOffsetSecs    | float  | Starting point in the call of a period of non-talk time      |
| EndOffsetSecs      | float  | End point in the call of a period of non-talk time           |
| DurationSecs       | float  | Duration of a period of non-talk time                        |

###### CategoriesDetected

**-- THIS SECTION IS ALL NEW --**

Note: this information is only available from Call Analytics calls.

Within Amazon Transcribe Call Analytics the customer can define a number of categories, which can be based upon multiple rules across different aspects of the call - speaker, sentiment, point in call, interruption status, etc.  Whenever these categories are detected in the call then this header entry will be populated with summary information, with more detail further down in the *SpeechSegments* list.

```json
"CategoriesDetected": [
  {
    "Name": "string",
    "Instances": "integer",
    "Timestamps": [
      {
        "BeginOffsetSecs": "float",
        "EndOffsetSecs": "float"
      }
    ]
  }  
]
```

| Field           | Type   | Description                                         |
| --------------- | ------ | --------------------------------------------------- |
| Name            | string | Name of the detected category                       |
| Instances       | int    | Number of instances of this category in the call    |
| BeginOffsetSecs | float  | Beginning of the text that identified this category |
| EndOffsetSecs   | float  | End of the text that identified this category       |

Note that the *Timestamps* block can be empty, as some categories are triggered on the absence of data in the call, so those categories would have an *Instances* count but no *Timestamps*

###### IssuesDetected

**-- THIS SECTION IS ALL NEW --**

Note: this information is only available from Call Analytics calls.

The issue detection model in Call Analytics will highlight text in the transcript that it recognises as an issue - it does not give a category for the issue, just the text and location.  This information is listed here, with the relevant transcript words also being highlighted further down in the *SpeechSegments* list.

```json
"IssuesDetected": [
  {
    "Text": "string",
    "BeginOffsetSecs": "float",
    "EndOffsetSecs": "float"
  }  
]
```

| Field           | Type   | Description                                      |
| --------------- | ------ | ------------------------------------------------ |
| Text            | string | Text that triggered the issue                    |
| BeginOffsetSecs | float  | Beginning of the text that identified this issue |
| EndOffsetSecs   | float  | End of the text that identified thi              |

###### SourceInformation | TranscribeJobInfo

Present when the source of the conversation is Amazon Transcribe.  A mixture of information around the Transcription job itself, some of which comes directly from the service but some is generated by the parser and stored here, as it is high-level transcription-wide information.

**--CHANGE --** Renamed *AverageAccuracy* to *AverageWordConfidence*, as it isn't an accuracy metric.

**-- NEW --** The *TranscriptionApiType* indicates which API mode of Amazon Tramscribe was used

```json
"SourceInformation": [
  {
    "TranscribeJobInfo": {
      "TranscriptionJobName": "string",
      "TranscribeApiType": "string",
      "CompletionTime": "string",
      "VocabularyName": "string",
      "VocabularyFilter": "string",
      "MediaFormat": "string",
      "MediaSampleRateHertz": "integer",
      "MediaFileUri": "string",
      "MediaOriginalUri": "string",
      "ChannelIdentification": "boolean",
      "AverageWordConfidence": "float"
    }
  }
]
```

| Field                 | Type   | Description                                                  |
| --------------------- | ------ | ------------------------------------------------------------ |
| TranscriptionJobName  | string | The name of the transcription job                            |
| TranscribeApiType     | string | The Transcribe API used, must be one of:  `standard`, `analytics` |
| CompletionTime        | string | A timestamp that shows when the job was completed            |
| VocabularyName        | string | The name of the vocabulary used in the transcription job     |
| VocabularyFilter      | string | The name and mask method of the vocabulary filter used in the transcription job |
| MediaFormat           | string | The format of the input media file, as determined by Amazon Transribe |
| MediaSampleRateHertz  | Int    | The sample rate, in Hertz, of the audio track in the input audio |
| MediaFileUri          | string | The S3 object location of the media file to use during playback, as we may playback an audio-redacted version or a version that has a format unplayable in all browsers with the HTML5 audio control |
| MediaOriginalUri      | string | The S3 object location of the original input audio file      |
| ChannelIdentifcation  | bool   | Indicates whether the transcription job used channel- (true) or speaker-separation (false) |
| AverageWordConfidence | float  | Percentage value between 0.00 and 1.00 indicating overall word confidence score for this job |

### SpeechSegments

###### Section Structure

Contains a single line - or *turn* - of transcribed text, along with sentiment indicators and any other analytics that have been calculated or provided by Transcribe.

**-- NEW FIELDS/SECTIONS --** *LoudnessScores, IssuesDetected, SegmentInterruption, CategoriesDetected, FollowOnCategories*

```json
"SpeechSegments": [
  {
    "SegmentStartTime": "float",
    "SegmentEndTime": "float",
    "SegmentSpeaker": "string",
    "SegmentInterruption": "boolean",
    "OriginalText": "string",
    "DisplayText": "string",
    "TextEdited": "boolean",
    "SentimentIsPositive": "boolean",
    "SentimentIsNegative": "boolean",
    "SentimentScore": "float",
    "LoudnessScores": [ "float" ],
    "CategoriesDetected": [ "string" ],
    "FollowOnCategories": [ "string" ],
    "BaseSentimentScores": { },
    "EntitiesDetected": [ ],
    "IssuesDetected": [ ],
    "WordConfidence": [ ]
  }
]
```

| Field               | Type      | Description                                                  |
| ------------------- | --------- | ------------------------------------------------------------ |
| SegmentStartTime    | float     | Start time in the conversation for this segment in seconds   |
| SegmentEndTime      | float     | End time in the conversation for this segment in seconds     |
| SegmentSpeaker      | string    | Internal speaker name in the format `spk_n`, starting with n=0 |
| SegmentInterruption | bool      | Indicates if this segment was an interruption by the speaker |
| OriginalText        | string    | Original text string generated by conversation source        |
| DisplayText         | string    | Text to be displayed by the front-end application            |
| TextEdited          | bool      | Indicates if text has been edited                            |
| SentimentIsPositive | bool      | Indicates if the sentiment of this turn is positive          |
| SentimentIsNegative | bool      | Indicates if the sentiment of this turn is negatice          |
| SentimentScore      | float     | Sentiment score in the range [-5.0, +5.0]                    |
| LoudnessScores      | [ float ] | A list of loudness scores in decibels, one per second of the segment |
| CategoriesDetected  | [string]  | A list of categories triggered by or just prior to this segment.  Note, negative rules are always tagged to the first segment, as they have no start time |
| FollowOnCategories  | [string]  | A list of categories triggered after this segment, typically only on the final segment to catch categories like silence detection after the final piece of speech |
| BaseSentimentScores | -         | Set of base sentiment scores from Amazon Comprehend          |
| EntitiesDetected    | -         | List of custom entities that were detected on this speech segment |
| IssuesDetected      | -         | List of caller issues that were detected on this speech segment |
| WordConfidence      | -         | List of word/confidence pairs for the whole turn             |

###### BaseSentimentScores

Amazon Comprehend will generate a score between +/- 5.0 for each of four different sentiment types, and we will use several of these.  If the sentiment comes from a source that only return tags rather than scores, such as Amazon Transcribe Call Analytics, then then the confidence levels will be set to just 0.0 or 1.0.

**-- CHANGE --** Removed the *Mixed* option from Amazon Comprehend results

**-- CHANGE --** Score ranges are now +/- 5.0 (used to be +/- 1.0)

```JSON
"BaseSentimentScores": {
  "Positive": "float",
  "Negative": "float",
  "Neutral": "float"
}
```

| Field    | Type  | Description                                      |
| -------- | ----- | ------------------------------------------------ |
| Positive | float | Confidence that this turn has positive sentiment |
| Negative | float | Confidence that this turn has negative sentiment |
| Neutral  | float | Confidence that this turn has neutral sentiment  |

###### EntitiesDetected

List of the custom entities detected in this speech segment - the offset text markers from Comprehend are present, but only make sense if the text has not been edited.

```json
"EntitiesDetected": [
  {
    "Type": "string",
    "Text": "string",
    "BeginOffset": "integer",
    "EndOffset": "integer",
    "Score": "float"
  }
]
```

| Field       | Type   | Description                                                  |
| ----------- | ------ | ------------------------------------------------------------ |
| Type        | string | The type of the custom entity                                |
| Text        | string | The text that has been identified as the custom entity       |
| BeginOffset | int    | A character offset in the input text that shows where the entity begins (start from 0) |
| EndOffset   | int    | A character offset in the input text that shows where the entity ends; e.g. at the character after the entity |
| Score       | float  | The level of confidence that Amazon Comprehend has in the accuracy of the detection |

###### IssuesDetected

**-- THIS SECTION IS ALL NEW --**

Issue text and their timestamps are called out in the header for *ConversationAnalytics*, but in the *SpeechSegments* we include more detailed information.  The presenced of data here indicates that there is text on this segment that has triggered issue detection, what the text is and where it can be found within the segment.

```json
"IssuesDetected": [
  {
    "Text": "string",
    "BeginOffset": "integer",
    "EndOffset": "integer"
  }
]
```

| Field       | Type   | Description                                                  |
| ----------- | ------ | ------------------------------------------------------------ |
| Text        | string | The text string that triggered the issue detection           |
| BeginOffset | int    | A character offset in the input text that shows where the detected issue begins (start from 0) |
| EndOffset   | Int    | A character offset in the input text that shows where the detected issue ends; e.g. at the character after the issue text |

###### WordConfidence

Amazon Transcribe will generate a word-confidence score for every word in the transcription output, allowing a front-end application highlight potential inaccuracies in the transcription.

```json
"WordConfidence": [
  {
    "Text": "string",
    "Confidence": "float",
    "StartTime": "float",
    "EndTime": "float"
  }
]
```

| Field      | Type   | Description                                                  |
| ---------- | ------ | ------------------------------------------------------------ |
| Text       | string | Word that this score applies to.  Note, this may include a leading space as well as trailing punctuation |
| Confidence | float  | Word confidence score between 0.00 - 1.00 for this word      |
| StartTime  | float  | Time in seconds in call where word starts                    |
| EndTime    | float  | Time in seconds in call where word finishes                  |

