#### Call Analytics features 

This application will use many of the speech-to-text features available to Amazon Transcribe. This service has multiple ML models available to it, each of which provides different features, and you are able to choose which one that you would like to use. Currently, the following Amazon Transcribe models are supported:

-   [Standard](https://aws.amazon.com/transcribe/)  - The baseline model that supports features such as Language Identification, Custom Vocabulary, PII Redaction, Vocabulary Filtering and much more
-   [Analytics](https://aws.amazon.com/transcribe/call-analytics/)  - An enhanced model that enhances the output from _Standard_ with additional data points such as sentiment, category identification and call issue detection

The following table summarise which analytics features are available in each mode. If you are using the standard model then the solution with either call out to other AWS services or it will generate as much of the analytics data as possible from the standard data.

| **Feature** | **Call Analytics** | **Standard** |
| --- | --- | --- |
| Call audio redaction \[1\] | ☑️ | ✘ |
| Call-level sentiment | ☑️ | ☑️ \[3\] |
| Speaker sentiment trend per quarter of the call | ☑️ | ☑️ \[3\] |
| Turn-level sentiment flags | ☑️ | ☑️ \[3\] |
| Turn-level sentiment scores | ✘ | ☑️ \[3\] |
| Speaker volume | ☑️ | ✘ |
| Speaker interruptions | ☑️ | ✘ |
| Speaker talk time | ☑️ | ☑️ |
| Call non-talk ("silent") time | ☑️ | ✘ |
| Call category detection \[2\] | ☑️ | ✘ |
| Call issue detection | ☑️ | ✘ |

_\[1\] Call audio redaction only functions when the audio language is one that Amazon Transcribe supports for PII Redaction_

_\[2\] Categories must first be defined by the customer within Amazon Transcribe, and only those defined when the Amazon Transcribe job executed will be reported_

_\[3\] These feature are implemented by calling Amazon Comprehend, and you will incur standard charges for the relevant APIs_

###### Preferred audio formats

Whilst we always say that you should use stereo audio files with Amazon Transcribe in order to get the most accurate transcriptions, you should note that Amazon Transcribe Call Analytics only supports channel-separated audio.