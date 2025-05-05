import React from 'react';
import { Container, Header, Box, SpaceBetween, Alert } from "@cloudscape-design/components";

function QBusinessApp() {
  const config = window.pcaSettings || {};
  const qBusinessEnabled = config.qwebappurl && config.qwebappurl.uri;

  if (!qBusinessEnabled) {
    return (
      <Container>
        <SpaceBetween size="l">
          <Header variant="h1">Amazon Q Business Integration</Header>
          <Alert type="warning" header="Amazon Q Business is not enabled">
            <p>
              The Amazon Q Business integration is not enabled for this deployment. 
              To enable it, update the CloudFormation stack with the parameter <strong>EnableQBusiness</strong> set to <strong>Yes</strong>.
            </p>
            <p>
              For more information, see the <a href="https://github.com/aws-samples/amazon-transcribe-post-call-analytics/blob/main/AmazonQ.md" target="_blank" rel="noopener noreferrer">Amazon Q Business Integration documentation</a>.
            </p>
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  return (
    <iframe 
      src={config.qwebappurl.uri}
      title="Q Business Application"
      style={{width: '100%', height: '100vh', border: 'none'}}
    />
  );
}

export default QBusinessApp;