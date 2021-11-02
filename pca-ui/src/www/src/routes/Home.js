import React from "react";
import useSWR from "swr";
import { list } from "../api/api";
import { ContactTable } from "../components/ContactTable";
import { useDangerAlert } from "../hooks/useAlert";

const config = window.pcaSettings;

function Home({ setAlert }) {
  const fetcher = () => list({ count: config.api.pageSize });
  const { data, error } = useSWR(`/list`, fetcher);

  useDangerAlert(error, setAlert);

  return (
    <div>
      <h3>Home</h3>
      <ContactTable data={data} loading={!data && !error} empty={<Empty />} />
    </div>
  );
}

const Empty = () => (
  <div>
    <h2>No results</h2>
  </div>
);

export default Home;
