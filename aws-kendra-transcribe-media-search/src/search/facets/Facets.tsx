import Kendra from "aws-sdk/clients/kendra";
import _ from "lodash";
import React from "react";
import { facetConfiguration } from "../configuration";
import {
  DocumentAttributeKeys,
  DocumentAttributeValueTypeEnum,
} from "../constants";
import facetIcon from "../images/facet_icon.svg";
import downArrow from "../images/solid-down.svg";
import rightArrow from "../images/solid-right.svg";
import { AvailableFacetRetriever } from "./AvailableFacetRetriever";
import { DataSourceFacet } from "./components/DataSourceFacet";
import { DateFacet } from "./components/DateFacet";
import { StringFacet } from "./components/StringFacet";
import { i18n } from "./constants";
import "./Facets.scss";
import { SelectedFacetManager } from "./SelectedFacetManager";
import {
  DataSourceNameLookup,
  IndexFieldNameToDocumentAttributeValueType,
  selectHasReachedMaxFiltersForFacet,
} from "./utils";

interface OwnProps {
  index?: Kendra.DescribeIndexResponse;
  attributeTypeLookup?: IndexFieldNameToDocumentAttributeValueType;
  availableFacets?: AvailableFacetRetriever;
  selectedFacets: SelectedFacetManager;
  open: boolean;

  onSelectedFacetsChanged: (
    updatedSelectedFacets: SelectedFacetManager
  ) => void;
  onExpand: () => void;

  // Required only if filtering by data source is desired
  dataSourceNameLookup?: DataSourceNameLookup;
}

type Props = OwnProps;
export class Facets extends React.Component<Props> {
  private onClickResetFilters = () => {
    this.props.onSelectedFacetsChanged(this.props.selectedFacets.clearAll());
  };

  onDateRangeSelectionsChange = (
    key: Kendra.DocumentAttributeKey,
    changeDetail?: [number, number]
  ) => {
    this.props.onSelectedFacetsChanged(
      this.props.selectedFacets.setDateRange(key, changeDetail)
    );
  };

  private onStringSelectionChange = (
    key: Kendra.DocumentAttributeKey,
    value: Kendra.DocumentAttributeValue,
    isSelected: boolean
  ) => {
    this.props.onSelectedFacetsChanged(
      this.props.selectedFacets.setIsSelected(key, value, isSelected)
    );
  };

  private onClearStringSelections = (key: Kendra.DocumentAttributeKey) => {
    this.props.onSelectedFacetsChanged(
      this.props.selectedFacets.clearSelectionsOf(key)
    );
  };

  render() {
    const {
      attributeTypeLookup,
      availableFacets,
      dataSourceNameLookup,
      selectedFacets,
      open,
    } = this.props;

    if (!availableFacets || !attributeTypeLookup || !selectedFacets) {
      return null;
    }

    const attributeNames = availableFacets.getAvailableAttributeNames();

    if (_.isEmpty(attributeNames)) {
      if (!selectedFacets.isEmpty()) {
        // Handle the edge case where we have filtered down to no results
        return (
          <div className="facets">
            <div className="facet">
              <span className="action-link" onClick={this.onClickResetFilters}>
                {i18n.RESET_FILTERS}
              </span>
            </div>
          </div>
        );
      } else {
        return null;
      }
    }

    return (
      <div className="facets">
        <div className="facet-panel-header" onClick={this.props.onExpand}>
          <div className="facet-panel-icon">
            <img src={facetIcon} alt="facet" />
          </div>
          {i18n.FILTER_SEARCH_RESULTS}
          <div className="facet-panel-expand-icon">
            {!open && <img src={rightArrow} alt="closed" />}
            {open && <img src={downArrow} alt="open" />}
          </div>
        </div>
        {open &&
          attributeNames.map((attributeName) => {
            const type = attributeTypeLookup[attributeName];

            const disableAdd = selectHasReachedMaxFiltersForFacet(
              this.props.index,
              selectedFacets.getAllSelected(),
              attributeName
            );

            if (type === DocumentAttributeValueTypeEnum.DATE_VALUE) {
              return (
                <DateFacet
                  key={attributeName}
                  attributeName={attributeName}
                  valueCountPairs={availableFacets.get(attributeName)}
                  disableAdd={
                    disableAdd
                  } /* TODO need to test after link to the DateFacet */
                  selections={selectedFacets.getDateRangeSelectionsOf(
                    attributeName
                  )}
                  onSelectionsChange={this.onDateRangeSelectionsChange}
                />
              );
            } else if (attributeName === DocumentAttributeKeys.DataSourceId) {
              return (
                <DataSourceFacet
                  key={attributeName}
                  dataSourceNameLookup={dataSourceNameLookup}
                  disableAdd={disableAdd}
                  valueCountPairs={availableFacets.get(
                    DocumentAttributeKeys.DataSourceId
                  )}
                  facetConfiguration={facetConfiguration}
                  onSelectionChange={this.onStringSelectionChange}
                  onClear={this.onClearStringSelections}
                  selectedFacets={this.props.selectedFacets}
                />
              );
            } else {
              return (
                <StringFacet
                  key={attributeName}
                  attributeName={attributeName}
                  valueCountPairs={availableFacets.get(attributeName)}
                  disableAdd={disableAdd}
                  facetConfiguration={facetConfiguration}
                  onSelectionChange={this.onStringSelectionChange}
                  onClear={this.onClearStringSelections}
                  selectedFacets={this.props.selectedFacets}
                />
              );
            }
          })}
      </div>
    );
  }
}
