import React from 'react';

function QBusinessApp() {
  const config = window.pcaSettings;

  return (
    <iframe 
      src={config.qwebappurl.uri}
      title="Q Business Application"
      style={{width: '100%', height: '100vh', border: 'none'}}
    />
  );
}

export default QBusinessApp;
