import { DocumentMetadataConfigurationList } from "aws-sdk/clients/kendra";
import { AvailableSortingAttributesRetriever } from "./AvailableSortingAttributesRetriever";
import { DocumentAttributeValueTypeEnum } from "../facets/utils";

export class AvailableSortingAttributesManager
  implements AvailableSortingAttributesRetriever {
  private constructor(private sortingAttributes: string[]) {}

  static empty() {
    return new AvailableSortingAttributesManager([]);
  }

  set(sortingAttributes: string[]): AvailableSortingAttributesManager {
    return new AvailableSortingAttributesManager(sortingAttributes);
  }

  get(): string[] {
    return this.sortingAttributes;
  }

  // Get sorting attributes from index metadata
  // Store date type sorting attirbute before other types
  // Set avaialble attributes
  fromIndexMetadata(
    configList: DocumentMetadataConfigurationList
  ): AvailableSortingAttributesManager {
    let sortingAttributeDateList = [];
    let sortingAttributeOtherList = [];

    if (configList) {
      for (const documentMetadataConfig of configList) {
        if (documentMetadataConfig && documentMetadataConfig.Search?.Sortable) {
          if (
            documentMetadataConfig.Type ===
            DocumentAttributeValueTypeEnum.DateValue
          ) {
            sortingAttributeDateList.push(documentMetadataConfig.Name);
          } else {
            sortingAttributeOtherList.push(documentMetadataConfig.Name);
          }
        }
      }
    }
    const sortingAttributeList = sortingAttributeDateList.concat(
      sortingAttributeOtherList
    );

    return new AvailableSortingAttributesManager(sortingAttributeList);
  }
}
