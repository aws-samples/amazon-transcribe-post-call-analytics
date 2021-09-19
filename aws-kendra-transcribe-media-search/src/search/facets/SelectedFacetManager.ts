import { SelectedFacetRetriever, DateRange } from "./SelectedFacetRetriever";
import Kendra, { DocumentAttributeValueType } from "aws-sdk/clients/kendra";
import _ from "lodash";
import {
  attributeValueEquals,
  attributeValueListContains,
  IndexFieldNameToDocumentAttributeValueType,
  getValueType,
  DocumentAttributeValueTypeEnum,
  attributeValueToString,
  attributeValueToDate,
} from "./utils";
import { isNullOrEmpty } from "../utils";
import moment from "moment";

export type DocumentAttributeStringSelections = {
  [attributeKey: string]: Kendra.DocumentAttributeValue[];
};

export type DocumentAttributeDateRangeSelections = {
  [attributeKey: string]: DateRange;
};

export class SelectedFacetManager implements SelectedFacetRetriever {
  constructor(
    private stringMap: DocumentAttributeStringSelections,
    private dateRangeMap: DocumentAttributeDateRangeSelections
  ) {
    this.stringMap = stringMap;
    this.dateRangeMap = dateRangeMap;
  }

  static empty() {
    return new SelectedFacetManager({}, {});
  }

  isEmpty(): boolean {
    return _.isEmpty(this.stringMap) && _.isEmpty(this.dateRangeMap);
  }

  // Get

  getStringSelectionsOf(attributeKey: string): Kendra.DocumentAttributeValue[] {
    return this.stringMap[attributeKey];
  }

  getDateRangeSelectionsOf(attributeKey: string): DateRange | undefined {
    return this.dateRangeMap[attributeKey];
  }

  isSelected(
    attributeKey: string,
    attributeValue: Kendra.DocumentAttributeValue
  ): boolean {
    const attributeValueList: Kendra.DocumentAttributeValue[] = this.getStringSelectionsOf(
      attributeKey
    );
    return attributeValueListContains(attributeValueList, attributeValue);
  }

  getAllSelected(): {
    [key: string]: Kendra.DocumentAttributeValue[];
  } {
    let res: {
      [key: string]: Kendra.DocumentAttributeValue[];
    } = {};

    // get all string type selections
    for (const attributeKey in this.stringMap) {
      if (this.stringMap.hasOwnProperty(attributeKey)) {
        const attributeList = this.stringMap[attributeKey];
        if (!_.isEmpty(attributeList)) {
          res[attributeKey] = attributeList;
        }
      }
    }

    // get all date type selections
    for (const attributeKey in this.dateRangeMap) {
      if (this.dateRangeMap.hasOwnProperty(attributeKey)) {
        let attributeList: Kendra.DocumentAttributeValue[] = [];
        const dateRange: DateRange = this.dateRangeMap[attributeKey];
        if (dateRange && dateRange.min && dateRange.max) {
          attributeList.push({ DateValue: dateRange.min.toDate() });
          attributeList.push({ DateValue: dateRange.max.toDate() });
          res[attributeKey] = attributeList;
        }
      }
    }
    return res;
  }

  // Clear

  private clear(
    attributeKey: string,
    attributeValue: Kendra.DocumentAttributeValue
  ): SelectedFacetManager {
    let attributeValueList: Kendra.DocumentAttributeValue[] = this.getStringSelectionsOf(
      attributeKey
    );

    if (
      !isNullOrEmpty(attributeValueList) &&
      attributeValueListContains(attributeValueList, attributeValue)
    ) {
      attributeValueList = attributeValueList.filter(
        (item) => !attributeValueEquals(item, attributeValue)
      );
    }
    return new SelectedFacetManager(
      { ...this.stringMap, [attributeKey]: attributeValueList },
      this.dateRangeMap
    );
  }

  clearAll(): SelectedFacetManager {
    return new SelectedFacetManager({}, {});
  }

  clearSelectionsOf(attributeKey: string): SelectedFacetManager {
    delete this.stringMap[attributeKey];
    return new SelectedFacetManager(this.stringMap, this.dateRangeMap);
  }

  clearDateSelectionsOf(attributeKey: string): SelectedFacetManager {
    delete this.dateRangeMap[attributeKey];
    return new SelectedFacetManager(this.stringMap, this.dateRangeMap);
  }

  // Set

  private set(
    attributeKey: string,
    attributeValue: Kendra.DocumentAttributeValue
  ): SelectedFacetManager {
    const attributeValueList: Kendra.DocumentAttributeValue[] =
      this.getStringSelectionsOf(attributeKey) || [];
    if (!attributeValueListContains(attributeValueList, attributeValue)) {
      let newAttributeValueList = attributeValueList.slice();
      newAttributeValueList.push(attributeValue);
      return new SelectedFacetManager(
        { ...this.stringMap, [attributeKey]: newAttributeValueList },
        this.dateRangeMap
      );
    }
    return new SelectedFacetManager(this.stringMap, this.dateRangeMap);
  }

  setIsSelected(
    attributeKey: string,
    attributeValue: Kendra.DocumentAttributeValue,
    isSelected: boolean
  ): SelectedFacetManager {
    if (isSelected) {
      return this.set(attributeKey, attributeValue);
    } else {
      return this.clear(attributeKey, attributeValue);
    }
  }

