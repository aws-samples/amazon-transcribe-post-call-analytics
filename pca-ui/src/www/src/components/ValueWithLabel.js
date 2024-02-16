import { Box, Container, Header, Link, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';

export const ValueWithLabel = ({ label,index, children }) => (
  <>
    <Box variant="awsui-key-label">
      <span tabIndex={index}>{label}</span>
    </Box>
    <>{children}</>
  </>
);
