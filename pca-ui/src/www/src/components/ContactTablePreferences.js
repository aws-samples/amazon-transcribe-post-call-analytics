import * as React from "react";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import { useTranslation } from 'react-i18next';
import '../styles/ContactTablePreferences.css';

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 Calls' },
  { value: 50, label: '50 Calls' },
  { value: 100, label: '100 Calls' },
]

const VISIBLE_CONTENT_OPTIONS = (t) => [{
  label: t('contactTable.callListProperties'),
  options: [
    /*{ id: "timestamp", label: "Timestamp", visible: true },
    { id: "jobName", label: "Job Name", visible: true },*/
    { id: "status", label: t("contactTable.status"), visible: true },
    { id: "guid", label: t("contactTable.guid"), visible: false },
    { id: "agent", label: t("contactTable.agent"), visible: false },
    { id: "customer", label: t("contactTable.customer"), visible: false },
    { id: "queue", label: t("contactTable.queue"), visible: false },
    { id: "summary_resolved", label: t("contactTable.summary_resolved"), visible: true },
    { id: "summary_topic", label: t("contactTable.summary_topic"), visible: true },
    { id: "summary_product", label: t("contactTable.summary_product"), visible: true },
    { id: "summary_summary", label: t("contactTable.summary_summary"), visible: true },
    { id: "callerSentimentScore", label: t("contactTable.callerSentimentScore"), visible: true },
    { id: "langCode", label: t("contactTable.langCode"), visible: true },
    { id: "duration", label: t("contactTable.duration"), visible: true },
    /*{ id: "menu", label: "Menu", visible: true }*/
  ]
}];

export const DEFAULT_PREFERENCES = {
  pageSize: 30,
  wrapLines: false,
  stripedRows: false,
  contentDensity: 'comfortable',
  /* stickyColumns: { first: 0, last: 0 },*/
  visibleContent: [
    'timestamp',
    'jobName',
    'status',
    'agent',
    'summary_resolved',
    'summary_topic',
    'summary_product',
    'summary_summary',
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
}) => {
  const { t } = useTranslation();

  return (
      <CollectionPreferences
        title={t("contactTable.preferences")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onConfirm={({ detail }) => setPreferences(detail)}
        preferences={preferences}
        disabled={disabled}
        stickyColumnsPreference={{}}
        /*pageSizePreference={{
          title: "Page Size",
          options: pageSizeOptions
        }}*/
        wrapLinesPreference={{
          label: t('contactTable.wrapLines'),
          description: t('contactTable.wrapLinesDescription'),
        }}
        visibleContentPreference={{
          title: t('contactTable.selectVisibleColumns'),
          options: VISIBLE_CONTENT_OPTIONS(t),
        }}
      />
  );
}