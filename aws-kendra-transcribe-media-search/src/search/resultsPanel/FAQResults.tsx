import React from "react";
import Kendra from "aws-sdk/clients/kendra";

import {
  AdditionalResultAttributeKeys,
  FAQExpandedMapType,
  FAQ_MATCHES,
  Relevance
} from "../constants";
import {
  isNullOrUndefined,
  isNullOrEmpty,
  selectMostRecentUpdatedTimestamp
} from "./../utils";

import ResultText from "./components/ResultText";
import ResultFooter from "./components/ResultFooter";
import TextHighlights from "./components/TextWithHighlight";

import expand from "../images/solid-right.svg";
import collapse from "../images/solid-down.svg";
import "../search.scss";

interface FAQResultsProps {
  results: Kendra.QueryResultItemList;

  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

interface FAQResultsState {
  faqExpandedMap: FAQExpandedMapType[];
}

export default class FAQResults extends React.Component<
  FAQResultsProps,
  FAQResultsState
> {
  constructor(props: FAQResultsProps) {
    super(props);

    this.state = {
      faqExpandedMap: []
    };
  }

  componentDidMount() {
    if (!isNullOrEmpty(this.props.results)) {
      let expandedMap = [];
      for (var i = 0; i < 10; i++) {
        expandedMap.push({ expanded: false });
      }

      this.setState({ faqExpandedMap: expandedMap });
    }
  }

  handleExpansionClick = (
    event: React.MouseEvent<HTMLDivElement>,
    index: number
  ) => {
    const previousValue = this.state.faqExpandedMap[index].expanded;
    let temp = this.state.faqExpandedMap;
    temp[index] = { expanded: !previousValue };
    this.setState({ faqExpandedMap: temp });
  };

  renderResults = (result: Kendra.QueryResultItem, index: number) => {
    const { submitFeedback } = this.props;
    const { faqExpandedMap } = this.state;

    let resultAttributes = Object();
    if (!isNullOrUndefined(result.AdditionalAttributes)) {
      result.AdditionalAttributes!.forEach(attribute => {
        resultAttributes[attribute.Key] = attribute.Value;
      });
    }

    const question =
      resultAttributes[AdditionalResultAttributeKeys.QuestionText];
    const answer = resultAttributes[AdditionalResultAttributeKeys.AnswerText];

    let title;
    if (!isNullOrUndefined(question)) {
      title = (
        <div className="faq-question action-link">
          <TextHighlights
            textWithHighlights={question.TextWithHighlightsValue}
          />
        </div>
      );
    }

    let content: Kendra.TextWithHighlights;
    if (!isNullOrUndefined(answer)) {
      content = answer.TextWithHighlightsValue;
    }

    let attributes = Object();
    if (!isNullOrUndefined(result.DocumentAttributes)) {
      result.DocumentAttributes!.forEach(attribute => {
        attributes[attribute.Key] = attribute.Value;
      });
    }

    const lastUpdated = selectMostRecentUpdatedTimestamp(attributes);

    return (
      <React.Fragment key={result.Id}>
        <div className="container-divider" />
        <div className="faq-result">
          <div
            className="faq-title"
            onClick={(event: React.MouseEvent<HTMLDivElement>) =>
              this.handleExpansionClick(event, index)
            }
          >
            {!isNullOrEmpty(faqExpandedMap) &&
              !faqExpandedMap[index].expanded && (
                <img
                  alt="expand"
                  className="expand-collapse"
                  src={expand}
                ></img>
              )}
            {!isNullOrEmpty(faqExpandedMap) &&
              faqExpandedMap[index].expanded && (
                <img
                  alt="collapse"
                  className="expand-collapse"
                  src={collapse}
                ></img>
              )}
            <div className="display-inline"> {title}</div>
          </div>
          {!isNullOrEmpty(faqExpandedMap) && faqExpandedMap[index].expanded && (
            <div className="small-left-padding">
              <div className="container-body faq-answer">
                <ResultText
                  className="small-margin-bottom"
                  text={content!}
                  lastUpdated={lastUpdated}
                />
                <ResultFooter
                  queryResultItem={result}
                  attributes={attributes}
                  submitFeedback={submitFeedback}
                />
              </div>
            </div>
          )}
        </div>
      </React.Fragment>
    );
  };

  render() {
    const { results } = this.props;

    if (isNullOrUndefined(results) || results.length === 0) {
      return null;
    }

    return (
      <div className="result-container card">
        <div className="card-title">{FAQ_MATCHES}</div>
        {results.map(this.renderResults)}
      </div>
    );
  }
}
