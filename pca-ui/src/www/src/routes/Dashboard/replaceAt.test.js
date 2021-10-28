import { replaceAt } from "./TranscriptSegment";

describe("replaceAt", () => {
  it("works", () => {
    const input = "Yeah. Hi terry. Um my name is [PII]";
    const [begin, end] = [9, 14];
    const fn = (matched) => <span>{matched}</span>;

    const result = replaceAt(input, begin, end, fn);
    console.log(result);
  });
});
