#### Transcription features

The following shows which Amazon Transcribe features are supported - please refer to the service documentation links for further details of how each feature works.

| Feature | Description | Supported |
| --- | --- | --- |
| [Language identification](https://docs.aws.amazon.com/transcribe/latest/dg/auto-lang-id.html)  | Allow Amazon Transcribe to determine the dominant language used in the audio file, which it will then use for the whole transcription process | ☑️ |
| [Custom vocabularies](https://docs.aws.amazon.com/transcribe/latest/dg/custom-vocabulary.html)  | Provide more information on how to transcribe specific words or phrases, typically used for domain-specific words for specific use cases | ☑️ |
| [Vocabulary filtering](https://docs.aws.amazon.com/transcribe/latest/dg/vocabulary-filtering.html)  | Allows you to mark or remove unwanted words from the transcripts | ☑️ |
| [Custom language models](https://docs.aws.amazon.com/transcribe/latest/dg/custom-language-models.html)  | Use your own text data to improve transcription accuracy for your specific use case | ✘ |
| [Streaming transcriptions](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)  | Send an audio stream to Amazon Transcribe and receive transcription output in real-time | ✘ |
| [Channel identification](https://docs.aws.amazon.com/transcribe/latest/dg/channel-id.html)  | Process each channel in an audio file independently, combining the transcriptions from each channel into a single output | ☑️ |
| [Speaker diarization](https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html)  | Label each speaker utterance with a distinct speaker tag | ☑️ |
| [Call analytics](https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics.html)  | Inject analytical insights from your calls into your transcripts | ☑️ |
| [Redaction](https://docs.aws.amazon.com/transcribe/latest/dg/pii-redaction.html)  | Mask or remove sensitive personally identifiable information (PII) content from the text transcripts | ☑️ |
| [KMS-based encryption](https://docs.aws.amazon.com/transcribe/latest/dg/encryption-at-rest.html)  | Encrypt transcription output files in your Amazon S3 bucket using KMS keys rather than the default Amazon S3 key (SSE-S3) | ✘ |


#### Feature restrictions

###### Language support

Some of the Amazon Transcribe features are not available in all supported languages. These are highlighted within the service documentation [languages page](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html) , and at the time of writing can be summarised as follows:

-   _Redaction_ is only available in the US English `en-US` language model
-   _Call analytics_ is supported only by a subset of the Amazon Transcribe languages
-   _Digit transcription_, whereby number phrase like `Fifty five` or `a hundredth` are transcribed as `55` and `1/100` respectively, is supported only by a subset of the Amazon Transcribe languages


###### Custom vocabulary

-   _Acronyms_ are only supported by a subset of the Amazon Transcribe languages
-   _Language ID_ is not currently supported natively with custom vocabularies. However, this solution works around this limitation and performs language ID on clip of the original audio, and then chooses the correct custom vocabulary file before submitting the whole audio file for processing. This workaround will be removed once custom vocabualries are supported when using language ID.

###### Other feature limitations 

-   The _Channel identification_ and _Speaker diarization_ features are mutually exclusive
-   _Call analytics_ requires stereo channel-separated audio files