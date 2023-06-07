//import { Table } from "react-bootstrap";
import React from "react";
import { useCollection } from '@cloudscape-design/collection-hooks';
import { Table, TextFilter, Pagination, CollectionPreferences, PropertyFilter } from '@cloudscape-design/components';
import { useHistory } from "react-router-dom";
import { Formatter } from "../format";
import { Placeholder } from "./Placeholder";
import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";
import "./ContactTable.css";
import { DateTimeForm, formatDateTime } from './DateTimeForm';

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
    sortingField: "timestamp",
    cell: (d) => Formatter.Timestamp(d.timestamp)
  },
  {
    header: "Cust Sent",
    sortingField: "callerSentimentScore",
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

export const ContactTable = ({ data = [], loading = false, empty, header, variant='container' }) => {
  const history = useHistory();

  const onClick = (e) => {
    console.log(e);
    history.push(`/dashboard/${e.detail.item.key}`);
  };
  const [
    callQuery,
    setCallQuery
  ] = React.useState({
    tokens: [],
    operation: "and"
  });

  const { items, actions, filteredItemsCount, collectionProps, paginationProps, propertyFilterProps } = useCollection(
    data,
    {
      propertyFiltering: {
        filteringProperties: [
            {
              key: "jobName",
              operators: ["=", "!=", ":", "!:"],
              propertyLabel: "Job Name",
              groupValuesLabel: "Job Names"
            },
            {
              key: "timestamp",
              defaultOperator: '>',
              operators: ['<', '<=', '>', '>='].map(operator => ({
                operator,
                form: DateTimeForm,
                format: formatDateTime,
                match: 'datetime',
              })),
              propertyLabel: "Timestamp",
              groupValuesLabel: "Timestamps"
          },
          {
            key: "lang",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Language Code",
            groupValuesLabel: "Languages Codes"
          },
          {
            key: "duration",
            defaultOperator: '>',
            operators: ['<', '<=', '>', '>='],
            propertyLabel: "Duration",
            groupValuesLabel: "Durations"
          }
        ],
        empty: (
          <div>No Calls.</div>
        ),
        noMatch: (
          <div>No matches.</div>
        )
      },
      pagination: { pageSize: 100000000 },
      sorting: {},
      selection: {},
    });

  return (
    <Table

      {...collectionProps}
      header={header}
      variant={variant}
      columnDefinitions={columns}
      items={items}
      //pagination={<Pagination {...paginationProps} />}
      resizableColumns={true}
      loadingText="Loading Calls"
      onRowClick={onClick}
      stickyHeader={true}
      filter={
        <PropertyFilter
          {...propertyFilterProps}
          /*onChange={({ detail }) => {
            console.log(detail);
            //setCallQuery(detail);
          }}*/
          //query={callQuery}
          i18nStrings={{
            filteringAriaLabel: "your choice",
            dismissAriaLabel: "Dismiss",
            filteringPlaceholder: "Find calls",
            groupValuesText: "Values",
            groupPropertiesText: "Properties",
            operatorsText: "Operators",
            operationAndText: "and",
            operationOrText: "or",
            operatorLessText: "Less than",
            operatorLessOrEqualText: "Less than or equal",
            operatorGreaterText: "Greater than",
            operatorGreaterOrEqualText:
              "Greater than or equal",
            operatorContainsText: "Contains",
            operatorDoesNotContainText: "Does not contain",
            operatorEqualsText: "Equals",
            operatorDoesNotEqualText: "Does not equal",
            editTokenHeader: "Edit filter",
            propertyText: "Property",
            operatorText: "Operator",
            valueText: "Value",
            cancelActionText: "Cancel",
            applyActionText: "Apply",
            allPropertiesLabel: "All properties",
            tokenLimitShowMore: "Show more",
            tokenLimitShowFewer: "Show fewer",
            clearFiltersText: "Clear filters",
            removeTokenButtonAriaLabel: token =>
              `Remove token ${token.propertyKey} ${token.operator} ${token.value}`,
            enteredTextLabel: text => `Use: "${text}"`
          }}
          countText={getMatchesCountText(filteredItemsCount)}
          expandToViewport={true}
        />
      }
    />
  );
};
