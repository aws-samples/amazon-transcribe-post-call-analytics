import * as React from "react";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 Calls' },
  { value: 50, label: '50 Calls' },
  { value: 100, label: '100 Calls' },
]

const VISIBLE_CONTENT_OPTIONS = [{
  label: 'Call list properties',
  options: [
    { id: "timestamp", label: "Timestamp", visible: true },
    { id: "jobName", label: "Job Name", visible: true },
    { id: "guid", label: "Guid",  visible: false },
    { id: "agent", label: "Agent",  visible: false },
    { id: "customer", label: "Customer",  visible: false },
    { id: "queue", label: "Queue", visible: false },
    { id: "resolved", label: "Resolved", visible: false },
    { id: "topic", label: "Topic", visible: false },
    { id: "product", label: "Product", visible: false },
    { id: "summary", label: "Summary", visible: false },
    { id: "callerSentimentScore",  label: "Cust Sentiment", visible: true },
    { id: "langCode", label: "Lang Code", visible: true },
    { id: "duration", label: "Duration", visible: true }
  ]
}];

export const DEFAULT_PREFERENCES = {
  pageSize: 30,
  wrapLines: false,
  stripedRows: false,
  contentDensity: 'comfortable',
  stickyColumns: { first: 0, last: 1 },
  visibleContent: [
    'timestamp',
    'jobName',
    'agent',
    'callerSentimentScore',
    'langCode',
    'duration'
  ]
};

export const ContactTablePreferences = ({
  preferences,
  setPreferences,
  disabled,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  visibleContentOptions = VISIBLE_CONTENT_OPTIONS,
}) => (
  <CollectionPreferences
    title="Preferences"
    confirmLabel="Confirm"
    cancelLabel="Cancel"
    onConfirm={({ detail }) => setPreferences(detail)}
    preferences={preferences}
    disabled={disabled}
    stickyColumnsPreference={{}}
    /*pageSizePreference={{
      title: "Page Size",
      options: pageSizeOptions
    }}*/
    wrapLinesPreference={{
      label: 'Wrap lines',
      description: 'Check to see all the text and wrap the lines',
    }}
    visibleContentPreference={{
      title: 'Select visible columns',
      options: visibleContentOptions,
    }}
  />
);