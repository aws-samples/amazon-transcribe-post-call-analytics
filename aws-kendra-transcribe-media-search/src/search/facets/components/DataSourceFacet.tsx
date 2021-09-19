import * as React from "react";
import { Facet } from "./Facet";
import { DocumentAttributeKeys } from "../../constants";
import { DataSourceNameLookup, attributeValueToString } from "../utils";
import Kendra, { DocumentAttributeValue } from "aws-sdk/clients/kendra";
import _ from "lodash";
import { SelectedFacetRetriever } from "../SelectedFacetRetriever";

interface OwnProps {
  dataSourceNameLookup?: DataSourceNameLookup;
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
export class DataSourceFacet extends React.Component<Props> {
  dataSourceIdToName = (value?: DocumentAttributeValue) => {
    const { dataSourceNameLookup } = this.props;

    if (!dataSourceNameLookup || !value) {
      return "";
    } else {
      return _.get(dataSourceNameLookup, attributeValueToString(value), "");
    }
  };

  render() {
    const {
      dataSourceNameLookup,
      disableAdd,
      facetConfiguration,
      valueCountPairs,
      onSelectionChange,
      onClear,
      selectedFacets,
    } = this.props;

    if (!dataSourceNameLookup) {
      // Don't show data source facet if can't translate id to name
      return null;
    }

    return (
      <Facet
        attributeName={DocumentAttributeKeys.DataSourceId}
        values={valueCountPairs.map((value) => ({
          ...value,
          ValueLabel: this.dataSourceIdToName(value.DocumentAttributeValue),
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
