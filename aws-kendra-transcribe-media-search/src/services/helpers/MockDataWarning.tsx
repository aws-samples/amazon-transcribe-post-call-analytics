import React from "react";

import { CREDENTIALS_FILE_NAME, CREDENTIALS_FILE_PATH } from "../constants";
import "./../../App.css";

export default function MockDataWarning(props: { errors?: string[] }) {
  return (
    <div className="error-div">
      <div>
        {props.errors && props.errors.length > 0
          ? props.errors.map(err => <div>{err}</div>)
          : `${CREDENTIALS_FILE_PATH}/${CREDENTIALS_FILE_NAME} could not be loaded. See Getting Started in the README.`}
      </div>
      <div className="error-div-padding-top">
        Search results will be populated with sample data
      </div>
      <br />
    </div>
  );
}
