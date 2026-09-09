"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";

/* This dialog is reachable by every client (main-root-layout and the repo
 * sidebar both render it). It used to draw the upstream logo mark inline and
 * poll upstream's GitHub for new versions, then badge "Update to X" linking to
 * pagescms.org — none of which a white-label client should ever see. It now
 * shows who made the product and where to get help, and keeps one honest
 * "Built on" attribution (upstream is MIT; the line is a choice, not a duty). */
export function About() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button size="icon-sm" variant="ghost">
                {/* app/icon.svg is the favicon Next serves; one mark everywhere. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" className="size-6 rounded-md" />
                <span className="sr-only">About {BRAND.name}</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>About {BRAND.name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="w-[20rem] max-w-[calc(100vw-2rem)]">
        <DialogHeader className="items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-15 rounded-2xl" />
          <DialogTitle className="text-base font-semibold">
            {BRAND.name}
          </DialogTitle>
          <DialogDescription>{BRAND.tagline}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border">
          <Row
            label="Website"
            value={
              <ExternalLink href={BRAND.siteUrl}>
                {BRAND.siteUrl.replace(/^https?:\/\//, "")}
              </ExternalLink>
            }
          />
          <Row
            label="Help"
            value={
              <ExternalLink href={`mailto:${BRAND.supportEmail}`}>
                {BRAND.supportEmail}
              </ExternalLink>
            }
          />
          <Row
            label="Built on"
            value={
              <ExternalLink href={BRAND.upstream.url}>
                {BRAND.upstream.name}
              </ExternalLink>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-4 hover:decoration-muted-foreground/50"
    >
      {children}
    </a>
  );
}
