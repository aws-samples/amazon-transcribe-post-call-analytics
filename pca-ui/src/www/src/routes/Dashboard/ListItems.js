import { ListGroup } from "react-bootstrap";

export const ListItems = ({ data }) => {
  if (!data.length) return <p>No items to display</p>;
  return (
    <ListGroup variant="flush">
      {data.map((v, i) => (
        <ListGroup.Item key={i}>
          <p>{v}</p>
        </ListGroup.Item>
      ))}
    </ListGroup>
  );
};
