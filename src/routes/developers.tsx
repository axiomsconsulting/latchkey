import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Check, Code2, Copy, KeyRound, Plug, Sparkles } from "lucide-react";

import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPublicApiPlans } from "@/lib/admin.functions";
import { API_VERSION, MCP_PATH, OPERATIONS, REST_BASE, type Operation } from "@/lib/api-spec";
import { money } from "@/lib/pricing";
import { brandName, rebrand } from "@/lib/brand";

export const Route = createFileRoute("/developers")({
  loader: () => getPublicApiPlans(),
  head: () => ({
    meta: [
      { title: rebrand("Latchkey API & MCP — connect your rooms to anything") },
      {
        name: "description",
        content: rebrand("Connect Latchkey to Claude, ChatGPT, Cursor and your own tools. Bookings, arrivals, guest requests and messages over MCP and a simple REST API."),
      },
    ],
  }),
  component: Developers,
});

const SECTIONS = [
  ["start", "Start in 3 steps"],
  ["assistants", "Connect an AI assistant"],
  ["ask", "What you can ask"],
  ["rest", "REST API"],
  ["errors", "Errors"],
  ["limits", "Limits and pricing"],
] as const;

/**
 * The developer page, generated from the live API definition (api-spec.ts):
 * every action, parameter and example here is the one the server runs.
 */
