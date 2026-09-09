export type RepoActionField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "number";
  required?: boolean;
  default?: string | number | boolean;
  options?: Array<{
    label: string;
    value: string;
  }>;
};

export type RepoActionConfig = {
  name: string;
  label: string;
  workflow: string;
  ref?: string;
  cancelable?: boolean;
  scope?: "collection" | "entry";
  confirm?: boolean | {
    title?: string;
    message?: string;
    button?: string;
  };
  fields?: RepoActionField[];
};

export type ActionRunSummary = {
  id: number;
  actionName: string;
  contextType: string | null;
  contextName: string | null;
  contextPath: string | null;
  workflowRef: string | null;
  sha: string | null;
  status: string | null;
  conclusion: string | null;
  htmlUrl: string | null;
  workflowRunId: number | null;
  triggeredByName: string | null;
  triggeredByEmail?: string | null;
  triggeredByGithubUsername?: string | null;
  triggeredByImage?: string | null;
  canCancel?: boolean;
  canRerun?: boolean;
  cancelable?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export const resolveActionRef = (
  ref: string | undefined,
  currentRef: string,
) => (!ref || ref === "current" ? currentRef : ref);

export const getRootActions = (configObject: any): RepoActionConfig[] => {
  return Array.isArray(configObject?.actions) ? configObject.actions : [];
};

export const getSchemaActions = (
  schema: any,
  scope?: "collection" | "entry",
): RepoActionConfig[] => {
  const actions: RepoActionConfig[] = Array.isArray(schema?.actions) ? schema.actions : [];
  if (scope == null) {
    return actions.filter((action) => action.scope == null);
  }
  return actions.filter((action) => action.scope === scope);
};

/* The actions a given UI context may dispatch, resolved from the repo's
 * config exactly the way the UI decides what to render — and, from 2026-09-09,
 * the ONLY source the API trusts.
 *
 * The POST handler used to take `action.workflow` and `action.ref` straight
 * from the request body and never look at .pages.yml, so any signed-in
 * collaborator could dispatch any workflow file in the repo on any ref —
 * stepping straight over the branch confinement in lib/token.ts, which only
 * ever saw the URL's branch. Now the body names an action; everything else
 * (workflow file, ref, label, cancelable) comes from the declaration the owner
 * wrote, or the request is refused.
 *
 * Kept free of imports so it stays unit-testable (see test/actions-allowlist).
 * Mirrors lib/schema.ts getSchemaByName on the NORMALISED config shape:
 * `content` and `media` are arrays of schemas with a `name`.
 */
export type ActionContextKind = "repo" | "collection" | "entry" | "file" | "media" | string;

const findSchema = (configObject: any, name: string, type: "content" | "media") => {
  const list = configObject?.[type];
  if (!Array.isArray(list)) return null;
  return list.find((item: any) => item && item.name === name) ?? null;
};

export const resolveAllowedActions = (
  configObject: any,
  contextKind: ActionContextKind | null | undefined,
  contextName: string | null | undefined,
): RepoActionConfig[] => {
  if (!contextKind) return [];
  if (contextKind === "repo") return getRootActions(configObject);
  if (!contextName) return [];
  const schema = findSchema(configObject, contextName, contextKind === "media" ? "media" : "content");
  if (!schema) return [];
  switch (contextKind) {
    case "collection": return getSchemaActions(schema, "collection");
    case "entry": return getSchemaActions(schema, "entry");
    case "file":
    case "media": return getSchemaActions(schema);
    default: return [];
  }
};

export const findDeclaredAction = (
  configObject: any,
  contextKind: ActionContextKind | null | undefined,
  contextName: string | null | undefined,
  actionName: string | null | undefined,
): RepoActionConfig | null => {
  if (!actionName) return null;
  const match = resolveAllowedActions(configObject, contextKind, contextName)
    .find((action) => action && action.name === actionName && typeof action.workflow === "string" && action.workflow.length > 0);
  return match ?? null;
};

export const isActionRunActive = (run: ActionRunSummary | null | undefined) => {
  if (!run) return false;
  return run.status !== "completed";
};

export const formatActionRunState = (run: Pick<ActionRunSummary, "status" | "conclusion">) => {
  if (run.status !== "completed") {
    if (run.status === "queued" || run.status === "requested" || run.status === "waiting" || run.status === "dispatching") {
      return "Queued";
    }
    return "Running";
  }

  switch (run.conclusion) {
    case "success":
      return "Succeeded";
    case "failure":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "timed_out":
      return "Timed out";
    case "skipped":
      return "Skipped";
    default:
      return "Completed";
  }
};
