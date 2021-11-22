import React from "react";
import useSWRInfinite from "swr/infinite";
import { list } from "../api/api";
import { ContactTable } from "../components/ContactTable";
import { useDangerAlert } from "../hooks/useAlert";
import { Button } from "react-bootstrap";

const config = window.pcaSettings;

function Home({ setAlert }) {
  const fetcher = (url, startKey, startTimestamp) => {
    const opts = {
      count: config.api.pageSize,
    };

    if (startTimestamp) opts.startTimestamp = startTimestamp;
    if (startKey) opts.startKey = startKey;
    return list(opts);
  };

  const getKey = (pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.StartKey) return null;
    if (pageIndex === 0) return `/list`;

    const { StartKey, StartTimestamp } = previousPageData;

    return [
      `/list?startKey=${StartKey}&startTimestamp=${StartTimestamp}`,
      StartKey,
      StartTimestamp,
    ];
  };

  const { data, error, size, setSize } = useSWRInfinite(getKey, fetcher);

  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.length === 0;
  const isReachingEnd =
    isEmpty ||
    (data && data[data.length - 1].Records?.length < config.api.pageSize);

  const details = (data || []).map((d) => d.Records).flat();
  useDangerAlert(error, setAlert);

  return (
    <div>
      <h3>Home</h3>
      <ContactTable
        data={details}
        loading={!data && !error}
        empty={<Empty />}
      />
      <Button
        variant="primary"
        onClick={() => setSize(size + 1)}
        disabled={isLoadingMore || isReachingEnd}
      >
        {isLoadingMore
          ? "Loading..."
          : isReachingEnd
          ? "No more to load"
          : "Load more"}
      </Button>
    </div>
  );
}

const Empty = () => (
  <div>
    <h2>No results</h2>
  </div>
);

export default Home;
