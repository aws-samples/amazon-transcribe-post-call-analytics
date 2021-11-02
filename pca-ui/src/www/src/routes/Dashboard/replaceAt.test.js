import { applyReplacements } from "./TranscriptSegment";
import React from "react";

describe("replaceAt", () => {
  it("handles a single replacement", () => {
    const input = "Yeah. Hi terry. Um my name is [PII]";

    const fn = (matched) => <span>{matched}</span>;
    const highlightLocations = [{ start: 9, end: 14, fn }];

    const result = applyReplacements(input, highlightLocations);

    expect(result).toStrictEqual([
      "Yeah. Hi ",
      React.createElement("span", {}, "terry"),
      ". Um my name is [PII]",
    ]);
  });

  it("handles multiple replacements", () => {
    const input = "Yeah. Hi terry. Um my name is [PII]";
    const fn = (matched) => <span>{matched}</span>;
    const highlightLocations = [
      { start: 9, end: 14, fn },
      { start: 31, end: 34, fn },
    ];

    const result = applyReplacements(input, highlightLocations);

    expect(result).toStrictEqual([
      "Yeah. Hi ",
      React.createElement("span", {}, "terry"),
      ". Um my name is [",
      React.createElement("span", {}, "PII"),
      "]",
    ]);
  });

  it("handles no replacements", () => {
    const input = "Yeah. Hi terry. Um my name is [PII]";
    const highlightLocations = [];
    const result = applyReplacements(input, highlightLocations);
    expect(result).toStrictEqual(input);
  });
});
