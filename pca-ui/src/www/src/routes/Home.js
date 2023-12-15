import React from "react";
import useSWRInfinite from "swr/infinite";
import axios from 'axios';
import { list } from "../api/api";
import { ContactTable } from "../components/ContactTable";
import { Upload } from "../components/Upload";
import ExpandableSection from "@cloudscape-design/components/expandable-section";


import { useDangerAlert } from "../hooks/useAlert";
import { presign } from "../api/api";
import {
  Button,
  ContentLayout,
  Link,
  Header,
  BreadcrumbGroup,
  Grid,
  FileUpload,
  FormField,
  Form,
  SpaceBetween,
  Spinner,
  ColumnLayout,
  Container
} from '@cloudscape-design/components';

const config = window.pcaSettings;

function Home({ setAlert }) {
  const fetcher = (url, startKey, timestampFrom) => {
    const opts = {
      count: config.api.pageSize,
    };

    if (timestampFrom) opts.timestampFrom = timestampFrom;
    if (startKey) opts.startKey = startKey;
    return list(opts);
  };

  const getKey = (pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.StartKey) return null;
    if (pageIndex === 0) return `/list`;

    const { StartKey, timestampFrom } = previousPageData;

    return [
      `/list?startKey=${StartKey}&timestampFrom=${timestampFrom}`,
      StartKey,
      timestampFrom,
    ];
  };

  const { data, error, size, setSize } = useSWRInfinite(getKey, fetcher);
  const [value, setValue] = React.useState([]);

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
    <>
      <ContentLayout 
        header={
            <Header
              variant="h1"
              description="Select a call record to view details."
              info={<Link variant="info" ariaLabel="Info goes here.">Info</Link>}>
              Call List
            </Header>
        }>
        <Container>
          <Grid
            gridDefinition={[
              {colspan: { default:12} },
              {colspan: { default:12} },
              {colspan: { default:12} }
            ]}
          >
            <ExpandableSection headerText="Upload call recordings">
                <Upload/>
            </ExpandableSection>
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
          </Grid>
        </Container>
        
      </ContentLayout>
      </>
  );
}

const Empty = () => (
  <div>
    <h2>No results</h2>
  </div>
);

export default Home;
