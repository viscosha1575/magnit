import React from "react";
import Chart from "react-apexcharts";

export default function ColumnChart({ chartData = [], chartOptions = {} }) {
  return (
    <Chart
      options={chartOptions}
      series={chartData}
      type='bar'
      width='100%'
      height='100%'
    />
  );
}
