import React from "react";
import * as _ from "lodash";
import Kendra from "aws-sdk/clients/kendra";

import TextHighlights from "./TextWithHighlight";
import "../../search.scss";
import { Relevance } from "../../constants";

interface ResultTitleProps {
  queryResultItem: Kendra.QueryResultItem;
  attributes: any;

  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

export default class ResultTitle extends React.Component<ResultTitleProps, {}> {
  private submitClickFeedback = () => {
    this.props.submitFeedback(Relevance.Click, this.props.queryResultItem);
  };

  render() {
    const { queryResultItem } = this.props;

    // title is not guaranteed to exist, show nothing if that's the case
    let resultTitle: React.ReactNode = null;
    if (
      queryResultItem.DocumentTitle &&
      !_.isEmpty(queryResultItem.DocumentTitle.Text)
    ) {
      resultTitle = (
        <TextHighlights textWithHighlights={queryResultItem.DocumentTitle} />
      );
    } else if (queryResultItem.DocumentURI) {
      resultTitle = queryResultItem.DocumentURI;
    } else {
      return null;
    }

    const uri = queryResultItem.DocumentURI;
    if (uri && !_.isEmpty(uri)) {
      resultTitle = (
        <a
          className="action-link"
          href={uri}
          onClick={this.submitClickFeedback}
          target="_blank"
          rel="noopener noreferrer"
        >
          {resultTitle}
        </a>
      );
    }

    return <div className="title">{resultTitle}</div>;
  }
}
