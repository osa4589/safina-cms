"use client";

import { useEffect } from "react";
import { BRAND } from "@/lib/brand";

const APP_TITLE = BRAND.name;

export const formatDocumentTitle = (title?: string | null) =>
  title ? `${title} | ${APP_TITLE}` : APP_TITLE;

export const formatRepoBranchTitle = (
  title: string,
  owner: string,
  repo: string,
  branch?: string,
) => {
  const repoRef = `${owner}/${repo}${branch ? `@${branch}` : ""}`;
  return `${title} | ${repoRef}`;
};

export function DocumentTitle({
  title,
}: {
  title?: string | null;
}) {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return null;
}
