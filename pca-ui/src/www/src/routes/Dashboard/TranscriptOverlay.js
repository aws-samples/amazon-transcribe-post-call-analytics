import { VisuallyHidden } from "../../components/VisuallyHidden";

const IssuePrefixString = ({type, entityOffsetStart, entityOffsetEnd, entityClass}) => (
  <span className={entityClass} entity-offset-start={entityOffsetStart} entity-offset-end={entityOffsetEnd}>[{type}]: </span>
)

export const TranscriptOverlay = ({
  children,
  colour,
  visuallyHidden,
  start = "", 
  end = "", 
  offsetStart= "", 
  offsetEnd = "",
  content,
  type = "",
  entityOffsetStart,
  entityOffsetEnd,
  entityClass,
  addType,
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
    {visuallyHidden && addType && <VisuallyHidden>{visuallyHidden}</VisuallyHidden>}
    { type && addType && <IssuePrefixString type={type} entityOffsetStart={entityOffsetStart} entityOffsetEnd={entityOffsetEnd} entityClass={entityClass} /> }
    {content}
  </span>
);
