import { useState } from "react";

import { Button, Form } from "react-bootstrap";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

import {
  entities as getEntities,
  languages as getLanguages,
  search,
} from "../api/api";
import { ContactTable } from "../components/ContactTable";

function Search({ setAlert }) {
  const [entities, setEntities] = useState([]);
  const [languageCodes, setLanguageCodes] = useState([]);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [editing, setEditing] = useState(true);

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  const [query, setQuery] = useState({});

  const [results, setResults] = useState([]);

  useState(() => {
    const getData = async () => {
      try {
        setLoadingOptions(true);
        const e = await getEntities();
        setEntities(e);

        const l = await getLanguages();
        setLanguageCodes(l);
      } catch (err) {
        console.debug(err);
        setAlert({
          heading: "Something went wrong",
          variant: "danger",
          text: "Unable to load data. Please try again later",
        });
      } finally {
        setLoadingOptions(false);
      }
    };

    getData();
  }, []);

  const handleDates = (dates) => {
    const [start, end] = dates;

    handleQueryInput(new Date(start).getTime(), "timestampFrom");
    handleQueryInput(new Date(end).getTime(), "timestampTo");

    setStartDate(start);
    setEndDate(end);
  };

  const handleQueryInput = (input, field) => {
    console.debug({ input });
    setQuery((q) => ({ ...q, [field]: input }));
  };

  const onClick = () => {
    const getData = async () => {
      try {
        setEditing(false);
        setLoadingResults(true);
        const data = await search(query);
        setResults(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingResults(false);
      }
    };

    getData();
  };

  return (
    <>
      <h3>Search</h3>
      <Form className="mb-5">
        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Language Code</h5>
          </Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "language")}
          >
            {(languageCodes || []).map((code, i) => (
              <option key={i}>{code}</option>
            ))}
            <option value="">-</option>
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Date Range</h5>
          </Form.Label>
          <DatePicker
            selected={startDate}
            startDate={startDate}
            endDate={endDate}
            selectsRange
            dateFormat="yyyy-MM-dd"
            onChange={handleDates}
            maxDate={new Date()}
          />
        </Form.Group>

        <RadioInput
          label="Sentiment of"
          onChange={(e) => handleQueryInput(e.target.value, "sentimentWho")}
          choices={[
            { value: "agent", label: "Agent" },
            { value: "caller", label: "Caller" },
          ]}
          name="sentimentWho"
        />

        <RadioInput
          label="Statistic"
          onChange={(e) => handleQueryInput(e.target.value, "sentimentWhat")}
          name="sentimentWhat"
          choices={[
            { value: "average", label: "Average" },
            { value: "trend", label: "Trend" },
          ]}
        />

        <RadioInput
          label="Direction"
          onChange={(e) =>
            handleQueryInput(e.target.value, "sentimentDirection")
          }
          choices={[
            { value: "positive", label: "Positive" },
            { value: "negative", label: "Negative" },
          ]}
          name="sentimentDirection"
        />

        <Form.Group className="mb-3">
          <Form.Label>
            <h5>Entities</h5>
          </Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "entity")}
          >
            <option value="">-</option>
            {(entities || []).map((entity, i) => (
              <option key={i} value={entity}>
                {entity}
              </option>
            ))}
          </Form.Select>
          <Form.Text></Form.Text>
        </Form.Group>
        <Button bg={"primary"} onClick={onClick}>
          Search
        </Button>
      </Form>

      {!editing && <ContactTable data={results} loading={loadingResults} />}
    </>
  );
}

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
