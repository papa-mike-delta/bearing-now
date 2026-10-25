import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Brain,
  Github,
  BookOpen,
  Network,
  Users,
  Compass,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SmoothHashScroller,
  SmoothScrollLink,
} from "@/components/smooth-scroll-link";
import { siteConfig } from "@/lib/seo";

const features = [
  {
    icon: Zap,
    title: "Capture now. Organize later.",
    text: "Keep a thought in Inbox or the Daily Journal without choosing a Project or type. After a prior signed-in visit, text capture can queue offline and sync on reconnection.",
  },
  {
    icon: BookOpen,
    title: "A Daily Journal with context",
    text: "Write timestamped moments, reference real Items and see completed work alongside separate upcoming plans. Check-ins and guided Reviews have their own place.",
  },
  {
    icon: Network,
    title: "Connected knowledge",
    text: "Tasks, Notes, Habits, Events, Goals, People and Bookmarks share one record across views. Optional Projects, Areas and Tags add context without forcing a filing system.",
  },
  {
    icon: Users,
    title: "People, Places and you",
    text: "Keep a dedicated Me profile, distinguish mentions from real interactions, and connect follow-up Tasks and reference Notes. Save a Place and open external navigation.",
  },
  {
    icon: Compass,
    title: "Coach, with your approval",
    text: "Ask about your saved information and inspect linked evidence. Review and edit proposed changes before approving a batch. Requires an operator-configured external AI provider; provider use is disclosed before chat.",
  },
  {
    icon: ShieldCheck,
    title: "Private accounts. Portable records.",
    text: "Invitation-only accounts own separate data. Add and remove optional examples in Settings. Export a full V1 JSON backup, including relationships and histories, and restore it to the same account.",
  },
];
const software = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  description: siteConfig.description,
  codeRepository: siteConfig.repositoryUrl,
  license: `${siteConfig.repositoryUrl}/blob/main/LICENSE`,
  featureList: [
    "Quick Capture and offline text outbox",
    "Daily Journal",
    "Connected Items, Projects, Areas and Tags",
    "People and Place Bookmarks",
    "Approval-gated conversational Coach",
    "Focus Timer",
    "Same-account V1 export and restore",
  ],
  screenshot: siteConfig.screenshotUrls,
};
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(software) }}
      />
      <SmoothHashScroller />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-background focus:p-4"
      >
        Skip to content
      </a>
      <nav
        data-public-nav
        aria-label="Public navigation"
        className="border-b border-border"
      >
        <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex min-h-11 items-center gap-2 font-bold">
            <Brain className="text-primary" />
            bearing.now
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <SmoothScrollLink
              href="#features"
              className="inline-flex min-h-11 items-center"
            >
              Features
            </SmoothScrollLink>
            <SmoothScrollLink
              href="#connections"
              className="inline-flex min-h-11 items-center"
            >
              Connections
            </SmoothScrollLink>
            <SmoothScrollLink
              href="#philosophy"
              className="inline-flex min-h-11 items-center"
            >
              Philosophy
            </SmoothScrollLink>
            <Button variant="outline" asChild>
              <a
                href={siteConfig.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Github />
                GitHub
              </a>
            </Button>
            <Button asChild>
              <Link href="/app">
                Open app <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </nav>
      <main id="main">
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="mb-6 text-sm font-medium text-primary">
            Open source · Self-hostable · Personal knowledge
          </p>
          <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
            Capture your life.
            <br />
            <span className="text-primary">Find the connections.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            A place for the thought you need to catch, the day you want to
            remember, and the people and ideas that give it context.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/app">
                Open app <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <SmoothScrollLink href="#features">
                Explore features
              </SmoothScrollLink>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <a
                href={siteConfig.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                View source
              </a>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sign-in required. New accounts need an invitation. Optional demo
            examples are available after sign-in.
          </p>
          <figure className="mt-14 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <Image
              src="/screenshots/v1-journal.png"
              width={1440}
              height={1000}
              alt="The actual V1 Daily Journal with timestamped sample moments and referenced Items"
              priority
              className="h-auto w-full"
            />
            <figcaption className="border-t border-border p-4 text-sm text-muted-foreground">
              Daily Journal in V1, using fictional sample data. This is the app,
              captured in a test account.
            </figcaption>
          </figure>
        </section>
        <section
          id="features"
          className="scroll-mt-6 border-y border-border bg-muted/20 py-20"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-3xl font-bold">
              From a quick thought to useful context.
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <f.icon aria-hidden="true" className="mb-4 text-primary" />
                  <h3 className="text-xl font-semibold">{f.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {f.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="connections"
          className="mx-auto max-w-6xl scroll-mt-6 px-6 py-20"
        >
          <h2 className="text-3xl font-bold">
            One record, several perspectives.
          </h2>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            A Task can appear in Today, its Project, Search and Calendar without
            becoming four Tasks. Links connect meaningful records. Areas
            describe enduring responsibilities; Tags describe topics. Graph lets
            you explore those connections.
          </p>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Habits can contain simple Routine checklists. Focus sessions become
            Activity. Multiple daily mood check-ins stay separate from your
            Journal and structured Reviews.
          </p>
        </section>
        <section
          id="philosophy"
          className="border-y border-border bg-muted/20 py-20"
        >
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-3xl font-bold">A memory aid for your life.</h2>
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              Capture, organize, connect and recall personal information. Keep
              specialized work in the tools that suit it: a Bookmark can point
              to a file, book or place without building another specialized
              tracker.
            </p>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Offline support covers text capture after a prior authenticated
              visit. AI chat needs connectivity and server configuration. Files
              are external references. Your records remain the authority, and
              Coach writes require approval.
            </p>
            <Link
              href="/help"
              className="mt-5 inline-flex min-h-11 items-center underline"
            >
              Read the help and privacy notes
            </Link>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold">
            Start with what is on your mind.
          </h2>
          <p className="my-5 text-muted-foreground">
            Sign in to your private workspace, or self-host and invite your own
            accounts.
          </p>
          <Button size="lg" asChild>
            <Link href="/app">
              Open bearing.now <ArrowRight />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-10 text-sm">
          <span className="font-semibold">bearing.now</span>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/help"
          >
            Help
          </Link>
          <a
            className="inline-flex min-h-11 items-center underline"
            href={siteConfig.repositoryUrl}
          >
            GitHub
          </a>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/app"
          >
            Open app
          </Link>
        </div>
      </footer>
    </div>
  );
}
