import React from "react";
import Kendra from "aws-sdk/clients/kendra";

import { Relevance } from "../../constants";
import blueThumbsUp from "../../images/blue-thumb-up.svg";
import blueThumbsDown from "../../images/blue-thumb-down.svg";
import whiteThumbsUp from "../../images/white-thumb-up.svg";
import whiteThumbsDown from "../../images/white-thumb-down.svg";
import "../../search.scss";

interface FeedbackProps {
  queryResultItem: Kendra.QueryResultItem;
  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

interface FeedbackState {
  relevance?: Relevance;
}

export default class Feedback extends React.Component<
  FeedbackProps,
  FeedbackState
> {
  constructor(props: FeedbackProps) {
    super(props);

    this.state = {
      relevance: undefined
    };
  }

  private setRelevance(relevance: Relevance) {
    this.setState({ ...this.state, relevance });
  }

  private submitFeedback = (relevance: Relevance) => () => {
    this.setRelevance(relevance);
    this.props.submitFeedback(relevance, this.props.queryResultItem);
  };

  render() {
    const { relevance } = this.state;

    return (
      <span className="feedback-buttons">
        <img
          alt="relevant"
          src={relevance === Relevance.Relevant ? blueThumbsUp : whiteThumbsUp}
          onMouseOver={event => {
            event.currentTarget.src = blueThumbsUp;
          }}
          onMouseOut={event => {
            if (relevance !== Relevance.Relevant) {
              event.currentTarget.src = whiteThumbsUp;
            }
          }}
          onClick={this.submitFeedback(Relevance.Relevant)}
        />
        <img
          alt="not relevant"
          src={
            relevance === Relevance.NotRelevant
              ? blueThumbsDown
              : whiteThumbsDown
          }
          onMouseOver={event => {
            event.currentTarget.src = blueThumbsDown;
          }}
          onMouseOut={event => {
            if (relevance !== Relevance.NotRelevant) {
              event.currentTarget.src = whiteThumbsDown;
            }
          }}
          onClick={this.submitFeedback(Relevance.NotRelevant)}
        />
      </span>
    );
  }
}
