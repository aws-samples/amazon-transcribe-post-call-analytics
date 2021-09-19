import React from "react";
import { range } from "lodash";
import Kendra from "aws-sdk/clients/kendra";

import { PAGE_SIZE } from "../constants";
import doubleLeft from "../images/double-left-blue.svg";
import singleLeft from "../images/single-left-blue.svg";
import doubleRight from "../images/double-right-blue.svg";
import singleRight from "../images/single-right-blue.svg";
import "../search.scss";

interface PaginationProps {
  queryText: string;
  currentPageNumber: number;
  onSubmit: (queryText: string, currentPageNumber: number) => void;
  results: Kendra.QueryResult;
}

// show a max of 7 pages centered at the current page
const NumberOfPreviousPagesToShow = 3;
const NumberOfNextPagesToShow = 4;

export default class Pagination extends React.Component<PaginationProps, {}> {
  // on page change callback to API call.
  onPageSelected = (selectedPageNumber: number) => () => {
    const { onSubmit } = this.props;
    onSubmit(this.props.queryText, selectedPageNumber);
  };

  renderNumber = (page: number) => {
    const { currentPageNumber } = this.props;
    return (
      <span
        className={
          page === currentPageNumber
            ? "bold-text page-number action-link"
            : "page-number action-link"
        }
        key={page}
        onClick={this.onPageSelected(page)}
      >
        {page}
      </span>
    );
  };

  render() {
    const { currentPageNumber, results } = this.props;

    const totalPages = Math.ceil(results.TotalNumberOfResults! / PAGE_SIZE);

    const pagesToShow = range(
      Math.max(1, currentPageNumber - NumberOfPreviousPagesToShow),
      Math.min(totalPages, currentPageNumber + NumberOfNextPagesToShow) + 1
    );

    const getImage = (pageNumber: number, src: string) => {
      return (
        <span onClick={this.onPageSelected(pageNumber)}>
          <img alt={`page ${pageNumber}`} className="arrow" src={src}></img>
        </span>
      );
    };

    const firstButton =
      currentPageNumber > NumberOfNextPagesToShow && getImage(1, doubleLeft);

    const lastButton =
      totalPages - currentPageNumber > NumberOfNextPagesToShow &&
      getImage(totalPages, doubleRight);

    const prevButton =
      currentPageNumber !== 1 && getImage(currentPageNumber - 1, singleLeft);

    const nextButton =
      currentPageNumber < totalPages &&
      getImage(currentPageNumber + 1, singleRight);

    const forwardEllipsis = totalPages - currentPageNumber >
      NumberOfNextPagesToShow && (
      <span className="page-ellipses small-right-margin">...</span>
    );
    const backwardEllipsis = currentPageNumber > NumberOfNextPagesToShow && (
      <span className="page-ellipses small-right-margin">...</span>
    );

    return (
      <div className="pagination-section">
        {firstButton}
        {prevButton}
        {backwardEllipsis}
        {pagesToShow.map(this.renderNumber)}
        {forwardEllipsis}
        {nextButton}
        {lastButton}
      </div>
    );
  }
}
