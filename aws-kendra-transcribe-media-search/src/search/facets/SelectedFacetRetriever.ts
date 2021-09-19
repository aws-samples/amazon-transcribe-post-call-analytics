import Kendra from "aws-sdk/clients/kendra";
import moment from "moment";

export type DateRange = { min: moment.Moment; max: moment.Moment };

export interface SelectedFacetRetriever {
  getStringSelectionsOf(attributeKey: string): Kendra.DocumentAttributeValue[];

  getDateRangeSelectionsOf(attributeKey: string): DateRange | undefined;

  isSelected(
    attributeKey: string,
    attributeValue: Kendra.DocumentAttributeValue
  ): boolean;

  getAllSelected(): {
    [key: string]: Kendra.DocumentAttributeValue[];
  };

  isEmpty(): boolean;
}
