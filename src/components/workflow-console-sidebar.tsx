import styles from "./workflow-console.module.css";
import {
  WorkflowConfigDetail,
  WorkflowConfigSummary,
} from "./workflow-console.types";
import { createWorkflowKey, formatDate } from "./workflow-console.utils";

interface WorkflowConsoleSidebarProps {
  activatingKey: string | null;
  catalog: WorkflowConfigSummary[];
  catalogLoading: boolean;
  currentRuleCount: number;
  detailLoading: boolean;
  selectedWorkflow: WorkflowConfigDetail | null;
  selectedWorkflowKey: string;
  onActivateWorkflow: (name: string, version: number) => void;
  onOpenBuilder: () => void;
  onOpenOverview: () => void;
  onOpenRequests: () => void;
  onSelectWorkflow: (workflowKey: string) => void;
}

export function WorkflowConsoleSidebar({
  activatingKey,
  catalog,
  catalogLoading,
  currentRuleCount,
  detailLoading,
  selectedWorkflow,
  selectedWorkflowKey,
  onActivateWorkflow,
  onOpenBuilder,
  onOpenOverview,
  onOpenRequests,
  onSelectWorkflow,
}: WorkflowConsoleSidebarProps) {
  return (
    <section className={`${styles.panel} ${styles.sidebarPanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>Catalog</p>
          <h2 className={styles.panelTitle}>Stored workflow versions</h2>
        </div>
        <span className={styles.panelMeta}>
          {catalogLoading
            ? "Loading..."
            : `${catalog.length} version${catalog.length === 1 ? "" : "s"}`}
        </span>
      </header>

      {catalog.length === 0 && !catalogLoading ? (
        <div className={styles.emptyState}>
          <p>No stored workflow configs yet.</p>
          <p className={styles.emptyHint}>
            Seed the defaults or create your first version from the guided builder.
          </p>
        </div>
      ) : (
        <div className={styles.catalogList}>
          {catalog.map((item) => {
            const workflowKey = createWorkflowKey(item.name, item.version);
            const selected = workflowKey === selectedWorkflowKey;

            return (
              <button
                key={workflowKey}
                type="button"
                className={`${styles.catalogItem} ${selected ? styles.catalogItemSelected : ""}`}
                onClick={() => onSelectWorkflow(workflowKey)}
              >
                <div className={styles.catalogTopline}>
                  <strong>{item.name}</strong>
                  <span className={styles.versionBadge}>v{item.version}</span>
                </div>
                <div className={styles.catalogMeta}>
                  <span>{item.stageCount} stages</span>
                  <span>{item.ruleCount} rules</span>
                  <span>{item.inputFieldCount} fields</span>
                </div>
                <div className={styles.catalogFooter}>
                  <span
                    className={`${styles.catalogStatus} ${
                      item.isActive ? styles.catalogStatusActive : styles.catalogStatusDraft
                    }`}
                  >
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className={styles.catalogDate}>{formatDate(item.updatedAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.selectionCard}>
        <p className={styles.panelEyebrow}>Selection</p>
        {detailLoading ? (
          <div className={styles.emptyState}>
            <p>Loading workflow details...</p>
          </div>
        ) : selectedWorkflow ? (
          <>
            <h3 className={styles.detailTitle}>
              {selectedWorkflow.name} v{selectedWorkflow.version}
            </h3>
            <div className={styles.detailFacts}>
              <span className={styles.factPill}>{selectedWorkflow.stages.length} stages</span>
              <span className={styles.factPill}>{currentRuleCount} rules</span>
              <span className={styles.factPill}>
                {Object.keys(selectedWorkflow.inputSchema?.fields ?? {}).length} input fields
              </span>
              <span
                className={`${styles.factPill} ${
                  selectedWorkflow.isActive ? styles.factPillActive : ""
                }`}
              >
                {selectedWorkflow.isActive ? "Currently active" : "Stored version"}
              </span>
            </div>
            <p className={styles.selectionText}>
              Pick the next task. The workspace on the right stays focused on one job at a time.
            </p>
            <div className={styles.selectionActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onOpenOverview}
              >
                Open overview
              </button>
              <button type="button" className={styles.ghostButton} onClick={onOpenBuilder}>
                Open builder
              </button>
              <button type="button" className={styles.ghostButton} onClick={onOpenRequests}>
                Open requests
              </button>
              {!selectedWorkflow.isActive ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() =>
                    onActivateWorkflow(selectedWorkflow.name, selectedWorkflow.version)
                  }
                  disabled={
                    activatingKey ===
                    createWorkflowKey(selectedWorkflow.name, selectedWorkflow.version)
                  }
                >
                  {activatingKey ===
                  createWorkflowKey(selectedWorkflow.name, selectedWorkflow.version)
                    ? "Activating..."
                    : "Activate"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>Select a stored version to inspect, edit, or test it.</p>
          </div>
        )}
      </div>
    </section>
  );
}
