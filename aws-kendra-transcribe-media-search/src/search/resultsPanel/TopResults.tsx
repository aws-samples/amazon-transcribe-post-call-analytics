import React from "react";
import _ from "lodash";
import Kendra from "aws-sdk/clients/kendra";

import { AdditionalResultAttributeKeys, Relevance } from "../constants";
import { isNullOrUndefined, selectMostRecentUpdatedTimestamp } from "../utils";

import SingleLeftArrow from "./components/SingleLeftArrow";
import SingleRightArrow from "./components/SingleRightArrow";
import ResultTitle from "./components/ResultTitle";
import ResultText from "./components/ResultText";
import ResultFooter from "./components/ResultFooter";

import "../search.scss";
import ReactPlayer from 'react-player';


const KENDRA_SUGGESTED_ANSWERS = "Amazon Kendra suggested answers";
const MAX_TOP_ANSWER_LENGTH = 25;

interface TopResultsProps {
  results: Kendra.QueryResultItemList;

  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

interface TopResultsState {
  currentResultIndex: number;
  totalResults: number;
}

export default class TopResults extends React.Component<
  TopResultsProps,
  TopResultsState
> {
  // All results in this component has QueryResultType === "ANSWER"
  state = {
    currentResultIndex: 0,
    totalResults: this.props.results.length
  };

  private updatePreviousResultIndex = () => {
    if (this.state.currentResultIndex === 0) {
      return;
    }

    this.setState(prevState => ({
      currentResultIndex: prevState.currentResultIndex - 1
    }));
  };

  private updateNextResultIndex = () => {
    if (this.state.currentResultIndex === this.state.totalResults - 1) {
      return;
    }

    this.setState(prevState => ({
      currentResultIndex: prevState.currentResultIndex + 1
    }));
  };

  private getTopAnswer = (text: Kendra.TextWithHighlights) => {
    if (text && text.Highlights) {
      for (const highlight of text.Highlights) {
        const length = highlight.EndOffset - highlight.BeginOffset;
        if (
          highlight &&
          highlight.TopAnswer &&
          length < MAX_TOP_ANSWER_LENGTH
        ) {
          return text.Text!.substring(
            highlight.BeginOffset,
            highlight.EndOffset
          );
        }
      }
    }

    return null;
  };

  private renderResults = (result: Kendra.QueryResultItem, idx: number) => {
    const { submitFeedback } = this.props;

    if (!isNullOrUndefined(result)) {
      let attributes = Object();
      if (!isNullOrUndefined(result.DocumentAttributes)) {
        result.DocumentAttributes!.forEach(attribute => {
          attributes[attribute.Key] = attribute.Value;
        });
      }

      let resultAttributes = Object();
      if (!isNullOrUndefined(result.AdditionalAttributes)) {
        result.AdditionalAttributes!.forEach(attribute => {
          resultAttributes[attribute.Key] = attribute.Value;
        });
      }

      const answer = resultAttributes[AdditionalResultAttributeKeys.AnswerText];
      const lastUpdated = selectMostRecentUpdatedTimestamp(attributes);
      const topAnswer = this.getTopAnswer(answer.TextWithHighlightsValue);
      let documentFile = result.DocumentURI!.split('?');
      let videoFile = ( documentFile[0]!.toUpperCase().endsWith("MP4") ||
                        documentFile[0]!.toUpperCase().endsWith("OGX") ||
                        documentFile[0]!.toUpperCase().endsWith("WEBM") ||
                        documentFile[0]!.toUpperCase().endsWith("OGV") );
      let audioFile = ( documentFile[0]!.toUpperCase().endsWith("MP3") ||
                        documentFile[0]!.toUpperCase().endsWith("WAV") ||
                        documentFile[0]!.toUpperCase().endsWith("FLAC") ||
                        documentFile[0]!.toUpperCase().endsWith("AMR") ||
                        documentFile[0]!.toUpperCase().endsWith("3GA") ||
                        documentFile[0]!.toUpperCase().endsWith("OGA") ||
                        documentFile[0]!.toUpperCase().endsWith("OGG") ||
                        documentFile[0]!.toUpperCase().endsWith("SPX") );

      return (
        <React.Fragment key={result.Id}>
          <div className="container-body">
            <ResultTitle
              queryResultItem={result}
              attributes={attributes}
              submitFeedback={submitFeedback}
            />
            {!_.isEmpty(topAnswer) && <h1>{topAnswer}</h1>}
            <ResultText
              text={answer.TextWithHighlightsValue}
              lastUpdated={lastUpdated}
            />
             {audioFile && (
              <div>
                <audio src={result.DocumentURI} controls />
              </div>
            )}
            {videoFile && (
              <div>
                <ReactPlayer url={result.DocumentURI} controls={true} width='30%' height='30%' pip={true} />
              </div>
            )}
            <ResultFooter
              queryResultItem={result}
              attributes={attributes}
              submitFeedback={submitFeedback}
            />
          </div>
        </React.Fragment>
      );
    } else {
      return null;
    }
  };

  render() {
    const { results } = this.props;
    const resultsToShow = results.map(this.renderResults);

    if (isNullOrUndefined(results) || results.length === 0) {
      return null;
    }

    return (
      <div className="result-container card">
        <div className="card-title">{KENDRA_SUGGESTED_ANSWERS}</div>
        <div className="container-divider" />
        <div className="carousel-relative-wrapper inside-card-result-container">
          <div className="carousel-wrapper">
            <div className="carousel-container">
              <div className="result-item">
                {resultsToShow[this.state.currentResultIndex]}
              </div>

              {resultsToShow.map((res, idx) => (
                <div className="offscreen result-item" key={idx}>
                  {res}
                </div>
              ))}
            </div>
          </div>

          {this.state.currentResultIndex > 0 && (
            <div className="arrow-left">
              <div className="arrow" onClick={this.updatePreviousResultIndex}>
                <SingleLeftArrow />
              </div>
            </div>
          )}

          {this.state.currentResultIndex < this.state.totalResults - 1 && (
            <div className="arrow-right">
              <div className="arrow" onClick={this.updateNextResultIndex}>
                <SingleRightArrow />
              </div>
            </div>
          )}
        </div>

        {this.state.totalResults > 1 && (
          <ul className="kendra-carousel-indicators">
            {[...Array(this.state.totalResults)].map((x, index) => (
              <li
                key={index}
                className={
                  index === this.state.currentResultIndex
                    ? "kendra-carousel-indicator kendra-carousel-indicator--active"
                    : "kendra-carousel-indicator"
                }
              />
            ))}
          </ul>
        )}
      </div>
    );
  }
}
