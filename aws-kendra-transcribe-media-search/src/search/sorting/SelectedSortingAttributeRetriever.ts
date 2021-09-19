import Kendra from "aws-sdk/clients/kendra";

export interface SelectedSortingAttributeRetriever {
  getSelectedSortingAttribute(): string;

  getSelectedSortingOrder(): string | null;
}
