import React from "react";
import * as _ from "lodash";
import Kendra from "aws-sdk/clients/kendra";

import { isNullOrUndefined, truncateString } from "../../utils";
import "../../search.scss";

import Feedback from "./Feedback";
import { Relevance } from "../../constants";

const IgnoreFormats = ["PLAIN_TEXT"];
const MAX_URI_LENGTH = 30;

interface ResultFooterProps {
  queryResultItem: Kendra.QueryResultItem;
  attributes: any;
  startTime: number;
  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

export default class ResultFooter extends React.Component<
  ResultFooterProps,
  {}
> {
  private submitClickFeedback = () => {
    this.props.submitFeedback(Relevance.Click, this.props.queryResultItem);
  };

  render() {
    const { attributes, queryResultItem, submitFeedback, startTime } = this.props;

    const fileFormatName = attributes.FileFormat
      ? attributes.FileFormat.StringValue
      : undefined;

    let fileFormat;
    if (
      !isNullOrUndefined(fileFormatName) &&
      IgnoreFormats.indexOf(fileFormatName) === -1
    ) {
      fileFormat = (
        <div className="display-inline">
          {fileFormatName.toUpperCase()}
          <div className="file-format-divider-wrapper">
            <div className="file-format-divider" />
          </div>
        </div>
      );
    }
    let sourceLink;
    let isYTVideo = 'ytauthor' in attributes;

    // BobS: Modified to enable link to PCA Call Analysis, using Uri containied in document attribute
    // const uri = queryResultItem.DocumentURI;
    let uri;
    let label;
    const pcaCallAnalysisUri = _.get(attributes, "ANALYSIS_URI.StringValue");
    if (pcaCallAnalysisUri) {
      uri = pcaCallAnalysisUri;
      label = "Open Call Analysis";
    } else {
      uri = queryResultItem.DocumentURI;
      label = uri;
    }

    if (uri && !_.isEmpty(uri)) {
      sourceLink = (
        <div className="display-inline action-link">
          <a
            href={uri}
            onClick={this.submitClickFeedback}
            target="_blank"
            rel="noopener noreferrer"
          >
            {truncateString(label!, MAX_URI_LENGTH)}
          </a>
        </div>
      );
    }

    return (
      <div className="result-footer">
        <div className="footer-left-text">
          {fileFormat}
          {sourceLink}
        </div>
        <Feedback
          queryResultItem={queryResultItem}
          submitFeedback={submitFeedback}
        />
      </div>
    );
  }
}
