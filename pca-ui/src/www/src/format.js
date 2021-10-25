import { DateTime } from "luxon";

function Time(input) {
  var mins = Math.floor(input / 60);
  var secs = Math.floor(input - mins * 60).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  });

  return `${mins}`.padStart(2, "0") + ":" + `${secs}`.padStart(2, "0");
}

function Percentage(input) {
  return input.toLocaleString("en-GB", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function Number(input) {
  return input.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Timestamp(input) {
  const dt = DateTime.fromMillis(input);
  return dt.toISO();
}

export const Formatter = { Percentage, Number, Time, Timestamp };
