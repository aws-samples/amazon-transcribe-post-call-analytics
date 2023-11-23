
#### Application Configuration 

There are a large number of configuration parameters that allow you to change the behaviour of the application, although as you saw in the [Installation guide](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/installation#installation-parameters) you can install the application with just a few parameters. Such an install will allow you to generate transcripts via Amazon Transcribe, using all of the Call Analytics features of that service, but would not take advantage of the following features:

-   Custom vocabulary to improve transcription accuracy of your domain-specific terms
-   Language identification of the incoming audio
-   Filter specific words from the transcription
-   Specify models in Amazon Comprehend for custom named entity recognition
-   Specify a simpler string list for named entity string matching
-   Rename the tags used to identify speakers in the audio
-   Map the speakers in the audio to audio channels specific to your telephony system

The other configuration parameters are structured into the following logical sections:

| SECTION | PURPOSE |
| --- | --- |
| [S3 Bucket Names and Retention Policy](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#s3-bucket-names-and-retention-policy) | Allows the definition of which S3 buckets are used by the workflows. You are able to re-use existing buckets or automatically create new ones and specify the retention policy used |
| [S3 Bucket Prefixes](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#s3-bucket-prefixes) | Within the various S3 buckets the application may use a folder structure to hold certain types of files, and you can specify your own prefixes if you wish |
| [Filename metadata parsing](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#filename-metadata-parsing) | Some telephony systems are able to put some metadata information into the filename of the audio files that they input. This section defines the _regular expressions_ required to extract those metadata fields |
| [Transcription](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#transcription) | Defines the configuration for the various native optional features of Amazon Transribe that the application supports |
| [Comprehend](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#comprehend) | Configuration for the various APIs called in Amazon Comprehend for entity detection, PII redaction or sentiment detection |
| [Other parameters](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US/deployment/configuration#other-parameters) | Any additional parameters that do not fall into the above categories |
 

##### S3 Bucket Names and Retention Policy 

Each of the bucket name parameters can either have the name of an existing S3 bucket that you wish to re-use in the same AWS Account, or can be left blank - if you leave any blank then a new bucket is created and you are able to specify the retention policy of any such created buckets. All buckets, created or re-used, will have any necessary triggers associated with them as part of the installation process.

| PARAMETER | PURPOSE | DEFAULT |
| --- | --- | --- |
| InputBucketName | The bucket that will hold the source audio files for standard processing |  |
| BulkUploadBucketName | The bucket that will hold source audio files that will be ingested using the _Bulk Load_ feature of the application |  |
| OutputBucketName | The bucket that will hold all of the results from Amazon Transcribe and from this application's post-Transcribe processing |  |
| SupportFilesBucketName | The bucket that will hold any additional files required by the application, such as entity recognition lists or Amazon Transcribe custom vocabulary definition files |  |
| RetentionDays | When using auto-provisioned S3 buckets, your audio files and associated call analysis data will be automatically and permanently deleted after the specified number of retention days | 365 days |


##### S3 Bucket Prefixes 

The input and output buckets will contain a folder structure to hold audio source files and the various output files. Audio files dropped into the `InputBucketRawAudio` folder will be sent to Amazon Transcribe for processing, and if the processing job fails for some reason then the audio is moved to the folder `InputBucketFailedTranscriptions`.

The application will playback the audio files from the original folder `InputBucketRawAudio`, but if the application needs to playback a different file, such as one where the PII data has been redacted from the audio, then a playback version of the original audio file is written into the `InputBucketAudioPlayback` folder.

The output bucket folders allows complete segregation been the raw results data from Amazon Transcribe and the results derived from that data by this application, which is placed in a folder dedicated to the parsed results.

| PARAMETER | PURPOSE | DEFAULT |
| --- | --- | --- |
| InputBucketFailedTranscriptions | Holds the audio files that for some reason failed transcription | failedAudio |
| InputBucketRawAudio | Holds the audio files to be ingested into the system | originalAudio |
| InputBucketAudioPlayback | Holds the audio files to playback in the browser when original audio cannot be used | mp3 |
| OutputBucketParsedResults | Holds the parsed results generated by this application | parsedFiles |
| OutputBucketTranscribeResults | Holds the original result data from Amazon Transcribe | transcribeResults |

Do not edit the following prefixes after installation

The following folders have triggers associated with them at the point of installation. If you change the prefixes after that time then the triggers are not moved, and your deployment will no longer function correctly.

-   InputBucketRawAudio
-   OutputBucketParsedResults
-   OutputBucketTranscribeResults



##### Filename metadata parsing

Some telephony systems are able to put some metadata information into the filename of the audio files that they input. The application can use regular expressions to try and extract that information, and if anything is found that matches the rules then it is added to the application results output.

The following items of metadata can currently be extracted from the audio filename:

-   Agent's name or identifier
-   Call identification code (GUID) within the source telephony system
-   Data and time of the call

The first two are straightforward, but the date/time has to be done in two stages. The first part, using the regular expression, will extract a series of fields from the filename, and the second part maps those fields to the relevant date - this approach allows a valid date/time to be constructed regardless of the order of the fields in the filename.

If any of these regular expressions fails then no error is raised by the application - the values are either left blank for Agent ID or Call GUID, or the date/time of the call is marked is marked as "now".

| PARAMETER | PURPOSE |
| --- | --- |
| FilenameDatetimeRegex | Regular Expression used to parse call Date/Time from audio filenames |
| FilenameDatetimeFieldMap | Space separated ordered sequence of time field codes as used by Python's `datetime.strptime()` function |
| FilenameGUIDRegex | Regular Expression used to parse call GUID from audio filenames |
| FilenameAgentRegex | Regular Expression used to parse call AGENT from audio filenames |

Worked examples on the following filename

Auto1\_GUID\_001\_AGENT\_AndrewK\_DT\_2021-12-01T07-55-51.wav

| PARAM | REGEX VALUE (default) | OUTPUT |
| --- | --- | --- |
| DatetimeRegex | (\\d{4})-(\\d{2})-(\\d{2})T(\\d{2})-(\\d{2})-(\\d{2}) | \[2021, 12, 01, 07, 55, 51\] |
| DatetimeFieldMap | %Y %m %d %H %M %S | 2021-12-01 07:55:51 |
| GUIDRegex | \_GUID\_(.\*?)\_ | 001 |
| AgentRegex | \_AGENT\_(.\*?)\_ | AndrewK |



##### Transcription 

Amazon Transcribe can be instructed to create transcripts in different ways, and a number of customisation options are available - these often require the end-user to define files that define exactly what that customisation is, such as which words to remove as part of a vocabulary filter, or to give pronunciation hints for domain-specific words or acronyms via a custom vocabulary. This application does not define such customisation files, and it is the responsibility of the end-user to define these directly within Amazon Transcribe - the approach is defined in the relevant service documentation pages for [custom vocabularies](https://docs.aws.amazon.com/transcribe/latest/dg/custom-vocabulary.html)  and [vocabulary filtering](https://docs.aws.amazon.com/transcribe/latest/dg/vocabulary-filtering.html) .

Please see the detailed documentation section on Customisation for more details of these features and how they function in the application, particular with regard to the selection of vocabulary filters and custom vocabularies, where language-specific versions of these need to be defined within Amazon Transcribe.

| PARAMETER | PURPOSE | DEFAULT |
| --- | --- | --- |
| TranscribeApiMode | Sets the default operational mode for Amazon Transcribe. The only valid values are `analytics` and `standard`, with the former using the Call Analytics APIs for Amazon Transcribe rather than the standard APIs | analytics |
| TranscribeLanguages | Either a single language code, which the Amazon Transcribe job use to process the audio, or a list of potential languages to be used by Amazon Transcribe's _Language Identification_ feature; each language in this list needs to be separated as follows: `en-US | fr-CA` | en-US |
| VocabFilterMode | The mode to use for vocabulary filtering during transcript generation. The only valid values are `mask` and `remove` | mask |
| VocabFilterName | The name of the vocabulary filter defined within Amazon Transcribe to use during transcript generation | undefined |
| VocabularyName | The name of the custom vocabulary defined within Amazon Transcribe to use during transcript generation | undefined |
| SpeakerSeparationType | Separation mode diarization to use during transcript generation. The only valid values are `speaker` and `channel`, with the former used for mono audio files the latter used where there is one speaker per audio channel | channel |
| SpeakerNames | The tags to use in transcript to represent each speaker | Caller | Agent |
| MaxSpeakers | If the speaker separation type is `channel` then only 2 speakers can be identified, one per channel, but if it is `speaker` then this list can contain between 2 and 10 speaker tags | 2 |
| CallRedactionTranscript | This flag enables or disables PII data redaction in the text transcript | true |
| CallRedactionAudio | If Amazon Transcribe is working in `analytics` mode, and PII redaction is enabled, then this flag enables or disables the PII data redaction in the audio file used for playback | true |
| ContentRedactionLanguages | Languages supports by Amazon Transcribe's _PII Redaction_ feature. This list should be expanded whenever the service expands language coverage into a language that you need, and the format is the same as for `TranscribeLanguages` | en-US |

Number of speakers

For the parameter `MaxSpeakers`, specify the maximum number of speakers you think are speaking in your audio. For best results, match the number of speakers you ask Amazon Transcribe to identify to the number of speakers in the input audio. If you specify a value less than the number of speakers in your input audio, the transcription text of similar sounding speakers may be attributed to a single speaker label.


##### Comprehend 

Amazon Comprehend is used for several different purposes:

-   Perform standard Named Entity Recognition across each speech segment in the transcript using the pre-trained models to detect just those entity types that you require
-   When available, perform Custom Named Entity recognition across each speech segment in the transcript using a custom-trained model
-   When Call Analytics is not being used (e.g. Standard API mode) then it also used to perform sentiment analysis across each speech segment in the transcript

Please see the detailed documentation section on Customisation for more details of these features and how they function in the application, particular with regard to the selection of a custom entity model endpoint, where language-specific versions of these need to be defined within Amazon Comprehend.

| PARAMETER | PURPOSE | DEFAULT |
| --- | --- | --- |
| ComprehendLanguages | Languages supported by Amazon Comprehend's standard calls. This list should be expanded whenever the service expands language coverage into a language that you need | _All currently supported languages_ |
| EntityThreshold | Confidence threshold between 0.00 and 1.00 where we accept the custom entity detection result from Amazon Comprehend. Lowering this will cause more false positives, and raising it may cause it to miss entities altogether. The quailty of your custom model should drive the selection of this parameter | 0.5 |
| EntityTypes | Entity types supported by Amazon Comprehend's standard entity detection APIs. This list should be edited to either add new standard entities as they are added by the service, or to remove the ones that you do not wish to see highlighted in your transcripts | PERSON | LOCATION | ORGANIZATION | COMMERCIAL\_ITEM | EVENT | DATE | QUANTITY | TITLE |
| EntityRecognizerEndpoint | Name of the custom entity recognizer for Amazon Comprehend to be called once the transcript has been created by Amazon Comprehend | undefined |
| EntityStringMap | Name of a CSV file containing Item/Entity maps for when we don't have an Amazon Comprehend Custom Entity model | sample-entities.csv |
| MinSentimentNegative | Minimum sentiment level required to declare a phrase as having negative sentiment, in the range 0.0-5.0 | 2.0 |
| MinSentimentPositive | Minimum sentiment level required to declare a phrase as having positive sentiment, in the range 0.0-5.0 | 2.0 |


##### Other parameters

| PARAMETER | PURPOSE | DEFAULT |
| --- | --- | --- |
| BulkUploadMaxDripRate | Maximum number of files that the bulk uploader will move to the PCA audio input bucket in one pass | 25 |
| BulkUploadMaxTranscribeJobs | Number of concurrent Transcribe jobs where bulk upload will pause | 50 |
| BulkUploadStepFunctionName | Name of Step Functions workflow that orchestrates the bulk import process | BulkUploadWorkflow |
| ConversationLocation | Name of the timezone location for the call source if it is not possible to extact the actual call time from the source audio filename | America/New\_York |
| DatabaseName | Name of the AWS Glue catalog database name for SQL integration | pca |
| Environment | The type of environment to tag your infrastructure with. The only valid values are `DEV`, `TEST` and `PROD` | PROD |
| StepFunctionName | Name of Step Functions workflow that orchestrates this process | PostCallAnalyticsWorkflow |
| ffmpegDownloadUrl | URL for `ffmpeg` binary distribution tar file download - this is downloaded and packaged up as an AWS Lambda Layer during deployment | [https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz](https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz)  |

Do not edit the following settings after installation

Resources associated with the following are created during the installation, and are referred to at runtime during some of the application processes. If these are edited then the feature associated with that setting will cease to function.

-   BulkUploadStepFunctionName
-   StepFunctionName
-   DatabaseName