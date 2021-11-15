import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, Form } from "react-bootstrap";
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

function Search({ setAlert }) {
  const [editing, setEditing] = useState(true);
  const [query, setQuery] = useState({});
  const [shouldSearch, setShouldSearch] = useState(true);

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

    handleQueryInput(new Date(start).getTime(), "timestampFrom");
    handleQueryInput(new Date(end).getTime(), "timestampTo");
  };

  const filterEmptyKeys = (obj) => {
    const shouldKeep = (k, v) => (Array.isArray(v) ? v.length > 0 : v !== null);

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
    <>
      <h3>Search</h3>
      <Form className="mb-5">
        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Language Code</h5>
          </Form.Label>
          <Select
            onChange={(event) => handleQueryInput(event.value, "language")}
            options={(languageCodes || []).map((code, i) => ({
              label: code,
              value: code,
            }))}
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Date Range</h5>
          </Form.Label>
          <DatePicker
            selectsRange
            startDate={query.timestampFrom}
            endDate={query.timestampTo}
            dateFormat="yyyy-MM-dd"
            onChange={handleDates}
            maxDate={new Date()}
            // placeholderText="Select a start and end date"
          />
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>
            <h5>Sentiment</h5>
          </Form.Label>
          <h6>Sentiment of</h6>
          <RadioInput
            onChange={(e) => handleQueryInput(e.target.value, "sentimentWho")}
            choices={[
              { value: "agent", label: "Agent" },
              { value: "caller", label: "Caller" },
            ]}
            name="sentimentWho"
          />

          <h6>Statistic</h6>
          <RadioInput
            onChange={(e) => handleQueryInput(e.target.value, "sentimentWhat")}
            name="sentimentWhat"
            choices={[
              { value: "average", label: "Average" },
              { value: "trend", label: "Trend" },
            ]}
          />
          <h6>Trend</h6>
          <RadioInput
            onChange={(e) =>
              handleQueryInput(e.target.value, "sentimentDirection")
            }
            choices={[
              { value: "positive", label: "Positive" },
              { value: "negative", label: "Negative" },
            ]}
            name="sentimentDirection"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Entities</h5>
          </Form.Label>
          <MultiSelect
            options={(entities || []).map((entity) => ({
              value: entity,
              label: entity,
            }))}
            onChange={(value) => handleQueryInput(value, "entity")}
          />
        </Form.Group>
        <Button bg={"primary"} onClick={onClick}>
          Search
        </Button>
      </Form>

      {!editing && (
        <ContactTable
          data={results}
          loading={!results && !errorResults}
          empty={<NoMatches />}
        />
      )}
    </>
  );
}
const NoMatches = () => (
  <div>
    <h2>No Matches</h2>
    <p>Please try a different query</p>
  </div>
);

const RadioInput = ({ label, onChange, name, choices = [] }) => (
  <Form.Group className="mb-3">
    <Form.Label className="me-3">
      <h5>{label}</h5>
    </Form.Label>
    {choices.map((c) => (
      <Form.Check
        onChange={onChange}
        name={name}
        label={c.label}
        type="radio"
        value={c.value}
        inline
      />
    ))}
    <Form.Text></Form.Text>
  </Form.Group>
);

export default Search;
