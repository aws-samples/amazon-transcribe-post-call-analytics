import Kendra from "aws-sdk/clients/kendra";
import _ from "lodash";
import React from "react";
import { Form } from "react-bootstrap";

interface OwnProps {
  attributeName: Kendra.DocumentAttributeKey;
  value: Kendra.DocumentAttributeValue;
  valueLabel: string;
  count?: number;

  selected: boolean;
  disableAdd: boolean;

  onSelectionChange: (
    key: Kendra.DocumentAttributeKey,
    value: Kendra.DocumentAttributeValue,
    changeDetail: boolean
  ) => void;

  facetConfiguration: {
    showCount: boolean;
  };
}

type Props = OwnProps;
export class FacetCheckbox extends React.Component<Props> {
  handleChange = () => {
    this.props.onSelectionChange(
      this.props.attributeName,
      this.props.value,
      !this.props.selected
    );
  };

  render() {
    const {
      count,
      disableAdd,
      facetConfiguration,
      valueLabel,
      selected,
    } = this.props;

    let label: React.ReactNode = valueLabel;
    if (_.isNumber(count) && facetConfiguration.showCount) {
      label = (
        <span>
          {label}&nbsp;({count})
        </span>
      );
    }

    return (
      <div className="facet-checkbox">
        <Form.Check
          disabled={disableAdd && !selected}
          type={"checkbox"}
          label={<span onClick={this.handleChange}>{label}</span>}
          checked={selected}
          onChange={this.handleChange}
        />
      </div>
    );
  }
}
