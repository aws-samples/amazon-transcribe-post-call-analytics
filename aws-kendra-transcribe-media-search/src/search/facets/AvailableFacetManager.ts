import Kendra from "aws-sdk/clients/kendra";
import { AvailableFacetRetriever } from "./AvailableFacetRetriever";

export type DocumentAttributeValueCountPairMap = {
  [attributeName: string]: Kendra.DocumentAttributeValueCountPair[];
};

export class AvailableFacetManager implements AvailableFacetRetriever {
  private constructor(private map: DocumentAttributeValueCountPairMap) {}

  static empty() {
    return new AvailableFacetManager({});
  }

  static fromQueryResult(response: Kendra.QueryResult): AvailableFacetManager {
    const map = response.FacetResults?.reduce((map, facetResult) => {
      const key = facetResult.DocumentAttributeKey;
      const value = facetResult.DocumentAttributeValueCountPairs;

      if (key && value) {
        map[key] = value;
      }

      return map;
    }, {} as DocumentAttributeValueCountPairMap);

    if (map) {
      return new AvailableFacetManager(map);
    } else {
      return AvailableFacetManager.empty();
    }
  }

  setAll(
    availableFacets: DocumentAttributeValueCountPairMap
  ): AvailableFacetManager {
    return new AvailableFacetManager(availableFacets);
  }

  set(
    attributeName: string,
    values: Kendra.DocumentAttributeValueCountPair[]
  ): AvailableFacetManager {
    return new AvailableFacetManager({
      ...this.map,
      [attributeName]: values,
    });
  }

  get(attributeName: string): Kendra.DocumentAttributeValueCountPair[] {
    if (this.map.hasOwnProperty(attributeName)) {
      return this.map[attributeName];
    } else {
      return [];
    }
  }

  /*
   * Get all the available attribute names in natural sort order
   */
  getAvailableAttributeNames(): string[] {
    return Object.keys(this.map).sort();
  }
}
