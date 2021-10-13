import React, { useEffect, useState } from "react";
import { list } from "../api/api";
import { ContactTable } from "../components/ContactTable";

const config = window.pcaSettings;

// TODO:
// * Wrap entire table row with hyperlink
// * Format timestamp and average accuracy

function Home() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const getData = async () => {
      try {
        const results = await list({
          count: config.api.pageSize,
        });

        setData(results);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    getData();
  }, []);

  return (
    <div>
      <h3>Home</h3>
      <ContactTable data={data} loading={loading} />
    </div>
  );
}

export default Home;
