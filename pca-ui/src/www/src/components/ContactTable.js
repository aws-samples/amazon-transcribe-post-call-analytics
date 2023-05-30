//import { Table } from "react-bootstrap";
import React from "react";
import { useCollection } from '@cloudscape-design/collection-hooks';
import { Table, TextFilter, Pagination, CollectionPreferences } from '@cloudscape-design/components';
import { useHistory } from "react-router-dom";
import { Formatter } from "../format";
import { Placeholder } from "./Placeholder";
import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";
import "./ContactTable.css";

const columns = [
  {
    header: "Job Name",
    cell: (d) => d.jobName,
    isRowHeader: true,
    sortingField: "jobName",
    minWidth:300
  },
  {
    header: "Timestamp",
    cell: (d) => Formatter.Timestamp(d.timestamp)
  },
  {
    header: "Cust Sent",
    cell: (d) => (
      <div className="d-flex justify-content-evenly">
        <SentimentIcon score={d?.callerSentimentScore} />
        <TrendIcon trend={d.callerSentimentChange} />
      </div>
    ),
    width: 150
  },

  {
    header: <div className="col-header-wrapper text-left">Language Code</div>,
    cell: (d) => d.lang,
  },
  {
    header: <div className="col-header-wrapper text-left">Call Duration</div>,
    cell: (d) => Formatter.Time(d.duration),
  },
];

const getMatchesCountText = function getMatchesCountText(count) {
  return count === 1 ? `1 match` : `${count} matches`;
}

const Loading = () =>
  columns.map((c, i) => (
    <td key={i}>
      <Placeholder />
    </td>
  ));

const NoMatches = ({ children }) => (
  <tr>
    <td colSpan={columns.length}>
      <div className="d-flex justify-content-center py-4">{children}</div>
    </td>
  </tr>
);

export const ContactTable = ({ data = [], loading = false, empty }) => {
  const history = useHistory();

  const onClick = (e) => {
    console.log(e);
    history.push(`/dashboard/${e.detail.item.key}`);
  };
  const [
    filteringText,
    setFilteringText
  ] = React.useState("");

  const { items, actions, filteredItemsCount, collectionProps, filterProps, paginationProps } = useCollection(
    data,
    {
      filtering: {
        empty: (
          <div>No Calls.</div>
        ),
        noMatch: (
          <div>No matches.</div>
        )
      },
      pagination: { pageSize: 30 },
      sorting: {},
      selection: {},
    });

  return (
    <Table
      {...collectionProps}
      columnDefinitions={columns}
      items={items}
      pagination={<Pagination {...paginationProps} />}
      resizableColumns={true}
      loadingText="Loading Calls"
      onRowClick={onClick}
      filter={
        <TextFilter
          {...filterProps}
          countText={getMatchesCountText(filteredItemsCount)}
          filteringAriaLabel="Filter calls"
          filteringPlaceholder="Find calls"
          filteringClearAriaLabel="Clear"
          /* filteringText={filteringText}
          onChange={({ detail }) =>
            setFilteringText(detail.filteringText)
          }*/
        />
      }
    />
  );
};
