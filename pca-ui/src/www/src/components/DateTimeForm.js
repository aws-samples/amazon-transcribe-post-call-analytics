// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { useEffect, useState } from 'react';
import Calendar from '@cloudscape-design/components/calendar';
import DateInput from '@cloudscape-design/components/date-input';
import FormField from '@cloudscape-design/components/form-field';
import TimeInput from '@cloudscape-design/components/time-input';

export function DateTimeForm({ filter, operator, value, onChange }) {
  // Using the most reasonable default time per operator.
  const defaultTime = operator === '<' || operator === '>=' ? undefined : '23:59:59';
  const [{ dateValue, timeValue }, setState] = useState(parseValue(value ?? '', defaultTime));

  const onChangeDate = dateValue => {
    setState(state => ({ ...state, dateValue }));
  };

  const onChangeTime = timeValue => {
    setState(state => ({ ...state, timeValue }));
  };

  // Parse value from filter text when it changes.
  useEffect(
    () => {
      filter && setState(parseDateTimeFilter(filter.trim()));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter]
  );

  // Call onChange only when the value is valid.
  useEffect(
    () => {
      const dateAndTimeValue = dateValue + 'T' + (timeValue || '00:00:00');

      if (!dateValue.trim()) {
        onChange(null);
      } else if (isValidIsoDate(dateAndTimeValue)) {
        onChange(dateAndTimeValue);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateValue, timeValue]
  );

  return (
    <div className="date-time-form">
      <FormField description="Date" constraintText="Use YYYY/MM/DD format.">
        <DateInput placeholder="YYYY/MM/DD" value={dateValue} onChange={event => onChangeDate(event.detail.value)} />
      </FormField>

      <FormField description="Time" constraintText="Use 24-hour format.">
        <TimeInput
          format="hh:mm:ss"
          placeholder="hh:mm:ss"
          value={timeValue}
          onChange={event => onChangeTime(event.detail.value)}
        />
      </FormField>

      <Calendar
        value={dateValue}
        locale="en-EN"
        previousMonthAriaLabel="Previous month"
        nextMonthAriaLabel="Next month"
        todayAriaLabel="Today"
        onChange={event => onChangeDate(event.detail.value)}
      />
    </div>
  );
}

export function formatDateTime(isoDate) {
  return isoDate ? isoDate + formatTimezoneOffset(isoDate) : '';
}

function parseDateTimeFilter(filter) {
  const regexDate = /^(\d\d\d\d(-|\/\d\d)?(-|\/\d\d)?)(T\d\d(:\d\d)?(:\d\d)?)?/;
  const dateTime = filter.match(regexDate)?.[0] || '';

  let [dateValue, timeValue = ''] = dateTime.split('T');
  const [year, month = '01', day = '01'] = dateValue.split(/-|\//);
  const [hours = '00', minutes = '00', seconds = '00'] = timeValue.split(':');
  dateValue = year.length === 4 ? `${year}-${month}-${day}` : '';
  timeValue = timeValue ? `${hours}:${minutes}:${seconds}` : '';

  const value = !timeValue ? dateValue : dateValue + 'T' + timeValue;
  return isValidIsoDate(value) ? { dateValue, timeValue } : { dateValue: '', timeValue: '' };
}

function isValidIsoDate(isoDate) {
  return !isNaN(new Date(isoDate).getTime());
}

function parseValue(value, defaultTime = '') {
  const [datePart = '', timePart = ''] = (value ?? '').split('T');
  return { dateValue: datePart, timeValue: timePart || defaultTime };
}

function formatTimezoneOffset(isoDate, offsetInMinutes) {
  // Using default browser offset if not explicitly specified.
  offsetInMinutes = offsetInMinutes ?? 0 - new Date(isoDate).getTimezoneOffset();

  const sign = offsetInMinutes < 0 ? '-' : '+';
  const hoursOffset = Math.floor(Math.abs(offsetInMinutes) / 60)
    .toFixed(0)
    .padStart(2, '0');
  const minuteOffset = Math.abs(offsetInMinutes % 60)
    .toFixed(0)
    .padStart(2, '0');
  return `${sign}${hoursOffset}:${minuteOffset}`;
}