  setDateRange(
    attributeKey: string,
    value?: [number, number]
  ): SelectedFacetManager {
    if (value) {
      const minValue = moment(new Date(value[0], 0))
        .utc()
        .endOf("year")
        .millisecond(0);

      const maxValue = moment(new Date(value[1], 0))
        .utc()
        .endOf("year")
        .millisecond(0);

      return new SelectedFacetManager(this.stringMap, {
        ...this.dateRangeMap,
        [attributeKey]: { min: minValue, max: maxValue },
      });
    } else {
      return this.clearDateSelectionsOf(attributeKey);
    }
  }

  // filter builder
  buildAttributeFilter(
    attributeTypeLookup?: IndexFieldNameToDocumentAttributeValueType
  ): Kendra.AttributeFilter | undefined {
    const attributeList = this.getAllSelected();

    if (!attributeTypeLookup) {
      return undefined;
    }

    let filters: Kendra.AttributeFilter[] = [];

    for (const attributeKey in attributeList) {
      if (attributeList.hasOwnProperty(attributeKey)) {
        const attributeValueList = attributeList[attributeKey];

        if (!_.isEmpty(attributeValueList)) {
          // Get index field type, or fall back to "seen" type
          const attribType =
            attributeTypeLookup[attributeKey] ||
            getValueType(attributeValueList[0]);
          const filter = this.selectAttributeFilterForAttributeList(
            attributeKey,
            attributeValueList,
            attribType
          );

          if (!isNullOrEmpty(filter)) {
            filters = filters.concat(filter);
          }
        }
      }
    }

    if (_.isEmpty(filters)) {
      return undefined;
    }

    return {
      AndAllFilters: filters,
    };
  }

  private selectAttributeFilterForAttributeList = (
    attributeKey: string,
    attributeList: Kendra.DocumentAttributeValue[],
    attributeType: DocumentAttributeValueType
  ): Kendra.AttributeFilter[] => {
    if (_.isEmpty(attributeList)) {
      return [];
    }

    // Handle special cases based on the *index field type* (NOT the "seen" type, may need to convert)
    if (attributeType === DocumentAttributeValueTypeEnum.DateValue) {
      return this.selectDateAttributeFilter(attributeKey, attributeList);
    } else if (
      attributeType === DocumentAttributeValueTypeEnum.StringListValue
    ) {
      return this.selectStringListAttributeFilter(attributeKey, attributeList);
    } else if (attributeType === DocumentAttributeValueTypeEnum.LongValue) {
      return this.selectLongAttributeFilter(attributeKey, attributeList);
    } else {
      let attributeFilterList: Kendra.AttributeFilterList = [];

      for (const attributeValue of attributeList) {
        attributeFilterList.push({
          EqualsTo: {
            Key: attributeKey,
            Value: attributeValue,
          },
        });
      }

      return [
        {
          OrAllFilters: attributeFilterList,
        },
      ];
    }
  };

  private selectLongAttributeFilter = (
    attributeKey: string,
    attributeList: Kendra.DocumentAttributeValue[]
  ): Kendra.AttributeFilter[] => {
    let attributeFilterList: Kendra.AttributeFilterList = [];

    for (const attributeValue of attributeList) {
      if (attributeValue.LongValue) {
        attributeFilterList.push({
          EqualsTo: {
            Key: attributeKey,
            Value: { LongValue: attributeValue.LongValue },
          },
        });
      } else if (attributeValue.StringValue) {
        attributeFilterList.push({
          EqualsTo: {
            Key: attributeKey,
            Value: { StringValue: attributeValue.StringValue },
          },
        });
      } else {
        continue;
      }
    }

    return [
      {
        OrAllFilters: attributeFilterList,
      },
    ];
  };

  private selectStringListAttributeFilter = (
    attributeKey: string,
    attributeList: Kendra.DocumentAttributeValue[]
  ): Kendra.AttributeFilter[] => {
    let stringValueList: string[] = [];
    for (const attributeValue of attributeList) {
      if (attributeValue && attributeValue.StringValue) {
        stringValueList.push(attributeValueToString(attributeValue));
      }
    }

    return [
      {
        ContainsAny: {
          Key: attributeKey,
          Value: { StringListValue: stringValueList },
        },
      },
    ];
  };

  private selectDateAttributeFilter = (
    attributeKey: string,
    attributeList: Kendra.DocumentAttributeValue[]
  ): Kendra.AttributeFilter[] => {
    // If facet was returned as StringValue, convert to DateValue
    let dates: Date[] = [];
    for (const attributeValue of attributeList) {
      const date = attributeValueToDate(attributeValue);
      if (date) {
        dates.push(date.toDate());
      }
    }

    if (_.isEmpty(dates)) {
      return [];
    }

    // Compute max range
    const range: { min: Date; max: Date } = {
      max: dates[0],
      min: dates[0],
    };

    for (const date of dates) {
      const dateValueMs = date.valueOf();
      if (dateValueMs < range.min.valueOf()) {
        range.min = date;
      }

      if (dateValueMs > range.max.valueOf()) {
        range.max = date;
      }
    }

    return [
      {
        AndAllFilters: [
          {
            GreaterThanOrEquals: {
              Key: attributeKey,
              Value: { DateValue: range.min },
            },
          },
          {
            LessThanOrEquals: {
              Key: attributeKey,
              Value: { DateValue: range.max },
            },
          },
        ],
      },
    ];
  };
}
