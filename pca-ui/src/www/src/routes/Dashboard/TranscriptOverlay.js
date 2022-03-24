import { VisuallyHidden } from "../../components/VisuallyHidden";

export const TranscriptOverlay = ({
  children,
  colour,
  visuallyHidden,
  start = "", 
  end = "", 
  offsetStart= "", 
  offsetEnd = "",
  ...props
}) => (
  <span
    style={{ "--highlight-colour": colour }}
    data-start={start} 
    data-end={end} 
    data-offset-start={offsetStart} 
    data-offset-end={offsetEnd}
    className="highlight"
    {...props}
  >
    {visuallyHidden && <VisuallyHidden>{visuallyHidden}</VisuallyHidden>}
    {children}
  </span>
);
