import React from "react";

export default function MockDataWarning() {
  return (
    <div className="local-credentials-div">
      <span>
        This environment is currently using a local credentials file for
        authentication with the service.
      </span>{" "}
      <span>
        <b>
          Please ensure you do not publish your credentials to any public
          repositories.
        </b>
      </span>
    </div>
  );
}
