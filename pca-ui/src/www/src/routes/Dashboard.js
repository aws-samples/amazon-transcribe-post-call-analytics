import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { get } from "../api/api";

function Dashboard() {
  const { key } = useParams();

  const [data, setData] = useState({});

  useEffect(() => {
    const getData = async () => {
      const d = await get(key);
      setData(d);
    };
    getData();
  }, [key]);
  return (
    <div>
      <h3>Dashboard</h3>
      <h4>{key}</h4>
    </div>
  );
}

export default Dashboard;
