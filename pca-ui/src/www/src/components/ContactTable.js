import { Placeholder, Table } from "react-bootstrap";
import { useHistory } from "react-router-dom";
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
  columns.map((c, i) => (
    <td key={i}>
      <Placeholder as="p" animation="glow">
        <Placeholder xs={12} />
      </Placeholder>
    </td>
  ));

const NoMatches = () => (
  <tr>
    <td colspan={columns.length}>
      <div className="d-flex justify-content-center py-4">
        <div>
          <h2>No Matches</h2>
          <p>Please try a different query</p>
        </div>
      </div>
    </td>
  </tr>
);

export const ContactTable = ({ data = [], loading = false }) => {
  const history = useHistory();

  const onClick = (e) => {
    history.push(`/dashboard/${e.key}`);
  };

  return (
    <Table border hover striped>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <Loading />
          </tr>
        ) : data.length == 0 ? (
          <NoMatches />
        ) : (
          data.map((row, i) => (
            <tr
              key={i}
              onClick={(e) => onClick(row)}
              style={{ cursor: "pointer" }}
            >
              {columns.map((c, j) => (
                <td key={j}>{c.value(row, i)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
};
