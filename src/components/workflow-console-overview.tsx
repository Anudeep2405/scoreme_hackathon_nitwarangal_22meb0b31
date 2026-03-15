import styles from "./workflow-console.module.css";
import { WorkflowConfigDetail } from "./workflow-console.types";
import { countNestedRules, formatDate, stringifyJson } from "./workflow-console.utils";

interface WorkflowConsoleOverviewProps {
  detailLoading: boolean;
  selectedWorkflow: WorkflowConfigDetail | null;
}

export function WorkflowConsoleOverview({
  detailLoading,
  selectedWorkflow,
}: WorkflowConsoleOverviewProps) {
  return (
    <section className={`${styles.panel} ${styles.workspacePanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>Overview</p>
          <h2 className={styles.panelTitle}>
            {selectedWorkflow
              ? `${selectedWorkflow.name} v${selectedWorkflow.version}`
              : "Workflow overview"}
          </h2>
        </div>
        <span className={styles.panelMeta}>
          {selectedWorkflow
            ? selectedWorkflow.isActive
              ? "Active version"
              : "Stored version"
            : "Select from catalog"}
        </span>
      </header>

      {detailLoading ? (
        <div className={styles.emptyState}>
          <p>Loading workflow details...</p>
        </div>
      ) : selectedWorkflow ? (
        <div className={styles.detailBody}>
          <div className={styles.detailGrid}>
            <div className={styles.infoCard}>
              <h4>Stages</h4>
              <div className={styles.tokenGroup}>
                {selectedWorkflow.stages.map((stage) => (
                  <span key={stage} className={styles.token}>
                    {stage}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.infoCard}>
              <h4>Transitions</h4>
              <div className={styles.timeline}>
                {selectedWorkflow.transitions.map((transition) => (
                  <div
                    key={`${transition.from}-${transition.to}-${transition.condition ?? "always"}`}
                    className={styles.timelineRow}
                  >
                    <span>{transition.from}</span>
                    <strong>{transition.to}</strong>
                    <em>{transition.condition ?? "always"}</em>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.infoCard}>
              <h4>Input schema</h4>
              {Object.entries(selectedWorkflow.inputSchema?.fields ?? {}).length === 0 ? (
                <p className={styles.emptyHint}>This workflow accepts an unstructured payload.</p>
              ) : (
                <div className={styles.fieldList}>
                  {Object.entries(selectedWorkflow.inputSchema?.fields ?? {}).map(
                    ([fieldName, fieldConfig]) => (
                      <div key={fieldName} className={styles.fieldItem}>
                        <div className={styles.fieldTopline}>
                          <strong>{fieldName}</strong>
                          <span>{fieldConfig.type}</span>
                        </div>
                        <p>{fieldConfig.description ?? "No description provided."}</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className={styles.infoCard}>
              <h4>Stage actions</h4>
              {Object.entries(selectedWorkflow.stageActions ?? {}).length === 0 ? (
                <p className={styles.emptyHint}>
                  No stage actions are configured for this version.
                </p>
              ) : (
                <div className={styles.fieldList}>
                  {Object.entries(selectedWorkflow.stageActions ?? {}).map(
                    ([stageName, actions]) => (
                      <div key={stageName} className={styles.fieldItem}>
                        <div className={styles.fieldTopline}>
                          <strong>{stageName}</strong>
                          <span>{actions.length} action(s)</span>
                        </div>
                        <p>{actions.map((action) => action.type).join(", ")}</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.rulesBlock}>
            <div className={styles.rulesHeader}>
              <h4>Rules by stage</h4>
              <span className={styles.catalogDate}>
                Updated {formatDate(selectedWorkflow.updatedAt)}
              </span>
            </div>
            <div className={styles.rulesList}>
              {selectedWorkflow.stages.map((stage) => (
                <details key={stage} className={styles.collapsibleCard}>
                  <summary className={styles.collapsibleSummary}>
                    <strong>{stage}</strong>
                    <span>{countNestedRules(selectedWorkflow.rules[stage] ?? [])} rules</span>
                  </summary>
                  <pre className={styles.codeBlock}>
                    {stringifyJson(selectedWorkflow.rules[stage] ?? [])}
                  </pre>
                </details>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>Select a stored version to inspect its schema, rules, and transitions.</p>
        </div>
      )}
    </section>
  );
}
