# Amazon Q Business Integration for Post Call Analytics (PCA)

This document describes how to enable and use the Amazon Q Business integration with the Post Call Analytics (PCA) solution.

## Overview

Amazon Q Business is an AI-powered assistant that can help you search and analyze your call data. When integrated with PCA, it allows you to:

- Ask natural language questions about your call data
- Get AI-powered insights from your call transcripts
- Search across all your call recordings using semantic search
- Identify trends and patterns in customer interactions

## Enabling Amazon Q Business Integration

The Amazon Q Business integration is optional and can be enabled during the deployment of the PCA solution or by updating an existing deployment.

### During Initial Deployment

When deploying the PCA CloudFormation stack:

1. Set the `EnableQBusiness` parameter to `Yes`
2. Ensure that `EnableGui` is also set to `true` for the full functionality

### Updating an Existing Deployment

To enable Amazon Q Business on an existing PCA deployment:

1. Navigate to the CloudFormation console
2. Select your existing PCA stack
3. Choose "Update"
4. Select "Use current template"
5. Update the `EnableQBusiness` parameter to `Yes`
6. Complete the stack update process

## Using Amazon Q Business with PCA

Once enabled, you can access Amazon Q Business through the PCA web interface:

1. Log in to the PCA web application
2. Navigate to the Q Business tab in the interface
3. Use the chat interface to ask questions about your call data

### Example Questions

- "Show me calls with negative customer sentiment in the last week"
- "What are the common issues customers are reporting?"
- "Find calls where agents mentioned our new product"
- "Summarize trends in customer complaints this month"
- "Which agents have the highest customer satisfaction scores?"

## Architecture

When enabled, the integration:

1. Creates an Amazon Q Business application
2. Sets up an index for your call data
3. Configures a data source that connects to your PCA output bucket
4. Establishes the necessary IAM roles and permissions
5. Integrates the Q Business web experience with the PCA UI

## Considerations

- Amazon Q Business is a separate AWS service with its own pricing. See [Amazon Q Business pricing](https://aws.amazon.com/q/business/pricing/) for details.
- The integration requires AWS IAM Identity Center (successor to AWS Single Sign-On) to be configured in your account.
- For optimal performance, ensure your call transcripts and metadata are properly structured.

## Troubleshooting

If you encounter issues with the Amazon Q Business integration:

1. Check that the `EnableQBusiness` parameter is set to `Yes`
2. Verify that the PCA web UI is enabled (`EnableGui` is `true`)
3. Ensure your AWS account has the necessary permissions to create Amazon Q Business resources
4. Check the CloudFormation stack events for any deployment errors
5. Review the CloudWatch logs for the Q Business integration components

