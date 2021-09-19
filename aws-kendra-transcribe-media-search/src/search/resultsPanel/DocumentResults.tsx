import React from "react";
import Kendra from "aws-sdk/clients/kendra";

import { isNullOrUndefined, selectMostRecentUpdatedTimestamp } from "../utils";

import ResultTitle from "./components/ResultTitle";
import ResultText from "./components/ResultText";
import ResultFooter from "./components/ResultFooter";
import "../search.scss";
import { Relevance } from "../constants";
import ReactPlayer from 'react-player';


interface DocumentResultsProps {
  results: Kendra.QueryResultItemList;

  submitFeedback: (
    relevance: Relevance,
    resultItem: Kendra.QueryResultItem
  ) => Promise<void>;
}

export default class DocumentResults extends React.Component<
  DocumentResultsProps,
  {}
> {
  // All results in this component has QueryResultType === "ANSWER"
  private renderResults = (result: Kendra.QueryResultItem) => {
    const { submitFeedback } = this.props;

    let attributes = Object();
    if (!isNullOrUndefined(result.DocumentAttributes)) {
      result.DocumentAttributes!.forEach(attribute => {
        attributes[attribute.Key] = attribute.Value;
      });
    }

    const lastUpdated = selectMostRecentUpdatedTimestamp(attributes);
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
      <div className="container-body" key={result.Id}>
        <ResultTitle
          queryResultItem={result}
          attributes={attributes}
          submitFeedback={submitFeedback}
        />
        <ResultText
          className="small-margin-bottom"
          text={result.DocumentExcerpt!}
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
    );
  };

  render() {
    const { results } = this.props;

    if (isNullOrUndefined(results) || results.length === 0) {
      return null;
    }

    return (
      <div className="document-results-section">
        {results.map(this.renderResults)}
      </div>
    );
  }
}
