import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Button, Container,ContentLayout, Header, SpaceBetween } from '@cloudscape-design/components';
import { list } from "../api/api";
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

const COLORS = ['#0088FE', '#00C49F', '#FF8042'];

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
      const response = await list({ count: 100 });
      processChartData(response.Records || []);
    } catch (error) {
      console.error(error);
    }
  };

  const processChartData = (records) => {
    const durationRanges = records.reduce((acc, call) => {
      const duration = Math.floor(parseFloat(call.duration) / 60);
      const range = `${duration}-${duration + 1} min`;
      acc[range] = (acc[range] || 0) + 1;
      return acc;
    }, {});

    const statusCounts = {
      Observable: 0,
      Correcto: 0,
      Rechazable: 0
    };

    records.forEach(record => {
      Object.entries(record).forEach(([key, value]) => {
        if (key.startsWith('summary_') && value in statusCounts) {
          statusCounts[value]++;
        }
      });
    });

    setChartData({
      durationData: Object.entries(durationRanges).map(([range, count]) => ({
        range,
        count
      })),
      pieData: Object.entries(statusCounts).map(([name, value]) => ({
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
      ...Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith('summary_')))
    }));

    const ws = XLSX.utils.json_to_sheet(transformedRecords);
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
                <Bar dataKey="count" fill="#8884d8" />
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