export const TranscriptOverlay = ({ children, colour, ...props }) => (
  <span
    style={{ "--highlight-colour": colour }}
    className="highlight"
    {...props}
  >
    {children}
  </span>
);
