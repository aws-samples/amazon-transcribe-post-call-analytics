import { useState } from "react";

import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

import {
  entities as getEntities,
  languages as getLanguages,
  search,
} from "../api/api";
import { ContactTable } from "../components/ContactTable";

function Search() {
  const [entities, setEntities] = useState([]);
  const [languageCodes, setLanguageCodes] = useState([]);

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [editing, setEditing] = useState(true);
  const [error, setError] = useState();
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);

  const [query, setQuery] = useState({});

  const [results, setResults] = useState([]);

  useState(() => {
    const getData = async () => {
      try {
        const e = await getEntities();
        setEntities(e);

        const l = await getLanguages();
        setLanguageCodes(l);
      } catch (err) {
        console.log(err);
        setError(err);
      } finally {
        setLoading(false);
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
    console.log({ input });
    setQuery((q) => ({ ...q, [field]: input }));
  };

  const onClick = () => {
    const getData = async () => {
      try {
        setLoadingResults(true);
        setEditing(false);
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
          <Form.Label>Language Code</Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "language")}
          >
            {languageCodes.map((code, i) => (
              <option key={i}>{code}</option>
            ))}
            <option value="">-</option>
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Date Range</Form.Label>
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

        <Form.Group className="mb-3">
          <Form.Label>Sentiment</Form.Label>
          <Form.Check
            onChange={(e) => handleQueryInput(e.target.value, "sentimentWho")}
            name="sentimentWho"
            label="Agent"
            type="radio"
            value={"agent"}
            inline
          />
          <Form.Check
            onChange={(e) =>
              handleQueryInput(e.currentTarget.value, "sentimentWho")
            }
            inline
            label="Caller"
            name="sentimentWho"
            type="radio"
            value="caller"
          />
          <Form.Text></Form.Text>
        </Form.Group>

        <Form.Group className="mb-3 ">
          <Form.Label>Unknown</Form.Label>
          <Form.Check
            onChange={(e) => handleQueryInput(e.target.value, "sentimentWhat")}
            name="sentimentWhat"
            label="Average"
            type="radio"
            value={"average"}
            inline
          />
          <Form.Check
            onChange={(e) =>
              handleQueryInput(e.currentTarget.value, "sentimentWhat")
            }
            inline
            label="Trend"
            name="sentimentWhat"
            type="radio"
            value="trend"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Unknown</Form.Label>
          <Form.Check
            onChange={(e) =>
              handleQueryInput(e.target.value, "sentimentDirection")
            }
            name="sentimentDirection"
            label="Positive"
            type="radio"
            value={"positive"}
            inline
          />
          <Form.Check
            onChange={(e) =>
              handleQueryInput(e.currentTarget.value, "sentimentDirection")
            }
            inline
            label="Negative"
            name="sentimentDirection"
            type="radio"
            value="negative"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Entities</Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "entity")}
          >
            <option value="">-</option>
            {entities.map((entity, i) => (
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

      {!editing && !loadingResults ? (
        <div>
          {results.length === 0 ? (
            <NoMatches />
          ) : (
            <ContactTable data={results} />
          )}
        </div>
      ) : null}
    </>
  );
}

const NoMatches = () => (
  <Card>
    <Card.Body>
      <Card.Title>No Matches</Card.Title>
      <Card.Subtitle>Please try a different query</Card.Subtitle>
    </Card.Body>
  </Card>
);

export default Search;
