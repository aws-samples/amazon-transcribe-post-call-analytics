import Kendra from "aws-sdk/clients/kendra";

export const PAGE_SIZE = 10;

export const CHARACTER_WIDTH = 13;

export const COLLAPSED_LINES = 2;

export const FAQ_MATCHES = "Kendra found questions like yours";

export interface FAQExpandedMapType {
  expanded: boolean;
}

export enum QueryResultType {
  All = "ALL",
  Answer = "ANSWER",
  QuestionAnswer = "QUESTION_ANSWER",
  Document = "DOCUMENT",
}

export enum DocumentAttributeKeys {
  Category = "_category",
  CreatedAt = "_created_at",
  DataSourceId = "_data_source_id",
  DocumentTitle = "_document_title",
  Format = "_file_type",
  SourceUri = "_source_uri",
  UpdatedAt = "_last_updated_at",
  Version = "_version",
  ViewCount = "_view_count",
}

export const DocumentAttributeTitleLookup: { [key: string]: string } = {
  [DocumentAttributeKeys.Category]: "Category",
  [DocumentAttributeKeys.CreatedAt]: "Created at",
  [DocumentAttributeKeys.DataSourceId]: "Data source",
  [DocumentAttributeKeys.DocumentTitle]: "Title",
  [DocumentAttributeKeys.Format]: "File type",
  [DocumentAttributeKeys.SourceUri]: "Source URI",
  [DocumentAttributeKeys.UpdatedAt]: "Updated at",
  [DocumentAttributeKeys.Version]: "Version",
  [DocumentAttributeKeys.ViewCount]: "View count",
};

export type AttributeMap = {
  [key in DocumentAttributeKeys]: Kendra.DocumentAttributeValue;
};

export enum AdditionalResultAttributeKeys {
  QuestionText = "QuestionText",
  AnswerText = "AnswerText",
}

export type AdditionalResultAttributeMap = {
  [key in AdditionalResultAttributeKeys]: {};
};

export enum Relevance {
  Relevant = "RELEVANT",
  NotRelevant = "NOT_RELEVANT",
  Click = "CLICK",
}

export enum DocumentAttributeValueTypeEnum {
  DATE_VALUE = "DATE_VALUE",
  LONG_VALUE = "LONG_VALUE",
  STRING_LIST_VALUE = "STRING_LIST_VALUE",
  STRING_VALUE = "STRING_VALUE",
}
