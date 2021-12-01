import { VisuallyHidden } from "../../components/VisuallyHidden";

export const TranscriptOverlay = ({
  children,
  colour,
  visuallyHidden,

  ...props
}) => (
  <span
    style={{ "--highlight-colour": colour }}
    className="highlight"
    {...props}
  >
    {visuallyHidden && <VisuallyHidden>{visuallyHidden}</VisuallyHidden>}
    {children}
  </span>
);
