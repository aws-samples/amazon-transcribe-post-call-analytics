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
    setStartDate(start);
    setEndDate(end);
  };

  return (
    <>
      <h3>Search</h3>
      <Form>
        <Form.Group className="mb-3">
          <Form.Label>Language Code</Form.Label>
          <Form.Select>
            {languageCodes.map((code) => (
              <option>{code}</option>
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
          <Form.Control />
          <Form.Text></Form.Text>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Entities</Form.Label>
          <Form.Select>
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
