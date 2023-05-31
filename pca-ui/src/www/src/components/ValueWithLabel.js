import { Box, Container, Header, Link, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';

export const ValueWithLabel = ({ label, children }) => (
  <div>
    <Box variant="awsui-key-label">
      {label}
    </Box>
    <div>{children}</div>
  </div>
);
