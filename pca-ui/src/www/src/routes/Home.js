import React, { useEffect, useState } from "react";
import { list } from "../api/api";
import { ContactTable } from "../components/ContactTable";
import config from "../config";

// TODO:
// * Wrap entire table row with hyperlink
// * Format timestamp and average accuracy

function Home() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const getData = async () => {
      const results = await list({
        count: config.api.pageSize,
      });

      setData(results);
    };
    getData();
  }, []);

  return (
    <div>
      <h3>Home</h3>
      <ContactTable data={data} />
    </div>
  );
}

export default Home;
