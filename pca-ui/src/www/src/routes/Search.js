import { useEffect, useState } from "react";
import useSWR from "swr";
/* import { Form } from "react-bootstrap";*/
import DatePicker from "react-datepicker";
import {
  entities as getEntities,
  languages as getLanguages,
  search,
} from "../api/api";
import { ContactTable } from "../components/ContactTable";
import { useDangerAlert } from "../hooks/useAlert";
import { MultiSelect } from "../components/MultiSelect";
import { Select } from "../components/Select";
import { ContentLayout } from "@cloudscape-design/components";
import { Button, Link, Header, Form, Grid, Container, SpaceBetween, Input, FormField, TextContent } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function Search({ setAlert }) {
  const [editing, setEditing] = useState(true);
  const [query, setQuery] = useState({});
  const [shouldSearch, setShouldSearch] = useState(true);
  const [jobName, setJobName] = useState("");
  const { t } = useTranslation();

  const sentimentWhat = [
    { value: "average", label: t("search.average") },
    { value: "trend", label: t("search.trend") },
  ];
  
  const sentimentWho = [
    { value: "caller", label: t("search.caller") },
    { value: "agent", label: t("search.agent") },
  ];
  
  const sentimentDirection = [
    { value: "positive", label: t("search.positive") },
    { value: "negative", label: t("search.negative") },
  ];

  useEffect(() => {
    (query.timestampTo && query.timestampTo) ||
    (!query.timestampTo && !query.timestampFrom) ||
    (jobName)
      ? setShouldSearch(true)
      : setShouldSearch(false);
  }, [query.timestampTo, query.timestampFrom, jobName]);

  const { data: entities, error: errorEntities } = useSWR(
    `/entities`,
    getEntities
  );
  const { data: languageCodes, error: errorLanguageCodes } = useSWR(
    `/languages`,
    getLanguages
  );
  const { data: results, error: errorResults } = useSWR(
    shouldSearch ? [`/search`, query] : null,
    () => search(query)
  );

  const handleDates = (dates) => {
    const [start, end] = dates;

    const timestampFrom = new Date(start).getTime();
    const timestampTo = end ? new Date(end).setUTCHours(23, 59, 59, 999) : null;

    handleQueryInput(timestampFrom, "timestampFrom");
    handleQueryInput(timestampTo, "timestampTo");
  };

  const filterEmptyKeys = (obj) => {
    const shouldKeep = (v) => (Array.isArray(v) ? v.length > 0 : v !== null);

    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => shouldKeep(v))
    );
  };

  const handleQueryInput = (input, field) =>
    setQuery((q) => filterEmptyKeys({ ...q, [field]: input }));

  const onClick = () => {
    setEditing(false);
  };

  useDangerAlert(errorEntities || errorLanguageCodes || errorResults, setAlert);
  
  return (
  <ContentLayout 
    header={
      <Header
        variant="h1"
        info={<Link variant="info" ariaLabel="Info goes here.">Info</Link>}>
          {t("utilities.search")}
      </Header>
    }>
      <Container>
        <Form>
          <SpaceBetween direction="vertical" size="l">
            <FormField label={t("utilities.language")}>
              <SpaceBetween direction="horizontal" size="l">
                <Select
                  placeholder={t("select")}
                  onChange={(event) => handleQueryInput(event.value, "language")}
                  options={(languageCodes || []).map((code, i) => ({
                    label: code,
                    value: code,
                  }))}
                  isLoading={!languageCodes && !errorLanguageCodes}
                  value={
                    query.language
                      ? { label: query.language, value: query.language }
                      : null
                  }
                />
                <Button
                  className="mt-2"
                  variant="outline-secondary"
                  onClick={() => {
                    handleQueryInput(null, "language");
                  }}
                >
                {t("clear")}
                </Button>
              </SpaceBetween>
            </FormField>
            <FormField label={t("search.dateRangeTitle")}>
              <SpaceBetween direction="horizontal" size="l">
                <DatePicker
                  selectsRange
                  startDate={query.timestampFrom}
                  endDate={query.timestampTo}
                  dateFormat="yyyy-MM-dd"
                  onChange={handleDates}
                  maxDate={new Date()}
                  placeholderText={t("search.dateRange")}
                />
                <Button
                  className="mt-2"
                  variant="outline-secondary"
                  onClick={() => {
                    handleQueryInput(null, "timestampTo");
                    handleQueryInput(null, "timestampFrom");
                  }}
                >
                  {t("clear")}
                </Button>
              </SpaceBetween>
          </FormField>
          <FormField label={t("sentiment")}>
          <SpaceBetween direction="horizontal" size="l">
            <p className="align-self-end mb-0">{t('search.startWord')}</p>
              <Select
                placeholder={t("select")}
                className="flex-grow-1"
                options={sentimentWhat}
                onChange={(event) =>
                  handleQueryInput(event.value, "sentimentWhat")
                }
                value={
                  sentimentWhat.find((o) => o.value === query.sentimentWhat) ||
                  null
                }
              />
              <p className="align-self-end mb-0">{t('search.middleWord')}</p>
              <Select
                placeholder={t("select")}
                className="flex-grow-1"
                options={sentimentWho}
                onChange={(event) =>
                  handleQueryInput(event.value, "sentimentWho")
                }
                value={
                  sentimentWho.find((o) => o.value === query.sentimentWho) || null
                }
              />
              <p className="align-self-end mb-0">{t('search.endWord')}</p>
              <Select
                placeholder={t("select")}
                className="flex-grow-1"
                options={sentimentDirection}
                onChange={(event) =>
                  handleQueryInput(event.value, "sentimentDirection")
                }
                value={
                  sentimentDirection.find(
                    (o) => o.value === query.sentimentDirection
                  ) || null
                }
              />
              <Button
                className="mt-2"
                variant="outline-secondary"
                onClick={() => {
                  handleQueryInput(null, "sentimentWhat");
                  handleQueryInput(null, "sentimentWho");
                  handleQueryInput(null, "sentimentDirection");
                }}
              >
                {t('clear')}
              </Button>
            </SpaceBetween>
          </FormField>
          <FormField label={t("search.entities")}>
            <SpaceBetween direction="horizontal" size="l">
              <MultiSelect
                options={(entities || []).map((entity) => ({
                  value: entity,
                  label: entity,
                }))}
                onChange={(value) => handleQueryInput(value, "entity")}
                isLoading={!entities && !errorEntities}
                />
            </SpaceBetween>
          </FormField>

          <FormField label={t("search.jobName")}>
            <SpaceBetween direction="horizontal" size="l">
              <Input
                  value={jobName}
                  onChange={(event) => {
                    setJobName(event.detail.value);
                    handleQueryInput(event.detail.value, "jobName");
                  }
                }
              />
              <Button
                  className="mt-2"
                  variant="outline-secondary"
                  onClick={() => {
                    setJobName("");
                    handleQueryInput(null, "jobName");
                  }}
              >
                {t("clear")}
              </Button>

            </SpaceBetween>
          </FormField>


          <Button bg={"primary"} onClick={onClick}>
            {t("utilities.search")}
          </Button>
            
          <hr/>
        </SpaceBetween>
      </Form>
      {!editing && (
          <ContactTable
            header={
              <Header>
              Search Results
              </Header>
            }
    
            variant="embedded"
          data={results}
          loading={!results && !errorResults}
          empty={<NoMatches />}
        />
      )}
      </Container>
    </ContentLayout>
  );
}
const NoMatches = () => (
  <div>
    <h2>No Matches</h2>
    <p>Please try a different query</p>
  </div>
);

export default Search;
