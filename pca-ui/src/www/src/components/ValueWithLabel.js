import { Box, Container, Header, Link, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';

export const ValueWithLabel = ({ label, children }) => (
  <>
    <Box variant="awsui-key-label">
      {label}
    </Box>
    <>{children}</>
  </>
);
