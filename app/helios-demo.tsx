'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  BlocksIcon,
  CheckIcon,
  Loader2Icon,
  PencilLineIcon,
  SendIcon,
  TrendingUpIcon,
  WorkflowIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AgentMark from '@/components/helios/agent-mark';
import HeliosBackdrop from '@/components/helios/helios-backdrop';
import { cn } from '@/lib/utils';
import { signUpForDemo, type DemoSignupState } from './actions';

type Step = 'intro' | 'capabilities' | 'demo';

// Helios's presence mark turns at a fifth of Ultron's pace, so it reads as calm, not busy.
const HELIOS_MARK_SPEED = 0.2;

const CAPABILITIES = [
  {
    icon: BlocksIcon,
    tag: 'New features',
    label: 'Build new features',
    detail:
      'Stand out from other staffing firms with tools your clients and workers will notice. Describe what you want, and Helios builds it into your account.',
    examples: [
      'A client dashboard with fill rates and hours worked',
      'A feedback form clients fill out after every shift',
      'Worker tiers, so your best people get first pick of shifts',
      'Surge pricing for last-minute and hard-to-fill shifts',
    ],
  },
  {
    icon: WorkflowIcon,
    tag: 'Workflows',
    label: 'Update your workflows',
    detail:
      'Change how work moves through your account: approvals, reminders, onboarding steps and handoffs. Helios shows you what will change before it saves anything.',
    examples: [
      'Remind workers 2 hours before their shift',
      'Send timesheets to the client for approval every Friday',
      "Add a background check before a worker's first shift",
    ],
  },
  {
    icon: PencilLineIcon,
    tag: 'Updates',
    label: 'Make updates',
    detail:
      'Change pay rates, roles, locations and client details across your account in one ask, instead of one record at a time.',
    examples: [
      "Raise every CNA's pay rate by $1 an hour",
      'Add our new client, Mercy Hospital, and its three sites',
      "Archive workers who haven't worked in 6 months",
    ],
  },
  {
    icon: SendIcon,
    tag: 'Reach out',
    label: 'Reach out to staff',
    detail:
      'Text or email the right people at the right time. Helios finds who is qualified and available, sends the message, and keeps track of who replies.',
    examples: [
      "Text available RNs about tonight's open shift",
      'Ask everyone with an expiring license to upload a new one',
      'Thank the team that covered last weekend',
    ],
  },
  {
    icon: TrendingUpIcon,
    tag: 'Metrics',
    label: 'Improve your metrics',
    detail:
      "Helios watches fill rate, time to fill, no-shows and margins, points out what's slipping, and suggests changes you can make in one step.",
    examples: [
      'Why did our fill rate drop last month?',
      'Which clients cancel shifts last minute most often?',
      'Suggest ways to cut overtime',
    ],
  },
];

/** The whole demo: the orb and its copy, then what Helios can do, then the sign-up. */
export default function HeliosDemo() {
  const [step, setStep] = useState<Step>('intro');
  // The first view waits on the orb's intro; later visits to a step just rise in.
  const [firstView, setFirstView] = useState(true);
  const { cycle, leaving } = useOrbCycle(step === 'intro');
  const go = (next: Step) => {
    setFirstView(false);
    setStep(next);
  };

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden">
      <HeliosBackdrop />
      <div className="relative z-10 flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-[max(env(safe-area-inset-top),1.5rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mx-auto my-auto flex w-full max-w-xl flex-col items-center py-4">
          {/* One button throughout, so the orb shrinks in place instead of being swapped out. */}
          <button
            type="button"
            className="helios-orb disabled:cursor-default"
            data-compact={step !== 'intro'}
            disabled={step === 'demo'}
            aria-label={step === 'intro' ? 'See what Helios can do' : 'Back to the start'}
            aria-expanded={step === 'capabilities'}
            onClick={() => go(step === 'intro' ? 'capabilities' : 'intro')}
          >
            {/* A new key each cycle remounts the mark, so its flash-on intro plays again. */}
            <span key={cycle} className="helios-orb-mark" data-leaving={leaving}>
              <AgentMark size={440} motionSpeed={HELIOS_MARK_SPEED} intro />
            </span>
          </button>

          {step === 'intro' && <Intro firstView={firstView} />}
          {step === 'capabilities' && <Capabilities onTryDemo={() => go('demo')} />}
          {step === 'demo' && <DemoSignup onBack={() => go('capabilities')} onDone={() => go('intro')} />}
        </div>
      </div>
    </main>
  );
}

const ORB_CYCLE_MS = 20_000;
const ORB_OUT_MS = 1_400;

/** While the home screen shows, the orb animates out and flashes back on every 20 seconds. */
function useOrbCycle(active: boolean) {
  const [cycle, setCycle] = useState(0);
  const [leavingCycle, setLeavingCycle] = useState<number | null>(null);

  useEffect(() => {
    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const out = setTimeout(() => setLeavingCycle(cycle), ORB_CYCLE_MS - ORB_OUT_MS);
    const reset = setTimeout(() => setCycle((c) => c + 1), ORB_CYCLE_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(reset);
    };
  }, [active, cycle]);

  // Leaving the home screen mid-exit brings the orb straight back.
  return { cycle, leaving: active && leavingCycle === cycle };
}

