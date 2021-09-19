import Kendra from "aws-sdk/clients/kendra";

export type YearHeuristic = { [year: number]: number };

export interface AvailableDateFacet {
  minYear: number;
  maxYear: number;
  yearHeuristic: YearHeuristic;
}

export type DateFacetChangeHandler = (
  key: Kendra.DocumentAttributeKey,
  changeDetail?: [number, number]
) => void;

export type FacetValue = Kendra.DocumentAttributeValueCountPair & {
    ValueLabel: string;
};
