import Table from "react-bootstrap/Table";
import Placeholder from "react-bootstrap/Placeholder";

import { Percentage, Time, Timestamp } from "../format";

const columns = [
  { label: "#", value: (d, i) => <a href={`/dashboard/${d.key}`}>{i}</a> },
  { label: "Job Name", value: (d) => d.jobName },
  { label: "Timestamp", value: (d) => Timestamp(d.timestamp) },
  { label: "Accuracy", value: (d) => Percentage(d.accuracy) },
  { label: "Language Code", value: (d) => d.lang },
  { label: "Call Duration", value: (d) => Time(d.duration) },
];

const Loading = () =>
  columns.map((c) => (
    <td>
      <Placeholder as="p" animation="glow">
        <Placeholder xs={12} />
      </Placeholder>
    </td>
  ));

export const ContactTable = ({ data = [], loading = false }) => (
  <Table striped bordered hover>
    <thead>
      <tr>
        {columns.map((c) => (
          <th>{c.label}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {loading ? (
        <tr>
          <Loading />
        </tr>
      ) : (
        data.map((row, index) => (
          <tr>
            {columns.map((c) => (
              <td>{c.value(row, index)}</td>
            ))}
          </tr>
        ))
      )}
    </tbody>
  </Table>
);
