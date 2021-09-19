import React from "react";
import { DEFAULT_SORT_ATTRIBUTE, SortOrderEnum, i18n } from "./constants";
import { AvailableSortingAttributesManager } from "./AvailableSortingAttributesManager";
import { SelectedSortingAttributeManager } from "./SelectedSortingAttributeManager";
import SortingOrderDefault from "../images/sort-arrow-down-default.svg";
import SortingOderDown from "../images/sort-arrow-down-active.svg";
import SortingOderUp from "../images/sort-arrow-up-active.svg";
import {
  DocumentAttributeTitleLookup,
  DocumentAttributeKeys,
} from "../constants";

import "./ResultSorting.scss";

interface OwnProps {
  availableSortingAttributes: AvailableSortingAttributesManager;
  selectedSortingAttribute: SelectedSortingAttributeManager;
  onSortingAttributeChange: (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => void;
  onSortingOrderChange: (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => void;
}

type Props = OwnProps;
export class ResultSorting extends React.Component<Props> {
  getSortingAttributeSelectOptions = (attributeList: string[]) => {
    /* Using optgroup to apply css style for limiting attributes number displayed in dropdown */

    return (
      <optgroup className="opt-group">
        {/* Relevance is the first to show */}
        <option value={DEFAULT_SORT_ATTRIBUTE}>{DEFAULT_SORT_ATTRIBUTE}</option>

        {/* Shows Created at and Updated at after Relevance */}
        {attributeList.indexOf(DocumentAttributeKeys.CreatedAt) >= 0 ? (
          <option
            value={DocumentAttributeKeys.CreatedAt}
            selected={
              this.props.selectedSortingAttribute.getSelectedSortingAttribute() ===
              DocumentAttributeKeys.CreatedAt
            }
          >
            {DocumentAttributeTitleLookup[DocumentAttributeKeys.CreatedAt]}
          </option>
        ) : null}
        {attributeList.indexOf(DocumentAttributeKeys.UpdatedAt) >= 0 ? (
          <option
            value={DocumentAttributeKeys.UpdatedAt}
            selected={
              this.props.selectedSortingAttribute.getSelectedSortingAttribute() ===
              DocumentAttributeKeys.UpdatedAt
            }
          >
            {DocumentAttributeTitleLookup[DocumentAttributeKeys.UpdatedAt]}
          </option>
        ) : null}

        {/* Shows other date type attributes and then shows other types of attributes*/}
        {attributeList.map((attribute) => {
          if (
            attribute !== DocumentAttributeKeys.CreatedAt &&
            attribute !== DocumentAttributeKeys.UpdatedAt
          ) {
            return (
              <option
                value={attribute}
                selected={
                  this.props.selectedSortingAttribute.getSelectedSortingAttribute() ===
                  attribute
                }
              >
                {DocumentAttributeTitleLookup[attribute] ?? attribute}
              </option>
            );
          } else {
            return null;
          }
        })}
      </optgroup>
    );
  };

  renderSortingAttributeSelect = (attributeList: string[]) => {
    return (
      <select
        name="select"
        className="sorting-attribute-select"
        onChange={this.props.onSortingAttributeChange}
      >
        {this.getSortingAttributeSelectOptions(attributeList)}
      </select>
    );
  };

  getSortOrderToggleButton = (sortingOrder: string | null) => {
    if (!sortingOrder) {
      return (
        <button className="toggle-button" disabled={true}>
          <img
            className="toggle-image"
            src={SortingOrderDefault}
            alt="default"
          />
        </button>
      );
    } else if (sortingOrder === SortOrderEnum.Desc) {
      return (
        <button
          className="toggle-button"
          onClick={this.props.onSortingOrderChange}
        >
          <img className="toggle-image" src={SortingOderDown} alt="down" />
        </button>
      );
    } else if (sortingOrder === SortOrderEnum.Asc) {
      return (
        <button
          className="toggle-button"
          onClick={this.props.onSortingOrderChange}
        >
          <img className="toggle-image" src={SortingOderUp} alt="down" />
        </button>
      );
    }
  };

  render() {
    const sortingOrder = this.props.selectedSortingAttribute.getSelectedSortingOrder();

    return (
      <div className="query-result-sorting-container">
        <span className="sort-text">{i18n.sort}</span>
        <div className="sorting-attributes-dropdown">
          {this.renderSortingAttributeSelect(
            this.props.availableSortingAttributes.get()
          )}
        </div>
        <div className="sorting-order-toggle">
          {!sortingOrder && this.getSortOrderToggleButton(null)}
          {sortingOrder === SortOrderEnum.Desc &&
            this.getSortOrderToggleButton(SortOrderEnum.Desc)}
          {sortingOrder === SortOrderEnum.Asc &&
            this.getSortOrderToggleButton(SortOrderEnum.Asc)}
        </div>
      </div>
    );
  }
}
