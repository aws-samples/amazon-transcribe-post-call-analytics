import * as React from "react";

interface OwnProps {
  className?: string;
}

export class SingleRightArrow extends React.Component<OwnProps> {
  render() {
    return (
      <svg
        width="7px"
        height="12px"
        viewBox="0 0 7 12"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        className={this.props.className}
      >
        <desc>Created with Sketch.</desc>
        <g
          id="Page-1"
          stroke="none"
          strokeWidth="1"
          fill="none"
          fillRule="evenodd"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g
            id="26"
            transform="translate(-177.000000, -272.000000)"
            stroke="#AAB7B8"
            strokeWidth="2"
          >
            <polyline id="1-icon" points="178 273 183 278 178 283"></polyline>
          </g>
        </g>
      </svg>
    );
  }
}

export default SingleRightArrow;
