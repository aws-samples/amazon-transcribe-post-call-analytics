import Kendra from "aws-sdk/clients/kendra";
import * as React from "react";
import { attributeValueToString } from "../utils";
import { Facet } from "./Facet";
import { SelectedFacetRetriever } from "../SelectedFacetRetriever";

interface OwnProps {
  attributeName: string;
  disableAdd: boolean;
  valueCountPairs: Kendra.DocumentAttributeValueCountPair[];

  facetConfiguration: {
    facetsToShowWhenUncollapsed: number;
    showCount: boolean;
  };

  onSelectionChange: (
    key: Kendra.DocumentAttributeKey,
    value: Kendra.DocumentAttributeValue,
    changeDetail: boolean
  ) => void;

  onClear: (key: Kendra.DocumentAttributeKey) => void;

  selectedFacets?: SelectedFacetRetriever;
}

type Props = OwnProps;
export class StringFacet extends React.Component<Props> {
  render() {
    const {
      attributeName,
      disableAdd,
      facetConfiguration,
      valueCountPairs,
      onSelectionChange,
      onClear,
      selectedFacets,
    } = this.props;

    return (
      <Facet
        attributeName={attributeName}
        values={valueCountPairs.map((value) => ({
          ...value,
          ValueLabel: attributeValueToString(value.DocumentAttributeValue),
        }))}
        disableAdd={disableAdd}
        facetConfiguration={facetConfiguration}
        onSelectionChange={onSelectionChange}
        onClear={onClear}
        selectedFacets={selectedFacets}
      />
    );
  }
}
