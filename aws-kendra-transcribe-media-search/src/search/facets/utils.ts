import Kendra, { DocumentAttributeValueType } from "aws-sdk/clients/kendra";
import _ from "lodash";
import moment from "moment";
import { DocumentAttributeTitleLookup } from "../constants";
import { isNullOrUndefined } from "../utils";
import { facetConfiguration } from "../configuration";

export enum DocumentAttributeValueTypeEnum {
  StringValue = "STRING_VALUE",
  StringListValue = "STRING_LIST_VALUE",
  LongValue = "LONG_VALUE",
  DateValue = "DATE_VALUE",
}

export type IndexFieldNameToDocumentAttributeValueType = {
  [fieldName: string]: DocumentAttributeValueType;
};

export function getAttributeTypeLookup(
  index: Kendra.DescribeIndexResponse
): IndexFieldNameToDocumentAttributeValueType {
  if (
    !index ||
    !index.DocumentMetadataConfigurations ||
    _.isEmpty(index.DocumentMetadataConfigurations)
  ) {
    return {};
  }

  const types: IndexFieldNameToDocumentAttributeValueType = {};
  for (const field of index.DocumentMetadataConfigurations) {
    types[field.Name] = field.Type as DocumentAttributeValueType;
  }

  return types;
}

export type DataSourceNameLookup = {
  [dataSourceId: string]: string;
} | null;

export function getDataSourceNameLookup(
  dataSources: Kendra.DataSourceSummary[] | null
): DataSourceNameLookup {
  if (!dataSources) {
    return null;
  }

  const names: DataSourceNameLookup = {};
  for (const ds of dataSources) {
    if (ds && ds.Id && ds.Name) {
      names[ds.Id] = ds.Name;
    }
  }

  return names;
}

export function getValueType(
  value: Kendra.DocumentAttributeValue
): DocumentAttributeValueType {
  if (!isNullOrUndefined(value.LongValue)) {
    return DocumentAttributeValueTypeEnum.LongValue;
  } else if (!isNullOrUndefined(value.StringListValue)) {
    return DocumentAttributeValueTypeEnum.StringListValue;
  } else if (!isNullOrUndefined(value.DateValue)) {
    return DocumentAttributeValueTypeEnum.DateValue;
  } else {
    return DocumentAttributeValueTypeEnum.StringValue;
  }
}

export const DocumentAttributeValueComparator: {
  [key in DocumentAttributeValueType]: (
    v1: Kendra.DocumentAttributeValue,
    v2: Kendra.DocumentAttributeValue
  ) => boolean;
} = {
  [DocumentAttributeValueTypeEnum.StringValue]: (v1, v2) =>
    v1.StringValue === v2.StringValue,
  [DocumentAttributeValueTypeEnum.StringListValue]: (v1, v2) =>
    _.isEqual(v1.StringListValue, v2.StringListValue),
  [DocumentAttributeValueTypeEnum.LongValue]: (v1, v2) =>
    v1.LongValue === v2.LongValue,
  [DocumentAttributeValueTypeEnum.DateValue]: (v1, v2) =>
    v1.DateValue?.getTime() === v2.DateValue?.getTime(),
};

export function attributeValueEquals(
  a1: Kendra.DocumentAttributeValue,
  a2: Kendra.DocumentAttributeValue
) {
  const a1ValueType = getValueType(a1);
  const a2ValueType = getValueType(a2);

  if (a1ValueType !== a2ValueType) {
    return false;
  } else {
    const comparator = DocumentAttributeValueComparator[a1ValueType];
    if (comparator) {
      return comparator(a1, a2);
    } else {
      return a1 === a2;
    }
  }
}

export function attributeValueListContains(
  attributeValueList: Kendra.DocumentAttributeValue[],
  attributeValue: Kendra.DocumentAttributeValue
) {
  if (attributeValueList) {
    return (
      attributeValueList.findIndex((a) =>
        attributeValueEquals(a, attributeValue)
      ) !== -1
    );
  } else {
    return false;
  }
}

export function attributeValueToString(
  value?: Kendra.DocumentAttributeValue
): string {
  if (!value) {
    return "";
  } else if (value.StringValue) {
    return value.StringValue;
  } else if (value.StringListValue) {
    return _.join(value.StringListValue, " ");
  } else if (value.LongValue) {
    return `${value.LongValue}`;
  } else if (value.DateValue) {
    return moment.utc(value.DateValue).format();
  } else {
    return "";
  }
}

export function attributeValueToDate(
  value?: Kendra.DocumentAttributeValue
): moment.Moment {
  if (!value) {
    return moment.unix(0).utc();
  } else if (value.DateValue) {
    return moment.utc(value.DateValue);
  } else if (value.StringValue) {
    let stringAsMoment = moment.utc(value.StringValue);
    if (stringAsMoment.isValid()) {
      return stringAsMoment;
    }
  } else if (value.LongValue) {
    return moment.unix(value.LongValue).utc();
  }

  return moment.unix(0).utc();
}

export function attributeNameToFacetTitle(name: string): string {
  if (DocumentAttributeTitleLookup.hasOwnProperty(name)) {
    return DocumentAttributeTitleLookup[name] as string;
  } else {
    return name;
  }
}

export function selectHasReachedMaxFiltersForFacet(
  index: Kendra.DescribeIndexResponse | undefined,
  attribLists: {
    [key: string]: Kendra.DocumentAttributeValue[];
  },
  attribKey: Kendra.DocumentAttributeKey
): boolean {
  if (!index) {
    return true;
  }

  const types = getAttributeTypeLookup(index);

  const attribList = attribLists[attribKey] || [];
  const attribType =
    types[attribKey] ||
    (!_.isEmpty(attribList) ? getValueType(attribList[0]) : null);

  if (
    Object.keys(attribLists).length >=  facetConfiguration.maxSelectedFacets||
    attribList.length >= facetConfiguration.maxSelectedFacets
  ) {
    return true;
  } else {
    return false;
  }
}
