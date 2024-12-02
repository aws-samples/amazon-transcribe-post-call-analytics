import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Button, Container,ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { list } from "../api/api";
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

const COLORS = ['#9FADFF', '#97E697', '#FB5151'];

const EXCEL_COL_WIDTHS = [
  { wch: 20 },  // Agent
  { wch: 10 },  // Duration
  { wch: 30 },  // Name
  { wch: 25 },  // Location
  { wch: 35 },  // Summary
  { wch: 20 }   // Summary_Product
];

const CallAnalytics = ({ setAlert }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [chartData, setChartData] = useState({ durationData: [], pieData: [] });
  const history = useHistory();
  const { t } = useTranslation();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await list({ count: 3000 });
      processChartData(response.Records || []);
    } catch (error) {
      console.error(error);
    }
  };
  
  const isValidDuration = (duration) => {
    const parsed = parseFloat(duration);
    return !isNaN(parsed) && parsed > 0;
  };

  const processChartData = (records) => {
    const durationRanges = records.reduce((acc, call) => {
      if (call.duration && isValidDuration(call.duration)) {
        const durationInMinutes = Math.floor(parseFloat(call.duration) / 60);
        const range = `${durationInMinutes}-${durationInMinutes + 1} min`;
        acc[range] = (acc[range] || 0) + 1;
      }
      return acc;
    }, {});


    const statusCounts = {
      Observable: 0,
      Correcto: 0,
      Rechazable: 0
    };
    console.log(records);
    // Solo contar registros con valores válidos
    records.forEach(record => {
    Object.entries(record).forEach(([key, value]) => {
      if (key.startsWith('summary_') && value && value in statusCounts) {
        statusCounts[value]++;
      }
    });
  });

  setChartData({
    durationData: Object.entries(durationRanges)
      .map(([range, count]) => ({
        range,
        count
      }))
      .sort((a, b) => {
        // Ordenar por el primer número en el rango
        const aNum = parseInt(a.range.split('-')[0]);
        const bNum = parseInt(b.range.split('-')[0]);
        return aNum - bNum;
      }),
    pieData: Object.entries(statusCounts)
      .filter(([_, value]) => value > 0) // Solo incluir valores mayores que 0
      .map(([name, value]) => ({
        name,
        value
      }))
  });
};

  const getAll = async () => {
    const response = await list({ count: 3000 });
    const records = response.Records || [];
    
    const transformedRecords = records.map(r => ({
      Agent: r.agent,
      Duration: r.duration,
      Name: r.jobName,
      Location: r.location?.replace(/\//g, ' '),
      Summary: r.summary_summary,
      Summary_Product: r.summary_product,
    }));

    const ws = XLSX.utils.json_to_sheet(transformedRecords);
    ws['!cols'] = EXCEL_COL_WIDTHS;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Records");
    XLSX.writeFile(wb, "Resumen.xlsx");
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await getAll();
    } catch (err) {
      setAlert({ type: "error", message: err.message });
    }
    setIsDownloading(false);
  };

  return (
    <ContentLayout 
    header={
      <Header
          variant="h2"
      >
        <span id="header-text">{t("analytics.header")}</span>
      </Header>
    }>
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h1"
          actions={
            <Button
              variant="primary"
              loading={isDownloading}
              onClick={handleDownload}
            >
              {isDownloading ? t("analytics.downloading") : t("analytics.download")}
            </Button>
          }
        >
            <h3>{t("analytics.dashboard")}</h3>
        </Header>
        
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', height: '30rem' }}>
          <div style={{ flex: 1, minWidth: '400px', height: '400px' }}>
            <h3>{t("analytics.time")}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.durationData}>
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#5351FB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: '400px', height: '400px' }}>
          <h3>{t("analytics.distribution")}</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={150}
                  dataKey="value"
                  label
                >
                  {chartData.pieData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SpaceBetween>
    </Container>
    </ContentLayout>

  );
};

export default CallAnalytics;