function Intro({ firstView }: { firstView: boolean }) {
  const rise = (n: 1 | 2 | 3) => (firstView ? `helios-intro-step helios-intro-step--${n}` : 'helios-step');
  return (
    <div className="mt-2 flex flex-col items-center gap-3 text-center">
      <h1 className={cn(rise(1), 'text-4xl font-semibold tracking-tight text-foreground sm:text-5xl')}>
        Let&apos;s get to work.
      </h1>
      <p className={cn(rise(2), 'max-w-md text-base leading-6 text-muted-foreground sm:text-lg sm:leading-7')}>
        I can set up your job titles, schedules, time off, pay rules and onboarding, and change them as your team
        grows.
      </p>
      <p className={cn(rise(3), 'mt-4')}>
        <span className="helios-hint text-sm text-muted-foreground">Tap the orb to see what I can do</span>
      </p>
    </div>
  );
}

function Capabilities({ onTryDemo }: { onTryDemo: () => void }) {
  const [selected, setSelected] = useState(0);
  const { icon: SelectedIcon, label, detail, examples } = CAPABILITIES[selected];

  return (
    <section className="helios-step mt-4 flex w-full flex-col items-center gap-5" aria-labelledby="capabilities-heading">
      <div className="flex flex-col gap-1 text-center">
        <h2 id="capabilities-heading" className="text-2xl font-semibold tracking-tight text-foreground">
          What Helios can do
        </h2>
        <p className="text-sm text-muted-foreground">Tap one to see how it works.</p>
      </div>

      {/* Five tags: 2 + 2 + 1 wide on phones, 3 + 2 on wider screens. */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-6" role="group" aria-label="Things Helios can do">
        {CAPABILITIES.map(({ icon: Icon, tag }, i) => (
          <button
            key={tag}
            type="button"
            className={cn('helios-pill', i < 3 ? 'sm:col-span-2' : 'sm:col-span-3', i === 4 && 'col-span-2')}
            aria-pressed={i === selected}
            aria-controls="capability-detail"
            onClick={() => setSelected(i)}
          >
            <Icon aria-hidden />
            {tag}
          </button>
        ))}
      </div>

      {/* Keyed so the panel rises in again on each pick. */}
      <div
        key={label}
        id="capability-detail"
        aria-live="polite"
        className="helios-panel helios-step flex w-full flex-col gap-3 rounded-xl p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
            <SelectedIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <h3 className="text-base font-medium text-foreground">{label}</h3>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">For example</span>
          <ul className="flex flex-col gap-1.5">
            {examples.map((example) => (
              <li key={example} className="rounded-lg bg-secondary px-3 py-1.5 text-sm leading-5 text-secondary-foreground">
                {example}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Button size="lg" className="h-12 w-full rounded-full text-base sm:w-auto sm:px-10" onClick={onTryDemo}>
        Try the demo
      </Button>
    </section>
  );
}

const INITIAL_STATE: DemoSignupState = { status: 'idle' };

function DemoSignup({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(signUpForDemo, INITIAL_STATE);

  if (state.status === 'created' || state.status === 'existing') {
    return (
      <section className="helios-step mt-4 flex w-full flex-col items-center gap-3 text-center" aria-live="polite">
        <span className="flex size-12 items-center justify-center rounded-full bg-green-500/15">
          <CheckIcon className="size-6 text-green-400" aria-hidden />
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {state.status === 'created' ? `You're in, ${state.firstName}.` : `You're already in, ${state.firstName}.`}
        </h2>
        <p className="max-w-sm text-base leading-6 text-muted-foreground">
          {state.status === 'created'
            ? "You've been added to the demo team. Keep your phone handy to see Helios at work."
            : 'That number is already on the demo team. Keep your phone handy to see Helios at work.'}
        </p>
        <Button variant="ghost" size="lg" className="mt-4 h-12 w-full rounded-full text-base" onClick={onDone}>
          Back to the start
        </Button>
      </section>
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fields ?? {}) : {};
  // React resets the form after each submit; these put back what was typed.
  const values = state.status === 'error' ? state.values : undefined;

  return (
    <section className="helios-step mt-4 flex w-full flex-col gap-5" aria-labelledby="demo-heading">
      <div className="flex flex-col gap-2 text-center">
        <h2 id="demo-heading" className="text-2xl font-semibold tracking-tight text-foreground">
          Try the demo
        </h2>
        <p className="text-base leading-6 text-muted-foreground">
          Add your name and mobile number to join the demo team, and see Helios work with you in it.
        </p>
      </div>

      <form action={formAction} className="helios-panel flex flex-col gap-4 rounded-xl p-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="firstName" label="First name" autoComplete="given-name" defaultValue={values?.firstName} error={fieldErrors.firstName} />
          <Field id="lastName" label="Last name" autoComplete="family-name" defaultValue={values?.lastName} error={fieldErrors.lastName} />
        </div>
        <Field
          id="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          defaultValue={values?.phone}
          error={fieldErrors.phone}
        />
        {/* Left empty by people; see signUpForDemo. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] size-px opacity-0"
        />

        {state.status === 'error' && (
          <p role="alert" className="text-sm text-red-400">
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" className="h-12 rounded-full text-base" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden />}
          {pending ? 'Adding you…' : 'Join the demo'}
        </Button>
      </form>

      <Button variant="ghost" size="lg" className="h-12 rounded-full text-base" onClick={onBack} disabled={pending}>
        <ArrowLeftIcon aria-hidden />
        Back
      </Button>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  ...input
}: { id: string; label: string; error?: string } & Omit<React.ComponentProps<typeof Input>, 'id' | 'name'>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 text-base md:text-base"
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
