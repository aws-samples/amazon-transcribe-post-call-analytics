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
import { ContactTablePreferences, DEFAULT_PREFERENCES } from './ContactTablePreferences'
import { useLocalStorage } from '../common/localStorage';
import Popover from "@cloudscape-design/components/popover";
import Button from "@cloudscape-design/components/button";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Icon from "@cloudscape-design/components/icon";
import Link from "@cloudscape-design/components/link";

const COLUMN_DEFINITIONS = [
  {
    id: "timestamp",
    header: "Timestamp",
    sortingField: "timestamp",
    cell: (d) => {
      if(d.status !== undefined && d.status === "In progress") {
        return (
            Formatter.Timestamp(d.timestamp)
        )
      }
      else {
        return (
            <Link href={`/dashboard/${d.key}`}>{Formatter.Timestamp(d.timestamp)}</Link>
        )
      }
    },
    minWidth: 160
  },
  {
    id: "jobName",
    header: "Job Name",
    cell: (d) => {
      if(d.status !== undefined && d.status === "In progress") {
        return (
            d.jobName
        )
      }
      else {
        return (
            <Link variant="primary" href={`/dashboard/${d.key}`}>{d.jobName}</Link>
        )
      }
    },
    isRowHeader: true,
    sortingField: "jobName",
  },
  {
    id: "status",
    header: "Status",
    cell: (d) => d.status,
    isRowHeader: true,
    sortingField: "status",
    minWidth:130
  },
  {
    id: "guid",
    header: "GUID",
    cell: (d) => d.guid,
    isRowHeader: true,
    sortingField: "guid",
    minWidth:150
  },
  {
    id: "agent",
    header: "Agent",
    cell: (d) => d.agent,
    isRowHeader: true,
    sortingField: "agent",
    minWidth:130
  },
  {
    id: "customer",
    header: "Customer",
    cell: (d) => d.customer,
    isRowHeader: true,
    sortingField: "customer",
    minWidth:130
  },
  {
    id: "queue",
    header: "Queue",
    cell: (d) => d.queue,
    isRowHeader: true,
    sortingField: "queue",
    minWidth:130
  },
  {
    id: "summary_resolved",
    header: "Resolved",
    cell: (d) => d.summary_resolved,
    isRowHeader: true,
    sortingField: "summary_resolved",
    minWidth:130
  },
  {
    id: "summary_topic",
    header: "Topic",
    cell: (d) => d.summary_topic,
    isRowHeader: true,
    sortingField: "summary_topic",
    Width:130
  },
  {
    id: "summary_product",
    header: "Product",
    cell: (d) => d.summary_product,
    isRowHeader: true,
    sortingField: "summary_product",
    minWidth:130
  },
  {
    id: "summary_summary",
    header: "Summary",
    cell: (d) => {
      console.log(d);
      if (d.summary_summary !== undefined) {
        return (
          <Popover
            dismissButton={false}
            position="top"
            size="large"
            triggerType="text"
            content={d.summary_summary}
          >
            {(d.summary_summary.length > 20 ? d.summary_summary.substring(0, 20) + "..." : d.summary_summary)}
          </Popover>
          /*
          <ExpandableSection headerText={(d.summary_summary.length > 50 ? d.summary_summary.substring(0,50) + "..." : d.summary_summary )}>
            {d.summary_summary}
          </ExpandableSection>*/
        )
      }
      return 'n/a';
    },
    isRowHeader: true,
    sortingField: "summary_summary",
    minWidth:200
  },
  {
    id: "callerSentimentScore",
    header: "Cust Sent",
    sortingField: "callerSentimentScore",
    cell: (d) => (
      <div className="d-flex justify-content-evenly">
        <SentimentIcon score={d?.callerSentimentScore} />
        <TrendIcon trend={d.callerSentimentChange} />
      </div>
    ),
    minWidth: 130
  },
  {
    id: "langCode",
    header: <div className="col-header-wrapper text-left">Lang Code</div>,
    cell: (d) => d.lang,
    minWidth: 100,
  },
  {
    id: "duration",
    header: <div className="col-header-wrapper text-left">Duration</div>,
    cell: (d) => Formatter.Time(d.duration),
    minWidth: 130,
  }
];

const getMatchesCountText = function getMatchesCountText(count) {
  return count === 1 ? `1 match` : `${count} matches`;
}

const Loading = () =>
  COLUMN_DEFINITIONS.map((c, i) => (
    <td key={i}>
      <Placeholder />
    </td>
  ));

const NoMatches = ({ children }) => (
  <tr>
    <td colSpan={COLUMN_DEFINITIONS.length}>
      <div className="d-flex justify-content-center py-4">{children}</div>
    </td>
  </tr>
);

export const ContactTable = ({ data = [], loading = false, empty, header, variant='container' }) => {
  const history = useHistory();
  
  const [preferences, setPreferences] = useLocalStorage(
    'contact-table-preferences',
    DEFAULT_PREFERENCES,
  );

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
            key: "jobName",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Job Name",
            groupValuesLabel: "Job Names"
          },
          {
            key: "guid",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "GUID",
            groupValuesLabel: "GUIDs"
          },
          {
            key: "agent",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Agent",
            groupValuesLabel: "Agents"
          },
          {
            key: "customer",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Customer",
            groupValuesLabel: "Customers"
          },
          {
            key: "queue",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Queue",
            groupValuesLabel: "Queues"
          },
          {
            key: "summary_resolved",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Resolved",
            groupValuesLabel: "Resolved"
          },
          {
            key: "summary_topic",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Topic",
            groupValuesLabel: "Topics"
          },
          {
            key: "summary_product",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: "Product",
            groupValuesLabel: "Products"
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
      columnDefinitions={COLUMN_DEFINITIONS}
      columnDisplay={preferences.contentDisplay}
      items={items}
      //pagination={<Pagination {...paginationProps} />}
      resizableColumns={true}
      loadingText="Loading Calls"
      // onSelectionChange={onClick}
      // onRowClick={onClick}
      // selectionType="single"
      stickyHeader={true}
      stickyColumns={{ first: 2, last: 0 }}
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

      preferences={
        <ContactTablePreferences preferences={preferences} setPreferences={setPreferences} />
      }
      visibleColumns={['jobName', ...preferences.visibleContent]}
    />
  );
};
