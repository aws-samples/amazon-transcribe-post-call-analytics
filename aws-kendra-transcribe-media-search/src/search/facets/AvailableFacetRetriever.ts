import Kendra from "aws-sdk/clients/kendra";

export interface AvailableFacetRetriever {
    get(attributeName: string): Kendra.DocumentAttributeValueCountPair[];
    getAvailableAttributeNames(): string[];
}