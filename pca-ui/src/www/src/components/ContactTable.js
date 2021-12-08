import { Table } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { Formatter } from "../format";
import { Placeholder } from "./Placeholder";
import { SentimentIcon } from "./SentimentIcon";
import { TrendIcon } from "./TrendIcon";
import "./ContactTable.css";

const columns = [
  {
    label: "Job Name",
    value: (d) => d.jobName,
  },
  { label: "Timestamp", value: (d) => Formatter.Timestamp(d.timestamp) },
  {
    label: (
      <div className="col-header-wrapper text-center">Customer Sentiment</div>
    ),
    value: (d) => (
      <div className="d-flex justify-content-evenly">
        <SentimentIcon score={d?.callerSentimentScore} />
        <TrendIcon trend={d.callerSentimentChange} />
      </div>
    ),
  },

  {
    label: <div className="col-header-wrapper text-left">Language Code</div>,
    value: (d) => d.lang,
  },
  {
    label: <div className="col-header-wrapper text-left">Call Duration</div>,
    value: (d) => Formatter.Time(d.duration),
  },
];

const Loading = () =>
  columns.map((c, i) => (
    <td key={i}>
      <Placeholder />
    </td>
  ));

const NoMatches = ({ children }) => (
  <tr>
    <td colSpan={columns.length}>
      <div className="d-flex justify-content-center py-4">{children}</div>
    </td>
  </tr>
);

export const ContactTable = ({ data = [], loading = false, empty }) => {
  const history = useHistory();

  const onClick = (e) => {
    history.push(`/dashboard/${e.key}`);
  };

  return (
    <Table hover striped>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th className="text-muted text-uppercase" key={i}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <Loading />
          </tr>
        ) : data.length === 0 ? (
          <NoMatches children={empty} />
        ) : (
          data.map((row, i) => (
            <tr className="contact-table" key={i} onClick={(e) => onClick(row)}>
              {columns.map((c, j) => (
                <td className="fs-5 col" key={j}>
                  {c.value(row) || "-"}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
};
