//import { Table } from "react-bootstrap";
import React, { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import "../styles/CustomPopover.css";
import { getpromptskeyvalue } from "../api/api";

const COLUMN_DEFINITIONS = [
  {
    id: "timestamp",
    header: "Timestamp",
    sortingField: "timestamp",
    cell: (d) => {
      if(d.status !== undefined && d.status.length > 0 && d.status !== "Done") {
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
      if(d.status !== undefined && d.status.length > 0 && d.status !== "Done") {
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
    id: "uno",
    header: "Uno",
    cell: (d) => d.summary_uno,
    isRowHeader: true,
    sortingField: "summary_uno",
    minWidth:130
  },
  {
    id: "dos",
    header: "Dos",
    cell: (d) => d.summary_dos,
    isRowHeader: true,
    sortingField: "summary_dos",
    minWidth:130
  },
  {
    id: "tres",
    header: "Tres",
    cell: (d) => d.summary_tres,
    isRowHeader: true,
    sortingField: "summary_tres",
    minWidth:130
  },
  {
    id: "cuatro",
    header: "Cuatro",
    cell: (d) => d.summary_cuatro,
    isRowHeader: true,
    sortingField: "summary_cuatro",
    minWidth:130
  },
  {
    id: "cinco",
    header: "Cinco",
    cell: (d) => d.summary_cinco,
    isRowHeader: true,
    sortingField: "summary_cinco",
    minWidth:130
  },
  {
    id: "seis",
    header: "Seis",
    cell: (d) => d.summary_seis,
    isRowHeader: true,
    sortingField: "summary_seis",
    minWidth:130
  },
  {
    id: "siete",
    header: "Siete",
    cell: (d) => d.summary_siete,
    isRowHeader: true,
    sortingField: "summary_siete",
    minWidth:130
  },
  {
    id: "ocho",
    header: "Ocho",
    cell: (d) => d.summary_ocho,
    isRowHeader: true,
    sortingField: "summary_ocho",
    minWidth:130
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

const getPromptsKeyValue = async () => {
  const response = await getpromptskeyvalue();
  return response;
};

const useTranslatedColumnDefinitions = (promptsKeyValue) => {
  const { t } = useTranslation();
  

  return COLUMN_DEFINITIONS.map(column => ({
    ...column,
    header: promptsKeyValue[column.id] || t(`contactTable.${column.id}`),
    cell: column.cell
  }));
};

export const ContactTable = ({ data = [], loading = false, empty, header, variant='embedded' }) => {
  const history = useHistory();

  const [promptsKeyValue, setPromptsKeyValue] = useState({});

  useEffect(() => {
    const fetchPromptsKeyValue = async () => {
      const response = await getPromptsKeyValue();
      setPromptsKeyValue(response);
    };
    fetchPromptsKeyValue();
  }, []);

  const { t } = useTranslation();
  const translatedColumnDefinitions = useTranslatedColumnDefinitions(promptsKeyValue);

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
            propertyLabel: t("contactTable.timestamp"),
            groupValuesLabel: "Timestamps"
          },
          {
            key: "jobName",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: t("contactTable.jobName"),
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
            propertyLabel: t("contactTable.agent"),
            groupValuesLabel: "Agents"
          },
          {
            key: "customer",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: t("contactTable.customer"),
            groupValuesLabel: "Customers"
          },
          {
            key: "queue",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: t("contactTable.queue"),
            groupValuesLabel: "Queues"
          },
          {
            key: "summary_uno",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.uno,
            groupValuesLabel: promptsKeyValue.uno
          },
          {
            key: "summary_dos",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.dos,
            groupValuesLabel: promptsKeyValue.dos
          },
          {
            key: "summary_tres",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.tres,
            groupValuesLabel: promptsKeyValue.tres
          },
          {
            key: "summary_cuatro",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.cuatro,
            groupValuesLabel: promptsKeyValue.cuatro
          },
          {
            key: "summary_cinco",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.cinco,
            groupValuesLabel: promptsKeyValue.cinco
          },
          {
            key: "summary_seis",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.seis,
            groupValuesLabel: promptsKeyValue.seis
          },
          {
            key: "summary_siete",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.siete,
            groupValuesLabel: promptsKeyValue.siete
          },
          {
            key: "summary_ocho",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: promptsKeyValue.ocho,
            groupValuesLabel: promptsKeyValue.ocho
          },
          {
            key: "lang",
            operators: ["=", "!=", ":", "!:"],
            propertyLabel: t("contactTable.langCode"),
            groupValuesLabel: "Languages Codes"
          },
          {
            key: "duration",
            defaultOperator: '>',
            operators: ['<', '<=', '>', '>='],
            propertyLabel: t("contactTable.duration"),
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
      columnDefinitions={translatedColumnDefinitions}
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
            filteringAriaLabel: t("contactTable.filteringAriaLabel"),
            dismissAriaLabel: t("contactTable.dismissAriaLabel"),
            filteringPlaceholder: t("contactTable.filteringPlaceholder"),
            groupValuesText: t("contactTable.groupValuesText"),
            groupPropertiesText: t("contactTable.groupPropertiesText"),
            operatorsText: t("contactTable.operatorsText"),
            operationAndText: t("contactTable.operationAndText"),
            operationOrText: t("contactTable.operationOrText"),
            operatorLessText: t("contactTable.operatorLessText"),
            operatorLessOrEqualText: t("contactTable.operatorLessOrEqualText"),
            operatorGreaterText: t("contactTable.operatorGreaterText"),
            operatorGreaterOrEqualText: t("contactTable.operatorGreaterOrEqualText"),
            operatorContainsText: t("contactTable.operatorContainsText"),
            operatorDoesNotContainText: t("contactTable.operatorDoesNotContainText"),
            operatorEqualsText: t("contactTable.operatorEqualsText"),
            operatorDoesNotEqualText: t("contactTable.operatorDoesNotEqualText"),
            editTokenHeader: t("contactTable.editTokenHeader"),
            propertyText: t("contactTable.propertyText"),
            operatorText: t("contactTable.operatorText"),
            valueText: t("contactTable.valueText"),
            cancelActionText: t("contactTable.cancelActionText"),
            applyActionText: t("contactTable.applyActionText"),
            allPropertiesLabel: t("contactTable.allPropertiesLabel"),
            tokenLimitShowMore: t("contactTable.tokenLimitShowMore"),
            tokenLimitShowFewer: t("contactTable.tokenLimitShowFewer"),
            clearFiltersText: t("contactTable.clearFiltersText"),
            removeTokenButtonAriaLabel: token =>
              t("contactTable.removeTokenButtonAriaLabel", { propertyKey: token.propertyKey, operator: token.operator, value: token.value }),
            enteredTextLabel: text => t("contactTable.enteredTextLabel", { text })
          }}
          countText={getMatchesCountText(filteredItemsCount)}
          expandToViewport={true}
        />
      }

      preferences={
        <ContactTablePreferences preferences={preferences} setPreferences={setPreferences} promptsKeyValue={promptsKeyValue}/>
      }
      visibleColumns={['jobName', ...preferences.visibleContent]}
    />
  );
};
