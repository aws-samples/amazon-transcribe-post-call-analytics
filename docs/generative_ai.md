# PCA and Generative AI

Post-Call Analytics has an optional step in the step function workflow to generate insights with generative AI. 
PCA supports [Amazon Bedrock](https://aws.amazon.com/bedrock/) (Titan or Anthropic models) and [Anthropic](https://www.anthropic.com/) (3rd party) foundational models (FMs). Customers may also write a Lambda function and provide PCA the ARN, and use any FM of their choice. The prompts below are based on Anthropic's prompt formats. Learn more about prompt design at Anthropic's [Introduction to Prompt Design].(https://docs.anthropic.com/claude/docs/introduction-to-prompt-design). 

For Amazon Bedrock models, you must [request model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) for the models selected. 

PCA also supports 'Generative AI Queries' - which simply means you can ask questions about a specific call. These queries appear in a chat-like window from within the call details page.

*All the prompts below were tested with Amazon Titan and Anthropic FMs.*

**Note:** If you choose to call Anthropic directly, data will leave your AWS account!  Also, the Anthropic API key will be stored in [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html), under the key `{StackName}-ThirdPartyApiKey`, where `{StackName}` is replaced with your PCA CloudFormation stack's name.

## How to enable generative AI Summarization and Insights

To enable generative AI summarization and insights, update the **CallSummarization** CloudFormation parameter with one of the following values: `BEDROCK`, `BEDROCK+TCA`, `ANTHROPIC`, `TCA-ONLY`.

To use Transcribe Call Analytics (TCA) [generative call summarization](https://docs.aws.amazon.com/transcribe/latest/dg/call-analytics-batch.html#tca-summarization-batch), use `BEDROCK+TCA` or `TCA-ONLY` as the value.

**Note:** If you enable TCA, the summarization templates below will skip the 'Summary' prompt for files that are analyzed with TCA. For audio files that are analyzed with Transcribe `standard` mode, such as mono audio files, the 'Summary' prompt will be executed.

When summarization is enabled, PCA can run one or more FM inferences against Amazon Bedrock or Anthropic APIs. The prompt used to generate the insights is stored in DynamoDB. The name of the table contains the string `LLMPromptConfigure`, and the table partition key is `LLMPromptTemplateId`. There are two items in the table, one with the partition key value of `LLMPromptSummaryTemplate` and the other with the partition key value of `LLMPromptQueryTemplate`.

### Generative AI interactive queries

The item in Dynamo with the key `LLMPromptQueryTemplate` allows you to customize the interactive query prompt as seen in the call details page. You can use this to provide model specific prompts. The default valu is in [Anthropic's prompt format](https://docs.anthropic.com/claude/docs/constructing-a-prompt). 

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


### Generative AI insights

The item in Dynamo with the key `LLMPromptSummaryTemplate` contains 1 or more attributes. Each attribute is a single prompt that will be invoked for each call analyzed. Each attribute contains an attribute name and value. The attribute name is an integer, followed by a `#`, followed by the name of the insight. The number signifies the order of the insight. For example, `1#Summary` will show up first. 

Default attributes:

| Key   | Description | Prompt   |
| ----- | --------    | ----------   |
| `1#Summary` | What is a summary of the transcript? | `<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is a summary of the transcript?</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |
| `2#Topic` | What is the topic of the call? | `<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What is the topic of the call? For example, iphone issue, billing issue, cancellation. Only reply with the topic, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |
| `3#Product` | What product did the customer call about? | `<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What product did the customer call about? For example, internet, broadband, mobile phone, mobile plans. Only reply with the product, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |
| `4#Resolved` | Did the agent resolve the customer's questions? Only reply with yes or no. | `<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Did the agent resolve the customer's questions? Only reply with yes or no, nothing more. </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` | 
| `5#Callback` | Was this a callback? | `<br><br>Human: Answer the questions below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was this a callback? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |
| `6#Politeness` | Was the agent polite and professional? | `<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>Was the agent polite and professional? (yes or no) Only reply with yes or no, nothing more.</question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |
| `7#Actions` | What actions did the Agent take? | `<br><br>Human: Answer the question below, defined in <question></question> based on the transcript defined in <transcript></transcript>. If you cannot answer the question, reply with 'n/a'. Use gender neutral pronouns. When you reply, only respond with the answer.<br><br><question>What actions did the Agent take? </question><br><br><transcript><br>{transcript}<br></transcript><br><br>Assistant:` |

The `<br>` tags are replaced with newlines, and  `{transcript}` is replaced with the call transcript. Some Bedrock models such as Claude require newlines in specific spots.

#### Customizing

You can add your own additional attributes and prompts by editing this item in DynamoDB. Make sure you include an order number and insight name in the attribute name. For example `9#NPS Score`.  You can use any of the above prompts as a starting point for crafting a prompt.  Do not forget to include `{transcript}` as a placeholder, otherwise your transcript will not be included in the LLM inference! 

### Call list default columns

The call list main screen contains additional pre-defined columns. If the output of the inference contains the column names, the values will propogate to the main call list. The names columns are: `Summary`, `Topic`, `Product`, `Resolved`, `Callback`, `Politeness`, `Actions`. They are also in the default prompt.

