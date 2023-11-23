#### Application features 

](https://studio.us-east-1.prod.workshops.aws/preview/2031cf73-22de-40c4-899a-5e4abd940e9a/builds/36aedf9e-2590-4fca-9a96-7902ed26ca07/en-US#application-features)

This solution will perform automatic speech recognition on your audio files with a fully-automated workflow, which is initiated when an audio file is delivered to a configured Amazon S3 bucket. After just a few minutes the transcription will be produced, which is available in another Amazon S3 bucket and can be accessed by your preferred business intelligence (BI) solution. Please see the **Application architecture** section for full details on the processing steps involved in this workflow.

A user interface is provided, allowing you to easily visualize a single call and perform some level of searching and filtering across all of the calls in the system. It is expected that customers will use Amazon Quicksight or their preferred BI solution, with this application's user interface being used to allow users to easily read the transcripts, playback the calls and review the other analytics datapoints in a particular call.

The following table outlines the major features of this application.

| Feature | Description |
| --- | --- |
| _Languages_ | Support all Amazon Transcribe [languages and dialects](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)  |
| _Transcript_ | Generates a speaker-diarised transcript, with word confidence scores per word |
| _Audio formats_ | Handles mono or stereo audio files automatically in [any format supported](https://docs.aws.amazon.com/transcribe/latest/dg/input.html)  by Amazon Transcribe \[1\] |
| _Sentiment_ | Performs sentiment analysis across each line of the call, and also generates sentiment trends across the call for each speaker |
| _Filename Metadata_ | Ability to extract call-related metadata, such as the call time or an agent identifier, from the audio filename via regular expressions |
| _Audio playback_ | Ability to play back the audio from any part of the call transcript, as well as scrub forwards and backwards on demand |
| _Accuracy_ | Enhance the accuracy of your transcripts through the provision of custom vocabulary files |
| _Redaction_ | Supports text redaction based on defined vocabulary filters, as well as redacting any personally identifiable information |
| _Entity detection_ | Searches through and tags your transcript with detected entities |
| _Analytics_ | Provides additional analytics data through the optional use of Amazon Transcribe's Call Analytics feature |

_\[1\] Stereo, channel-separated audio files are preferred, as that makes available the highest quality analytics from the AWS Language Services_