function Developers() {
  const plans = Route.useLoaderData();
  const [origin, setOrigin] = useState("https://your-latchkey-address");
  useEffect(() => setOrigin(window.location.origin), []);
  const mcpUrl = `${origin}${MCP_PATH}`;
  const restUrl = `${origin}${REST_BASE}`;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-6 space-y-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
            <li className="px-3 pt-4 text-xs text-muted-foreground">Version {API_VERSION}</li>
          </ul>
        </nav>

        <main className="min-w-0 space-y-14">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">API & MCP</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">Connect your rooms to anything</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              Ask an AI assistant who's arriving today, have your website add direct bookings, or send guests a message from your own tools.
              One key works for both the MCP server (for AI assistants) and the REST API (for everything else).
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge variant="outline">{OPERATIONS.length} actions</Badge>
              <Badge variant="outline">MCP · Streamable HTTP</Badge>
              <Badge variant="outline">REST · JSON · OpenAPI 3.1</Badge>
              <Badge variant="outline">Always up to date: generated from the live API</Badge>
            </div>
          </header>

          <Section id="start" title="Start in 3 steps" icon={Sparkles}>
            <ol className="grid gap-4 md:grid-cols-3">
              <Step n={1} title="Turn it on">
                The API and MCP server come with the <strong>Pro</strong> plan, or as an add-on to Start and Grow. Switch it on in{" "}
                <Link to="/app/billing" className="underline underline-offset-4">Billing</Link>.
              </Step>
              <Step n={2} title="Make a key">
                In <Link to="/app/settings" className="underline underline-offset-4">Settings → API & MCP</Link>, name a key and choose whether it can make changes.
                Copy it: it's shown once.
              </Step>
              <Step n={3} title="Connect">
                Paste it into your AI assistant or tool, using the steps below. That's it: try asking "Who's arriving today?"
              </Step>
            </ol>
          </Section>

          <Section id="assistants" title="Connect an AI assistant" icon={Bot}>
            <p className="text-muted-foreground">
              {brandName()}'s MCP server works with any app that supports remote MCP servers over HTTP. Replace <Code>lk_…</Code> with your key.
            </p>
            <Tabs defaultValue="claude-code" className="mt-4">
              <TabsList className="h-auto flex-wrap rounded-2xl p-1">
                <TabsTrigger value="claude-code" className="rounded-xl">Claude Code</TabsTrigger>
                <TabsTrigger value="claude-desktop" className="rounded-xl">Claude Desktop</TabsTrigger>
                <TabsTrigger value="web" className="rounded-xl">Claude.ai & ChatGPT</TabsTrigger>
                <TabsTrigger value="cursor" className="rounded-xl">Cursor & others</TabsTrigger>
              </TabsList>
              <TabsContent value="claude-code" className="mt-4 space-y-2">
                <p>Run this once in your terminal:</p>
                <CodeBlock code={`claude mcp add --transport http latchkey ${mcpUrl} \\\n  --header "Authorization: Bearer lk_…"`} />
              </TabsContent>
              <TabsContent value="claude-desktop" className="mt-4 space-y-2">
                <p>
                  In Claude Desktop, open Settings → Developer → Edit config, and add {brandName()} to <Code>mcpServers</Code>:
                </p>
                <CodeBlock
                  code={JSON.stringify(
                    { mcpServers: { latchkey: { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization: Bearer lk_…"] } } },
                    null,
                    2,
                  )}
                />
              </TabsContent>
              <TabsContent value="web" className="mt-4 space-y-2">
                <p>
                  Apps that connect by address alone (Claude.ai custom connectors, ChatGPT connectors) can use your private connector address. Keep it secret
                  like a password; revoking the key stops it working.
                </p>
                <CodeBlock code={`${mcpUrl}/lk_…`} />
              </TabsContent>
              <TabsContent value="cursor" className="mt-4 space-y-2">
                <p>
                  In Cursor, add to <Code>.cursor/mcp.json</Code>. Other MCP apps (Windsurf, VS Code, n8n, Zed) take the same address and header.
                </p>
                <CodeBlock code={JSON.stringify({ mcpServers: { latchkey: { url: mcpUrl, headers: { Authorization: "Bearer lk_…" } } } }, null, 2)} />
              </TabsContent>
            </Tabs>
          </Section>

          <Section id="ask" title="What you can ask" icon={Sparkles}>
            <ul className="grid gap-3 md:grid-cols-2">
              {OPERATIONS.map((op) => (
                <li key={op.id} className="card-soft p-4">
                  <p className="font-medium">"{op.askLike}"</p>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {op.title} · <Code>{op.id}</Code> {op.scope === "write" ? <Badge variant="secondary" className="ml-1">needs a key that can make changes</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="rest" title="REST API" icon={Code2}>
            <p className="text-muted-foreground">
              Base address <Code>{restUrl}</Code>. Send your key in the <Code>Authorization: Bearer lk_…</Code> header. Requests and responses are JSON.
              The <a className="underline underline-offset-4" href={`${REST_BASE}/openapi.json`}>OpenAPI document</a> imports into Postman, Zapier, Make, n8n
              and most tools.
            </p>
            <div className="mt-6 space-y-6">
              {OPERATIONS.map((op) => (
                <Endpoint key={op.id} op={op} restUrl={restUrl} />
              ))}
            </div>
          </Section>

          <Section id="errors" title="Errors" icon={Plug}>
            <p className="text-muted-foreground">
              Errors come back as <Code>{`{ "error": { "code": "…", "message": "…" } }`}</Code> with a message you can show as it is. Over MCP, the same message
              comes back as the tool's answer.
            </p>
            <table className="mt-4 w-full text-left text-sm">
              <tbody className="divide-y divide-border">
                {[
                  ["400", "bad_input, bad_dates, bad_room", "Something in the request needs fixing; the message says what."],
                  ["401", "missing_key, bad_key", "No key, or a revoked one."],
                  ["403", "read_only_key, not_on_plan, subscription_ended", "The key can't make changes, the API isn't on the plan, or the account has ended."],
                  ["404", "not_found", "Nothing with that id in your account."],
                  ["429", "allowance_used", "This month's requests are used up; it resets on the 1st."],
                  ["503", "api_paused", "Paused for maintenance; try again shortly."],
                ].map(([code, names, what]) => (
                  <tr key={code}>
                    <td className="py-2 pr-4 font-mono">{code}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{names}</td>
                    <td className="py-2">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section id="limits" title="Limits and pricing" icon={KeyRound}>
            <ul className="space-y-2">
              {plans.plans.map((p) => (
                <li key={p.key} className="flex gap-2">
                  <Check className="mt-1 size-4 text-primary" />
                  <span>
                    <strong>{p.name}</strong>:{" "}
                    {p.apiRequests > 0
                      ? `${p.apiRequests.toLocaleString("en-GB")} requests a month included`
                      : `add the API for ${money(plans.addon.pricePence, plans.currency)} a month, with ${plans.addon.includedRequests.toLocaleString("en-GB")} requests`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Every REST call and every MCP tool call counts as one request. Your usage shows in Settings → API & MCP. What changed and when is in{" "}
              <Link to="/about" className="underline underline-offset-4">What's new</Link>.
            </p>
          </Section>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Bot; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="flex items-center gap-3 text-2xl">
        <span className="grid size-10 place-items-center rounded-2xl bg-secondary text-primary">
          <Icon className="size-5" />
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="card-soft p-5">
      <span className="grid size-8 place-items-center rounded-full bg-primary font-display text-primary-foreground">{n}</span>
      <h3 className="mt-3 text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-2xl bg-foreground p-4 pr-24 font-mono text-sm text-background">{code}</pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-2 top-2"
        onClick={() =>
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function curlFor(op: Operation, restUrl: string): string {
  const path = op.path.replace(/\{(\w+)\}/g, (_m, name: string) => `<${name}>`);
  const query = op.params.filter((p) => p.in === "query" && p.example !== undefined);
  const qs = query.length ? `?${query.map((p) => `${p.name}=${p.example}`).join("&")}` : "";
  const body = op.params.filter((p) => p.in === "body");
  const lines = [`curl ${op.method !== "GET" ? `-X ${op.method} ` : ""}"${restUrl}${path}${qs}" \\`, `  -H "Authorization: Bearer lk_…"`];
  if (body.length) {
    const example = Object.fromEntries(body.filter((p) => p.required || p.example !== undefined).map((p) => [p.name, p.example ?? (p.type === "uuid" ? "<id>" : p.type === "date" ? "2026-10-17" : "…")]));
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "Content-Type: application/json" \\`, `  -d '${JSON.stringify(example)}'`);
  }
  return lines.join("\n");
}

function Endpoint({ op, restUrl }: { op: Operation; restUrl: string }) {
  return (
    <article id={op.id} className="card-soft scroll-mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="font-mono">{op.method}</Badge>
        <code className="font-mono text-sm">{op.path}</code>
        <Badge variant="outline">{op.scope === "write" ? "read + write key" : "any key"}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          MCP tool <Code>{op.id}</Code>
        </span>
      </div>
      <h3 className="mt-3 text-lg">{op.title}</h3>
      <p className="text-muted-foreground">{op.summary}</p>
      {op.params.length ? (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Name</th>
              <th className="py-1 pr-3 font-medium">Type</th>
              <th className="py-1 font-medium">What it does</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {op.params.map((p) => (
              <tr key={p.name} className="align-top">
                <td className="py-1.5 pr-3 font-mono text-xs">
                  {p.name}
                  {p.required ? <span className="text-destructive"> *</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                  {p.type} · {p.in}
                </td>
                <td className="py-1.5">
                  {p.description}
                  {p.enum ? <span className="block text-xs text-muted-foreground">One of: {p.enum.join(", ")}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <CodeBlock code={curlFor(op, restUrl)} />
        <CodeBlock code={JSON.stringify(op.example, null, 2)} />
      </div>
    </article>
  );
}
