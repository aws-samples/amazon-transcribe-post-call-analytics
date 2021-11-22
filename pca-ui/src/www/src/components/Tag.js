import "./Tag.css";

export const Tag = ({ children, className, ...props }) => (
  <div {...props} className={`highlight tag ${className}`}>
    {children}
  </div>
);
