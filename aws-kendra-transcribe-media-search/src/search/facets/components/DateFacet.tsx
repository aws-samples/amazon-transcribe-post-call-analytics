import Kendra from "aws-sdk/clients/kendra";
import _ from "lodash";
import { Range } from "rc-slider";
import "rc-slider/assets/index.css";
import React from "react";
import { DateRange } from "../SelectedFacetRetriever";
import { attributeNameToFacetTitle, attributeValueToDate } from "../utils";
import "./DateFacet.scss";
import { DateFacetHeuristicChart } from "./DateFacetHeuristicChart";
import {
  AvailableDateFacet,
  DateFacetChangeHandler,
  YearHeuristic,
} from "./types";
import { i18n } from "../constants";

interface OwnProps {
  attributeName: string;
  valueCountPairs: Kendra.DocumentAttributeValueCountPair[];
  disableAdd: boolean;

  // Used when the selection has been applied
  selections?: DateRange;

  onSelectionsChange: DateFacetChangeHandler;
}

interface State {
  availableDateFacet: AvailableDateFacet;
  slider: {
    // Used when the slider is being moved, but hasn't been released and applied
    value?: [number, number];
  };
}

type Props = OwnProps;
export class DateFacet extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = this.getStateFromProps();
  }

  componentDidUpdate(prevProps: Props) {
    const selectionsChanged = prevProps.selections !== this.props.selections;
    const valuesChanged =
      prevProps.valueCountPairs !== this.props.valueCountPairs;

    if (selectionsChanged || valuesChanged) {
      this.setState(this.getStateFromProps());
    }
  }

  getStateFromProps = (): State => {
    return {
      availableDateFacet: this.getAvailableDateFacetFromProps(),
      slider: {
        value: this.getSliderValueFromProps(),
      },
    };
  };

  getSliderValueFromProps = () => {
    const { selections } = this.props;

    if (!selections) {
      return undefined;
    }

    const sliderValue: [number, number] = [
      selections.min.get("year"),
      selections.max.get("year"),
    ];

    return sliderValue;
  };

  getAvailableDateFacetFromProps = (): AvailableDateFacet => {
    const { valueCountPairs } = this.props;

    if (_.isEmpty(valueCountPairs)) {
      return {
        maxYear: 0,
        minYear: 0,
        yearHeuristic: {},
      };
    }

    // Select min/max values and value heuristic map
    let minYear = Number.MAX_SAFE_INTEGER;
    let maxYear = 0;

    const yearHeuristic: YearHeuristic = {};

    for (const value of valueCountPairs) {
      const count = value?.Count || 0;
      const dateValue = attributeValueToDate(value.DocumentAttributeValue);
      const yearValue = dateValue.get("year");

      if (yearValue < minYear) {
        minYear = yearValue;
      }

      if (yearValue > maxYear) {
        maxYear = yearValue;
      }

      yearHeuristic[yearValue] = _.get(yearHeuristic, yearValue, 0) + count;
    }

    return {
      maxYear,
      minYear,
      yearHeuristic,
    };
  };

  handleChange = (sliderValue: [number, number]) => {
    this.setState({
      slider: {
        value: sliderValue,
      },
    });
  };

  applyChangedRangeFilter = () => {
    const { availableDateFacet } = this.state;
    const { value } = this.state.slider;

    if (!value) {
      return;
    }

    const prevValue = this.getSliderValueFromProps();

    if (_.isUndefined(prevValue)) {
      // +1 because slider value min is exclusive, white available date facet is inclusive
      const isValueFullRange =
        value[0] + 1 <= availableDateFacet.minYear &&
        value[1] >= availableDateFacet.maxYear;

      // There was previously no filter. Only set a filter if it
      // is not the full range
      if (!isValueFullRange) {
        this.props.onSelectionsChange(this.props.attributeName, value);
      }
    } else if (!_.isEqual(value, prevValue)) {
      this.props.onSelectionsChange(this.props.attributeName, value);
    }
  };

  clearFilter = () => {
    this.props.onSelectionsChange(this.props.attributeName, undefined);
  };

  // Get the full range to show on the slider
  //   Union of the available facet values and active
  //     selection
  //   Min is exclusive because slider needs one
  //     more tick than number of columns in chart
  //
  // @return [ exclusive min, inclusive max ]
  getFullSliderRange = (): [ number, number ] => {
    const { selections } = this.props;
    const { availableDateFacet } = this.state;

    if (selections) {
      return [
        Math.min(
          availableDateFacet.minYear - 1,
          selections.min.get("year")
        ),
        Math.max(
          availableDateFacet.maxYear,
          selections.max.get("year")
        )
      ];
    } else {
      return [
        availableDateFacet.minYear - 1,
        availableDateFacet.maxYear
      ];
    }
  };

  // Get the full range to show on the heuristic chart
  //   Union of the available facet values and active
  //     selection
  //
  // @return [ inclusive min, inclusive max ]
  getFullHeuristicChartRange = (): [ number, number ] => {
    const { selections } = this.props;
    const { availableDateFacet } = this.state;

    if (selections) {
      return [
        Math.min(
          availableDateFacet.minYear,
          selections.min.get("year") + 1
        ),
        Math.max(
          availableDateFacet.maxYear,
          selections.max.get("year")
        )
      ];
    } else {
      return [
        availableDateFacet.minYear,
        availableDateFacet.maxYear
      ];
    }
  };

  // Get the currently selected value range to display
  //
  // @return [ inclusive min, inclusive max ]
  getDisplaySelectionRange = (): [ number, number ] => {
    const { slider } = this.state;

    if (slider.value) {
      // Slider min is exclusive, so +1 to make it inclusive
      return [
        slider.value[0] + 1,
        slider.value[1]
      ];
    } else {
      // Default to inclusive full range if no value is explicitly set
      return this.getFullHeuristicChartRange();
    }
  };

  render() {
    const {
      attributeName,
      disableAdd,
      valueCountPairs,
      selections,
    } = this.props;
    const { availableDateFacet, slider } = this.state;

    if (_.isEmpty(valueCountPairs)) {
      // Cannot generate a valid render without any values
      return null;
    }

    const active = !_.isUndefined(selections);

    const fullSliderRange = this.getFullSliderRange();
    const fullHeuristicChartRange = this.getFullHeuristicChartRange();
    const displaySelectionRange = this.getDisplaySelectionRange();

    return (
      <div className="facet">
        <div className="facet-title">
          {attributeNameToFacetTitle(attributeName)}&nbsp;
          {active && (
            <span onClick={this.clearFilter} className="action-link">
              {i18n.CLEAR}
            </span>
          )}
        </div>
        <div className="facet-date-container">
          <div className="facet-heuristic-chart">
            <DateFacetHeuristicChart
              availableDateFacet={availableDateFacet}
              fullRange={fullHeuristicChartRange}
              displaySelectionRange={displaySelectionRange}
            />
          </div>
          <div>
            <div className="facet-date-label-left">{displaySelectionRange[0]}</div>
            <div className="facet-date-label-right">{displaySelectionRange[1]}</div>
          </div>
        </div>
      </div>
    );
  }
}
