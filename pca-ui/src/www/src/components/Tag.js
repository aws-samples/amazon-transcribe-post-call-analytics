import "./Tag.css";

export const Tag = ({ children, className, color }) => (
  <div
    style={{ backgroundColor: color }}
    className={`highlight tag ${className}`}
  >
    {children}
  </div>
);
