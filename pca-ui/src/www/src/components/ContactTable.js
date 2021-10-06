import Table from "react-bootstrap/Table";

const columns = [
  { label: "#", value: (d, i) => <a href={`/dashboard/${d.key}`}>{i}</a> },
  { label: "Job Name", value: (d) => d.jobName },
  { label: "Timestamp", value: (d) => d.timestamp },
  { label: "Accuracy", value: (d) => d.accuracy },
  { label: "Language Code", value: (d) => d.lang },
  { label: "Call Duration", value: (d) => d.duration },
];

export const ContactTable = ({ data = [] }) => (
  <Table striped bordered hover>
    <thead>
      <tr>
        {columns.map((c) => (
          <th>{c.label}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {data.map((row, index) => (
        <tr>
          {columns.map((c) => (
            <td>{c.value(row, index)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </Table>
);
