export const VisuallyHidden = ({ children }) => (
  <div
    style={{
      border: 0,
      clip: "rect(0 0 0 0)",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      padding: 0,
      position: "absolute",
    }}
  >
    {children}
  </div>
);
