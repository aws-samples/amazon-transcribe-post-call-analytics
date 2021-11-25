export const ValueWithLabel = ({ label, children }) => (
  <div className="mb-3 d-flex gap-2 align-items-baseline">
    <div className="mb-1 text-muted" color="text-label">
      {label}
    </div>
    <div className="ms-auto">{children}</div>
  </div>
);
