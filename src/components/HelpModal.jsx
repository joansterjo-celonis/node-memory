// src/components/HelpModal.jsx
// Tabbed help modal describing core product behavior.
import React from 'react';
import { Modal, Tabs, Typography, Space, Tag } from 'antd';
import { QuestionCircle, X } from '../ui/icons';
import { MAX_UPLOAD_MB } from '../utils/ingest';

const { Title, Text, Paragraph } = Typography;

const Section = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    <div className="text-sm text-slate-600 dark:text-slate-300">{children}</div>
  </div>
);

const HelpModal = ({ open, onClose, isMobile }) => {
  const tabItems = [
    {
      key: 'ingestion',
      label: 'Data ingestion',
      children: (
        <div className="space-y-5">
          <Section title="Upload and ingest">
            <ul className="list-disc pl-5 space-y-1">
              <li>Start in the Source step to load CSV or Excel files.</li>
              <li>Files are staged first, then parsed when you click Ingest Data.</li>
              <li>Loading new files replaces the data model feeding the chain.</li>
            </ul>
          </Section>
          <Section title="Tables and sheets">
            <ul className="list-disc pl-5 space-y-1">
              <li>Each CSV becomes a table. Excel workbooks become one table per sheet.</li>
              <li>Sheet tables are named using the pattern file:sheet for easy tracing.</li>
              <li>If multiple tables exist, pick the active table in the Properties panel.</li>
            </ul>
          </Section>
          <Section title="Limits and validation">
            <ul className="list-disc pl-5 space-y-1">
              <li>Max {MAX_UPLOAD_MB} MB per file and {MAX_UPLOAD_MB} MB total.</li>
              <li>Empty files and unsupported formats are rejected with clear errors.</li>
              <li>Large CSVs stream in chunks to keep the UI responsive.</li>
            </ul>
          </Section>
          <Section title="Data model preview">
            <ul className="list-disc pl-5 space-y-1">
              <li>Preview Data Model shows tables, columns, and sample values.</li>
              <li>Table headers can be sorted to scan the schema quickly.</li>
            </ul>
          </Section>
        </div>
      )
    },
    {
      key: 'render-modes',
      label: 'Render modes',
      children: (
        <div className="space-y-5">
          <Paragraph className="text-sm text-slate-600 dark:text-slate-300">
            Use the render mode menu in the header to switch how the chain is laid out.
          </Paragraph>
          <Section title="Classic">
            <Text>
              A balanced tree layout with branches flowing left to right. Best for reading
              the full workflow at a glance.
            </Text>
          </Section>
          <Section title="Classic smart">
            <Text>
              Weights column widths by branch depth so busy subtrees get more space and
              collisions are reduced.
            </Text>
          </Section>
          <Section title="Entangled and Entangled smart">
            <Text>
              Creates mirrored branch pairs so you can compare alternatives side by side.
              Entangled smart adds the same spacing logic from classic smart.
            </Text>
          </Section>
          <Section title="Single stream and Mobile">
            <Text>
              Shows one branch at a time with tabs for sibling branches. Mobile mode is
              chosen automatically on small screens. <Tag color="green">Auto</Tag>
            </Text>
          </Section>
          <Section title="Free layout">
            <ul className="list-disc pl-5 space-y-1">
              <li>Drag nodes anywhere, then pan and zoom the canvas.</li>
              <li>Use the zoom controls to focus the view or reset to 100%.</li>
              <li>Optimize layout reflows nodes based on their measured sizes.</li>
            </ul>
          </Section>
        </div>
      )
    },
    {
      key: 'components-filters',
      label: 'Components and filters',
      children: (
        <div className="space-y-5">
          <Section title="Transformation steps">
            <ul className="list-disc pl-5 space-y-1">
              <li>Filter nodes apply conditions such as equals, contains, and comparisons.</li>
              <li>Aggregate nodes group rows and compute metrics over numeric columns.</li>
              <li>SQL Join nodes combine tables with LEFT/INNER/RIGHT joins.</li>
            </ul>
          </Section>
          <Section title="Component types">
            <ul className="list-disc pl-5 space-y-1">
              <li>Table and Pivot Table display rows with sorting and pivot controls.</li>
              <li>Charts render bar or line visuals with optional aggregations.</li>
              <li>KPI and Gauge summarize single metrics against a target.</li>
              <li>AI Assistant converts a question into filter, aggregate, and view steps.</li>
            </ul>
          </Section>
          <Section title="Inline filtering">
            <Text>
              Use table cell actions to add filters quickly, or attach filters directly
              to a step to refine its output.
            </Text>
          </Section>
        </div>
      )
    },
    {
      key: 'panels-workflow',
      label: 'Panels and workflow',
      children: (
        <div className="space-y-5">
          <Section title="Properties panel">
            <Text>
              The right panel configures the selected step: tables, joins, chart settings,
              KPI metrics, and assistant settings live here.
            </Text>
          </Section>
          <Section title="Column stats">
            <Text>
              Column Stats summarizes distribution, nulls, and numeric stats for the
              selected column. On desktop it can be detached or collapsed.
            </Text>
          </Section>
          <Section title="Navigation and history">
            <ul className="list-disc pl-5 space-y-1">
              <li>Undo and Redo navigate your step history.</li>
              <li>Save and Exit captures the exploration for the landing page.</li>
              <li>Explorations list shows table counts, rows, and branch totals.</li>
            </ul>
          </Section>
          <Section title="Branch controls and settings">
            <ul className="list-disc pl-5 space-y-1">
              <li>Rename branches, collapse them, or create entangled mirrors.</li>
              <li>Table density and theme live under the settings menu.</li>
              <li>Mobile buttons toggle Stats and Properties panels.</li>
            </ul>
          </Section>
        </div>
      )
    }
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100%' : 920}
      centered={!isMobile}
      closeIcon={<X size={16} />}
      styles={{ body: { padding: 0 } }}
      style={isMobile ? { top: 0, margin: 0 } : undefined}
      title={
        <Space align="center">
          <div className="bg-indigo-100 p-2 rounded text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
            <QuestionCircle size={20} />
          </div>
          <div>
            <div className="font-bold text-base text-gray-900 dark:text-slate-100">How this works</div>
            <div className="text-xs text-gray-500 dark:text-slate-400">Product walkthrough and tips</div>
          </div>
        </Space>
      }
    >
      <div className={`bg-slate-50 dark:bg-slate-950 ${isMobile ? 'p-4' : 'p-6'}`}>
        <Title level={5} style={{ margin: 0 }}>Guide</Title>
        <Text type="secondary" className="text-xs">
          Learn how data moves through the chain and how each layout mode behaves.
        </Text>
        <div className="mt-4">
          <Tabs items={tabItems} />
        </div>
      </div>
    </Modal>
  );
};

export default HelpModal;
