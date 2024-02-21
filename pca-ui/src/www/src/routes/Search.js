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


const sentimentWhat = [
  { value: "average", label: "Average" },
  { value: "trend", label: "Trending" },
];

const sentimentWho = [
  { value: "caller", label: "Customer" },
  { value: "agent", label: "Agent" },
];

const sentimentDirection = [
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
];

function Search({ setAlert }) {
  const [editing, setEditing] = useState(true);
  const [query, setQuery] = useState({});
  const [shouldSearch, setShouldSearch] = useState(true);
  const [jobName, setJobName] = useState("");

  useEffect(() => {
    (query.timestampTo && query.timestampTo) ||
    (!query.timestampTo && !query.timestampFrom)
      ? setShouldSearch(true)
      : setShouldSearch(false);
  }, [query.timestampTo, query.timestampFrom]);

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
          Search
      </Header>
    }>
      <Container>
        <Form>
          <SpaceBetween direction="vertical" size="l">
            <FormField label="Language Code">
              <SpaceBetween direction="horizontal" size="l">
                <Select
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
                Clear
                </Button>
              </SpaceBetween>
            </FormField>
            <FormField label="Date Range">
              <SpaceBetween direction="horizontal" size="l">
                <DatePicker
                  selectsRange
                  startDate={query.timestampFrom}
                  endDate={query.timestampTo}
                  dateFormat="yyyy-MM-dd"
                  onChange={handleDates}
                  maxDate={new Date()}
                  placeholderText="Select a start and end date"
                />
                <Button
                  className="mt-2"
                  variant="outline-secondary"
                  onClick={() => {
                    handleQueryInput(null, "timestampTo");
                    handleQueryInput(null, "timestampFrom");
                  }}
                >
                  Clear
                </Button>
              </SpaceBetween>
          </FormField>
          <FormField label="Sentiment">
            <SpaceBetween direction="horizontal" size="l">
              <p className="align-self-end mb-0">The</p>
              <Select
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
              <p className="align-self-end mb-0"> sentiment of the</p>
              <Select
                className="flex-grow-1"
                options={sentimentWho}
                onChange={(event) =>
                  handleQueryInput(event.value, "sentimentWho")
                }
                value={
                  sentimentWho.find((o) => o.value === query.sentimentWho) || null
                }
              />
              <p className="align-self-end mb-0">is</p>
              <Select
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
                Clear
              </Button>
            </SpaceBetween>
          </FormField>
          <FormField label="Entities">
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

          <FormField label="Job Name">
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
                Clear
              </Button>

            </SpaceBetween>
          </FormField>


          <Button bg={"primary"} onClick={onClick}>
            Search
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
