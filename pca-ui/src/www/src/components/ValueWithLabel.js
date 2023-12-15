import { Box, Container, Header, Link, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';

export const ValueWithLabel = ({ label,index, children }) => (
  <>
    <Box variant="awsui-key-label">
      <span tabindex={index}>{label}</span>
    </Box>
    <>{children}</>
  </>
);
