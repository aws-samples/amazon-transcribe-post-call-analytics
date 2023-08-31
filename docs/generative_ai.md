# PCA and Generative AI

Post-Call Analytics has an optional step in the step function workflow to generate insights with generative AI. 
PCA supports [Amazon Bedrock](https://aws.amazon.com/bedrock/) (Titan or Anthropic models) and [Anthropic](https://www.anthropic.com/) (3rd party) foundational models. Customers may also write a Lambda function and provide PCA the ARN, and use any FM of their choice.

PCA also supports 'Generative AI Queries' - which simply means you can ask questions about a specific call. These queries appear in a chat-like window from within the call details page.

*All the prompts below were tested with Amazon Titan and Anthropic FMs.*

**Note:** If you choose to call Anthropic directly, data will leave your AWS account!  Also, the Anthropic API key will be stored in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html), under the key `{StackName}-ThirdPartyApiKey`, where `{StackName}` is replaced with your PCA CloudFormation stack's name.

## Generative AI Insights

When enabled, PCA can run one or more FM inferences against Bedrock or Anthropic APIs. The prompt used to generate the insights is configured in a [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html). The name of the parameter is `LLMPromptSummaryTemplate`.

### Single FM Inference

The default value for the prompt parameter provides one single prompt:

```
Human: Answer all the questions below as a json object with key value pairs, the key is provided, and answer as the value, based on the transcript. Only return json. 
<br><questions> 
<br>Summary: Summarize the call. 
<br>Topic: Topic of the call. Choose from one of these or make one up (iphone issue, billing issue, cancellation) 
<br>Product: What product did they customer call about? (internet, broadband, mobile phone, mobile plans) 
<br>Resolved: Did the agent resolve the customer's questions? (yes or no)  
<br>Callback: Was this a callback? (yes or no)  
<br>Politeness: Was the agent polite and professional? (yes or no) 
<br>Actions: What actions did the Agent take?  
<br></questions>  
<br><transcript> 
<br>{transcript} 
<br></transcript> 
<br>Assistant: Here is the JSON object with the answers to the questions:
```

The `<br>` tags are replaced with newlines, and  `{transcript}` is replaced with the call transcript.

**Note:** This prompt generates 6 insights in a single inference - summary, topic, product, resolved, callback, and agent politeness.

The expected output of the inference should be a single JSON object with key-value pairs, similar to the below:

```
{
  "Summary": "...",
  "Topic": "...",
  "Product": "...",
  "Resolved": "...",
  "Callback": "...",
  "Politeness": "...",
  "Actions": "...",
}
```

### Multiple inferences per call

If you would like to run individual inferences to generate the summary (for example, if you are using a fine-tuned FM for a specific inference, or your FM does not generate proper JSON), then you can change the prompt parameter input to be a JSON with key value pairs. The key will be the title in the generated insights section, and the value will be the prompt used to generate the value. Don't forget to add `{transcript}` to each prompt!

```
{
  "Summary":"Human: Summarize the following transcript:<br><transcript><br>{transcript}<br></transcript><br>Assistant:",
  "Agent Politeness":"Human: Based on the following transcript, reply 'yes' if the agent was polite, or provide details if they were not polite.<br><transcript><br>{transcript}<br></transcript><br>Assistant:"
}
```

The expected output from the LLM is a single string that contains the value/answer. The key from the prompt definition will be used as the header in the UI.

### Call list default columns

The call list main screen contains additional pre-defined columns. If the output of the inference contains JSON with the column names (or the names are keys in the multiple inferences per call), the values will propogate to the main call list. The names columns are: `Summary`, `Topic`, `Product`, `Resolved`, `Callback`, `Politeness`, `Actions`. They are also in the default prompt.

## Generative AI Queries

For interactive queries from within PCA, it uses a different parameter, named `LLMPromptQueryTemplate`. This will only run a single inference per question.

The default value is:

```
Human: You are an AI chatbot. Carefully read the following transcript and then provide a short answer to the question. If the answer cannot be determined from the transcript or the context, then reply saying Sorry, I don't know.  
<br><question>{question}</question> 
<br><transcript> 
<br>{transcript} 
<br></transcript> 
<br>Assistant:
```

The `<br>` tags are replaced with newlines, and  `{transcript}` is replaced with the call transcript.

