import _ from "lodash";
import React from "react";
import Chart from "react-google-charts";
import { AvailableDateFacet } from "./types";

const SELECTED_STYLE = "color: #007bff";
const UNSELECTED_STYLE = "color: #d5dbdb";

const options = {
  bar: { groupWidth: "90%" },
  chartArea: {
    width: "100%",
  },
  legend: { position: "none" },
  focusTarget: "category",
  tooltip: {
    isHtml: true,
    showColorCode: false,
  },
  hAxis: {
    textPosition: "none",
    baselineColor: "transparent",
    gridlines: {
      color: "transparent",
    },
  },
  vAxis: {
    baselineColor: "transparent",
    gridlines: {
      color: "transparent",
    },
    textPosition: "none",
  },
};

const dataSchema = [{ type: "string" }, "Values", { role: "style" }];

interface OwnProps {
  availableDateFacet: AvailableDateFacet;
  displaySelectionRange: [number, number];
  fullRange: [number, number];
}

interface State {
  data: any[][];
}

type Props = OwnProps;
export class DateFacetHeuristicChart extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = this.getStateFromProps();
  }

  componentDidUpdate(prevProps: Props) {
    if (!_.isEqual(prevProps, this.props)) {
      this.setState(this.getStateFromProps());
    }
  }

  getStateFromProps(): State {
    const { availableDateFacet, fullRange, displaySelectionRange } = this.props;

    const data: any[][] = [dataSchema];
    for (let year = fullRange[0]; year <= fullRange[1]; year++) {
      let style = UNSELECTED_STYLE;
      if (year >= displaySelectionRange[0] && year <= displaySelectionRange[1]) {
        style = SELECTED_STYLE;
      }

      data.push([
        `${year}`,
        _.get(availableDateFacet.yearHeuristic, year, 0),
        style,
      ]);
    }

    return {
      data,
    };
  }

  render() {
    const { data } = this.state;

    return (
      <Chart
        chartType="ColumnChart"
        width="100%"
        height="75px"
        data={data}
        options={options}
      />
    );
  }
}
