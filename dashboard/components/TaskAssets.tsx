import type { TaskAssets } from "../../src/learning/taskAssets";

export function DeliverableIcon({ onClick }: { onClick?: () => void } = {}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      className="deliverable-indicator"
      onClick={onClick}
      aria-label={
        onClick
          ? "View this deliverable in Resources & deliverables"
          : "Manual deliverable required"
      }
      title="Deliverable required — complete manually"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M12 10v5m0 3h.01" />
      </svg>
      Deliverable
    </Tag>
  );
}
export default function TaskAssetDetails({ assets }: { assets: TaskAssets }) {
  if (
    !assets.resources.length &&
    !assets.submissionLinks.length &&
    !assets.requirements.length
  )
    return null;
  return (
    <div className="task-assets">
      {assets.manualRequired && (
        <p className="manual-work-note">
          Complete this assignment manually. Automation skips it.
        </p>
      )}
      {assets.requirements.length > 0 && (
        <details className="deliverable-expectations">
          <summary>Required deliverable & expectations</summary>
          <ul>
            {assets.requirements.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </details>
      )}
      {assets.submissionLinks.length > 0 && (
        <div className="asset-link-list">
          <strong>Submit your work</strong>
          {assets.submissionLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lesson-link"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      )}
      {assets.resources.length > 0 && (
        <div className="asset-link-list">
          <strong>Resources</strong>
          {assets.resources.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="lesson-link"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      )}
      <small>
        {assets.provenance === "live-metadata"
          ? "From fetched Pursuit curriculum"
          : "Recovered from saved curriculum; refresh the day to verify full details"}
      </small>
    </div>
  );
}
