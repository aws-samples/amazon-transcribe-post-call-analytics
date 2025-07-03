# Amazon Transcribe Post Call Analytics (PCA) Walk-through

This file is meant to give you a thorough look at the code structure and what each relevant Lambda function does. After reading through this documentation, you should have a good overall understanding of the solution, and be in a good spot to start making changes or adding new functionality.
Note that Lambda function names are presented with the format `...FunctionName...` to facilitate reading.


## File/Transcript ingestion and workflow initiation

The main Step Function `PostCallAnalyticsWorkflow` orchestrates most of the code executions leveraging AWS Lambda. This Step Function is originally triggered by the Lambda function `...FileDropTrigger...`.

`...FileDropTrigger...` is triggered whenever there is a new file added to the S3 bucket `postcallanalytics-inputbucket...`:
- If the added file is a media file, the function is capable of validating the file type to make sure it's compatible with Amazon Transcribe. These are the [media formats](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html) supported by Transcribe.
- If the added file is a JSON with a transcription that has already been processed (perhaps from the companion LCA solution), it is also validated for later processing.


## Transcription job - launch

The Amazon Transcribe service has different solutions that cover different use cases. [Check this table](https://docs.aws.amazon.com/transcribe/latest/dg/feature-matrix.html) for a comparison between the different Transcribe solutions. PCA leverages Amazon Transcribe Call Analytics "post-call" by default and falls back to the regular Amazon Transcribe if any of the Amazon Transcribe Call Analytics [pre-requisites](https://docs.aws.amazon.com/general/latest/gr/transcribe.html#limits-amazon-transcribe) are not met. Using one solution or the other is also configurable in the CloudFormation template. Compared to the regular Amazon Transcribe, the "post-call" mode provides a wider range of information for every media transcription, such as speaker sentiment, non-talk time, or interruptions, to name a few. [This](https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics-batch.html) is the full set of capabilities provided by this mode. 

The Lambda function `...StartTranscribeJob...` analyzes the inbound media file previously uploaded to S3. It determines which Transcribe mode would be invoked ("post-call" vs "standard") and the number of configuration parameters needed for each invocation. This set of configuration parameters is also influenced by the input parameters defined in CloudFormation. These are the list of Transcribe parameters that you can define via CloudFormation: 
- Vocabulary filtering
- Custom vocabulary
- PII redaction
- Specific audio language
- Custom model
- Channels
- Generative call summarization


## Transcription job - monitoring and extracting job results

The Lambda function `...AwaitNotification...` waits for the transcription job to finish. It stores temporary information about the job status in a DynamoDB table and waits for a job completion trigger coming from Amazon EventBridge. It will then handle successful/unsuccessful status codes and inform the main Step Function about the next step:
- If the Transcribe job is finished successfully, another Lambda function `...ExtractJobHeader...` will take care of extracting any valuable information from the job execution task. Any relevant parameter configured in the job launch code is extracted and stored in a new object `PCAResults`, which is returned back to the main Step Function. Some interim results are also written to Amazon S3. 
- If the Transcribe job fails, the Lambda function `...TranscribeFailed...` is triggered. The purpose of this function is to move the original audio file to a separate "failed" bucket when the processing workflow encounters an expected failure, such as being unable to perform language identification. This allows for further investigation or re-processing of the failed audio files.


## Transcription analysis

The Lambda function `...ProcessTurn...` is responsible for a good number of the business logic represented in the PCA UI:
- If Transcribe Call Analytics was used, most of the information is already available in the transcript output file and just needs to be processed. To be precise, [this is the information available](https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics-batch.html#tca-characteristics-batch) via Transcribe Call Analytics, which is then processed by the function code and represented in the UI. Things like interruptions, loudness, non-talk time, or a full transcript sentiment analysis are made available. On the other hand, things like issues, action items, or outcomes are also evaluated by Transcribe Call Analytics. However, note they might not be present in all the transcriptions.
- If the regular Transcribe was used, Amazon Comprehend is then invoked to understand the speaker(s) sentiment during the call and fill in any other conversation characteristics.

Aside from using Comprehend when the regular Transcribe mode is used, Comprehend is also invoked if there is a need for using [custom entities](https://docs.aws.amazon.com/comprehend/latest/dg/custom-entity-recognition.html) as this is an optional configuration parameter available via Cloudformation.


## (OPTIONAL) Genesys file processing

If you are using Genesys Cloud as your call center solution, you might want to leverage Contact Trace Record (CTR) files for augmenting the current transcription analysis provided by PCA. This step is also configurable via CloudFormation.

The Lambda function `...CTRGenesys...` processes the CTR file and extracts valuable metadata coming from Genesys such as Participant IDs or detailed timestamps about their conversation. It also processes Interactive Voice Responses (IVRs) delivered by automated voice response systems (like welcoming customers to the service) and flags them appropriately for PCA. Once the processing is finished, an updated version of the transcription analysis is available for the PCA application.


 ## GenAI Summarization and insights

 The Lambda function `...Summarize...` is responsible for providing generative AI information and is highly configurable depending on the CloudFormation input parameters:
 - On one hand, the function is responsible for providing call summarization information along with specific insights such as topic, product, or actions identified. Several options/LLMs are available for providing this information like Amazon Bedrock or Amazon SageMaker, to name a few. The function relies on a combination of its code and also prompt templates stored in DynamoDB to construct and interact with the different LLMs available for each option. Note that the call summary information made available previously by Transcribe Call Analytics is also available (using any input parameter with the option "TCA" in CloudFormation).
 - On the other hand, the function is also responsible for interacting with LLMs facilitating Question&Answer interactions between the PCA user and the LLM. Configurable LLM options, although more limited compared to the call summarization, are also possible. The function also leverages DynamoDB to store the base prompt being used to provide context to the LLM.



 ## Final processing

This final Lambda function `...FinalProcessing...` is designed to perform the final processing steps for the workflow, if any. It acts as a placeholder for any custom code needed before finalizing the workflow execution.
 

