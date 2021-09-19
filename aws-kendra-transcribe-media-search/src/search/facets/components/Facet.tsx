import React from "react";
import Kendra from "aws-sdk/clients/kendra";
import { attributeNameToFacetTitle } from "../utils";
import { i18n } from "../constants";
import { FacetCheckbox } from "./FacetCheckbox";
import "./Facet.scss";
import { FacetValue } from "./types";
import { SelectedFacetRetriever } from "../SelectedFacetRetriever";
import _ from "lodash";

interface OwnProps {
  attributeName: string;
  values: FacetValue[];
  disableAdd: boolean;

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

interface State {
  expanded: boolean;
}

type Props = OwnProps;
export class Facet extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      expanded: false,
    };
  }

  showLess = () => {
    this.setState({
      expanded: false,
    });
  };

  showMore = () => {
    this.setState({
      expanded: true,
    });
  };

  onClickClearButton = () => {
    this.props.onClear(this.props.attributeName);
  };

  render() {
    const {
      attributeName,
      disableAdd,
      facetConfiguration,
      values,
    } = this.props;
    const { expanded } = this.state;

    const expandable =
      values.length > facetConfiguration.facetsToShowWhenUncollapsed;

    const hasSomeValuesSelected = !_.isEmpty(
      this.props.selectedFacets?.getStringSelectionsOf(attributeName)
    );

    return (
      <div className="facet">
        <div className="facet-title">
          {attributeNameToFacetTitle(attributeName)}&nbsp;
          {hasSomeValuesSelected && (
            <span onClick={this.onClickClearButton} className="action-link">
              {i18n.CLEAR}
            </span>
          )}
        </div>
        <div className="facet-value-container">
          {values.map((value, idx) => {
            if (!value.DocumentAttributeValue) {
              return null;
            }

            const show =
              expanded || idx < facetConfiguration.facetsToShowWhenUncollapsed;

            const isSelected = this.props.selectedFacets
              ? this.props.selectedFacets.isSelected(
                  attributeName,
                  value.DocumentAttributeValue
                )
              : false;

            if (show || isSelected) {
              return (
                <FacetCheckbox
                  key={idx}
                  attributeName={attributeName}
                  value={value.DocumentAttributeValue}
                  valueLabel={value.ValueLabel}
                  count={value.Count}
                  selected={isSelected}
                  disableAdd={disableAdd}
                  onSelectionChange={this.props.onSelectionChange}
                  facetConfiguration={facetConfiguration}
                />
              );
            } else {
              return null;
            }
          })}
        </div>
        <div className="facet-footer">
          {expandable && expanded && (
            <span className="action-link" onClick={this.showLess}>
              {i18n.SHOW_LESS}
            </span>
          )}
          {expandable && !expanded && (
            <span className="action-link" onClick={this.showMore}>
              {i18n.SHOW_MORE}
            </span>
          )}
        </div>
      </div>
    );
  }
}
