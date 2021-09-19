import _ from "lodash";
import { exampleData1 } from "./exampleData1";
import { exampleData2 } from "./exampleData2";
import { exampleFilterData1 } from "./exampleFilterData1";
import { exampleFilterData2 } from "./exampleFilterData2";

export const getSearchResults = (pageNumber: number, filter: any) => {
  if (pageNumber % 2 === 1) {
    return !_.isEmpty(filter) ? exampleFilterData1 : exampleData1;
  } else {
    return !_.isEmpty(filter) ? exampleFilterData2 : exampleData2;
  }
};
