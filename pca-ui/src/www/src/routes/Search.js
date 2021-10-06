import { useState } from "react";

import Form from "react-bootstrap/Form";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

import { entities as getEntities, languages as getLanguages } from "../api/api";

function Search() {
  const [entities, setEntities] = useState([]);
  const [languageCodes, setLanguageCodes] = useState([]);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);

  const [error, setError] = useState();
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState({
    entity: "",
    timestampFrom: "",
    timestampTo: "",
    language: "",
    sentimentWho: "Agent",
    sentimentWhat: "Average",
    sentimentDirection: "positive",
  });
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

    handleQueryInput(start, "timestampFrom");
    handleQueryInput(end, "timestampTo");

    setStartDate(start);
    setEndDate(end);
  };

  const handleQueryInput = (input, field) => {
    console.log({ input });
    setQuery((q) => ({ ...q, [field]: input }));
  };

  return (
    <>
      <h3>Search</h3>
      <Form>
        <Form.Group className="mb-3">
          <Form.Label>Language Code</Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "language")}
          >
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
          <Form.Check
            onChange={(e) => handleQueryInput(e.target.value, "sentimentWho")}
            inline
            name="whoCalled"
            label="Agent"
            type="radio"
            value={"agent"}
          />
          <Form.Check
            onChange={(e) =>
              handleQueryInput(e.currentTarget.value, "sentimentWho")
            }
            inline
            label="Caller"
            name="whoCalled"
            type="radio"
            value="caller"
          />
          <Form.Text></Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Entities</Form.Label>
          <Form.Select
            onChange={(e) => handleQueryInput(e.target.value, "entity")}
          >
            <option value="">-</option>
            {entities.map((entity) => (
              <option value={entity}>{entity}</option>
            ))}
          </Form.Select>
          <Form.Text></Form.Text>
        </Form.Group>
      </Form>
    </>
  );
}

export default Search;
