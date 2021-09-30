import React, { useEffect, useState } from "react";
import Table from "react-bootstrap/Table";
import { list } from "../api/api";
import config from "../config";

function Home() {
  const [tableData, setTableData] = useState([]);

  useEffect(() => {
    const getData = async () => {
      const data = await list({
        count: config.api.pageSize,
      });

      setTableData(data);
    };
    getData();
  }, []);

  return (
    <div>
      <h3>Home</h3>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Job Name</th>
            <th>Timestamp</th>
            <th>Average Accuracy</th>
            <th>Language Code</th>
            <th>Call Duration</th>
          </tr>
        </thead>
        <tbody>
          {tableData.map((row) => (
            <tr>
              <td>{row.jobName}</td>
              <td>{row.timestamp}</td>
              <td>{row.accuracy}</td>
              <td>{row.lang}</td>
              <td>{row.duration}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default Home;
