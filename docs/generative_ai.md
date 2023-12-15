# PCA and Generative AI

Post-Call Analytics has an optional step in the step function workflow to generate insights with generative AI. 
PCA supports [Amazon Bedrock](https://aws.amazon.com/bedrock/) (Titan or Anthropic models) and [Anthropic](https://www.anthropic.com/) (3rd party) foundational models (FMs). Customers may also write a Lambda function and provide PCA the ARN, and use any FM of their choice. The prompts below are based on Anthropic's prompt formats. Learn more about prompt design at Anthropic's [Introduction to Prompt Design].(https://docs.anthropic.com/claude/docs/introduction-to-prompt-design). 

For Amazon Bedrock models, you must [request model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) for the models selected.

PCA also supports 'Generative AI Queries' - which simply means you can ask questions about a specific call. These queries appear in a chat-like window from within the call details page.

*All the prompts below were tested with Amazon Titan and Anthropic FMs.*

**Note:** If you choose to call Anthropic directly, data will leave your AWS account!  Also, the Anthropic API key will be stored in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html), under the key `{StackName}-ThirdPartyApiKey`, where `{StackName}` is replaced with your PCA CloudFormation stack's name.

## Generative AI Insights

When enabled, PCA can run one or more FM inferences against Amazon Bedrock or Anthropic APIs. The prompt used to generate the insights is stored in an Amazon S3 bucket. The name of the object is `LLMPromptSummaryTemplate`.

### Multiple inferences per call

The default value for `LLMPromptSummaryTemplate` is a JSON object with key/value pairs, each pair representing the label (key) and prompt (value). During the `Summarize` step, PCA will iterate the keys and run each prompt. PCA will replace  `<br>` tags with newlines, and  `{transcript}` is replaced with the call transcript.  The key will be used as a header for the value in the "generated insights" section in the PCA UI.

Below is the default value of `LLMpromptSummaryTemplate`. 

```
{
  "Summary":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is a summary of the transcript?</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Topic":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is the topic of the call? For example, iphone issue, billing issue, cancellation. Only reply with the topic, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Product":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What product did the customer call about? For example, internet, broadband, mobile phone, mobile plans. Only reply with the product, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Resolved":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Did the agent resolve the customer's questions? Only reply with yes or no, nothing more. </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Callback":"<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was this a callback? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Politeness":"<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was the agent polite and professional? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:",
  "Actions":"<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What actions did the Agent take? </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:"
}
```

The expected output after the summarize step is a single json object, as a string, that contains all the key/value pairs. For example:

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


### Single FM Inference

Some LLMs may be able to generate the JSON with one inference, rather than several. Below is an example that we've seen work, but with mixed results. 

```
<br>
<br>Human: Answer all the questions below, based on the contents of <transcript></transcript>, as a json object with key value pairs. Use the text before the colon as the key, and the answer as the value.  If you cannot answer the question, reply with 'n/a'. Only return json. Use gender neutral pronouns. Skip the preamble; go straight into the json.
<br>
<br><questions>
<br>Summary: Summarize the transcript in no more than 5 sentences. Were the caller's needs met during the call?
<br>Topic: Topic of the call. Choose from one of these or make one up (iphone issue, billing issue, cancellation)
<br>Product: What product did the customer call about? (internet, broadband, mobile phone, mobile plans)
<br>Resolved: Did the agent resolve the customer's questions? (yes or no) 
<br>Callback: Was this a callback? (yes or no) 
<br>Politeness: Was the agent polite and professional? (yes or no)
<br>Actions: What actions did the Agent take? 
<br></questions> 
<br>
<br><transcript>
<br>{transcript}
<br></transcript>
<br>
<br>Assistant:
```

The `<br>` tags are replaced with newlines, and  `{transcript}` is replaced with the call transcript.

**Note:** This prompt generates 7 insights in a single inference - summary, topic, product, resolved, callback, agent politeness, and actions.

The expected output of the inference should be a single JSON object with key-value pairs, similar to above.

### Call list default columns

The call list main screen contains additional pre-defined columns. If the output of the inference contains JSON with the column names (or the names are keys in the multiple inferences per call), the values will propogate to the main call list. The names columns are: `Summary`, `Topic`, `Product`, `Resolved`, `Callback`, `Politeness`, `Actions`. They are also in the default prompt.

## Generative AI Queries

For interactive queries from within PCA, we use a different prompt, named `LLMPromptQueryTemplate`, configured in the [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html). This will only run a single inference per question.

The default value is:

```
<br>
<br>Human: You are an AI chatbot. Carefully read the following transcript within <transcript></transcript> 
and then provide a short answer to the question. If the answer cannot be determined from the transcript or 
the context, then reply saying Sorry, I don't know. Use gender neutral pronouns. Skip the preamble; when you reply, only 
respond with the answer.
<br>
<br><question>{question}</question>
<br>
<br><transcript>
<br>{transcript}
<br></transcript>
<br>
<br>Assistant:
```

The `<br>` tags are replaced with newlines, and  `{transcript}` is replaced with the call transcript.

