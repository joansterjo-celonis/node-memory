import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { QuestionCircle } from '../ui/icons';
import { MAX_UPLOAD_MB } from '../utils/ingest';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section = ({ title, children }: SectionProps) => (
  <div className="space-y-2">
    <div className="text-sm font-semibold text-foreground">{title}</div>
    <div className="text-sm text-muted-foreground">{children}</div>
  </div>
);

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

const HelpModal = ({ open, onClose, isMobile }: HelpModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className={isMobile ? 'w-full max-w-full top-0 translate-y-0' : 'max-w-[920px]'}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
              <QuestionCircle size={20} />
            </div>
            <div>
              <DialogTitle>How this works</DialogTitle>
              <DialogDescription>Product walkthrough and tips</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={`bg-muted/50 rounded-lg ${isMobile ? 'p-4' : 'p-6'}`}>
          <h3 className="text-base font-semibold text-foreground">Guide</h3>
          <p className="text-xs text-muted-foreground">
            Learn how data moves through the chain and how each layout mode behaves.
          </p>

          <Tabs defaultValue="ingestion" className="mt-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="ingestion">Data ingestion</TabsTrigger>
              <TabsTrigger value="render-modes">Render modes</TabsTrigger>
              <TabsTrigger value="components-filters">Components and filters</TabsTrigger>
              <TabsTrigger value="panels-workflow">Panels and workflow</TabsTrigger>
            </TabsList>

            <TabsContent value="ingestion">
              <div className="space-y-5">
                <Section title="Upload and ingest">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Start in the Source step to load CSV or Excel files.</li>
                    <li>Files are staged first, then parsed when you click Ingest Data.</li>
                    <li>Loading new files replaces the data model feeding the chain.</li>
                    <li>Switch to Inherited table to begin from a saved end node in another exploration.</li>
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
            </TabsContent>

            <TabsContent value="render-modes">
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Use the render mode menu in the header to switch how the chain is laid out.
                </p>
                <Section title="Classic">
                  <span>
                    A balanced tree layout with branches flowing left to right. Best for reading
                    the full workflow at a glance.
                  </span>
                </Section>
                <Section title="Classic smart">
                  <span>
                    Weights column widths by branch depth so busy subtrees get more space and
                    collisions are reduced.
                  </span>
                </Section>
                <Section title="Entangled and Entangled smart">
                  <span>
                    Creates mirrored branch pairs so you can compare alternatives side by side.
                    Entangled smart adds the same spacing logic from classic smart.
                  </span>
                </Section>
                <Section title="Single stream and Mobile">
                  <span>
                    Shows one branch at a time with tabs for sibling branches. Mobile mode is
                    chosen automatically on small screens.{' '}
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300 border-green-200 dark:border-green-500/30">
                      Auto
                    </Badge>
                  </span>
                </Section>
                <Section title="Free layout">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Drag nodes anywhere, then pan and zoom the canvas.</li>
                    <li>Use the zoom controls to focus the view or reset to 100%.</li>
                    <li>Optimize layout reflows nodes based on their measured sizes.</li>
                  </ul>
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="components-filters">
              <div className="space-y-5">
                <Section title="Transformation steps">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Filter nodes apply conditions such as equals, contains, and comparisons.</li>
                    <li>Aggregate nodes group rows and compute metrics over numeric columns.</li>
                    <li>SQL nodes can run visual joins or custom SQL across local and external tables.</li>
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
                  <span>
                    Use table cell actions to add filters quickly, or attach filters directly
                    to a step to refine its output.
                  </span>
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="panels-workflow">
              <div className="space-y-5">
                <Section title="Properties panel">
                  <span>
                    The right panel configures the selected step: tables, joins, chart settings,
                    KPI metrics, and assistant settings live here.
                  </span>
                </Section>
                <Section title="Column stats">
                  <span>
                    Column Stats summarizes distribution, nulls, and numeric stats for the
                    selected column. On desktop it can be detached or collapsed.
                  </span>
                </Section>
                <Section title="Navigation and history">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Undo and Redo navigate your step history.</li>
                    <li>Save and Exit captures the exploration for the landing page.</li>
                    <li>Explorations list shows table counts, rows, and branch totals.</li>
                    <li>Data sets highlight saved end nodes you can reuse elsewhere.</li>
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
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpModal;
