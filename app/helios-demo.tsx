'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  BanknoteIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClockIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  UserPlusIcon,
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
    icon: BriefcaseIcon,
    tag: 'Job titles',
    label: 'Set up job titles',
    detail:
      'Tell Helios the roles your team works, like Server or Line Cook. It adds each one with its pay rate and the certifications people need before they can be scheduled for it.',
    example: 'Add a Shift Lead role that pays $22 an hour.',
  },
  {
    icon: CalendarDaysIcon,
    tag: 'Schedules',
    label: 'Build schedules',
    detail:
      "Helios builds shifts and weekly schedules around who is available, flags conflicts and overtime before you publish, and helps you find someone when a shift opens up.",
    example: "Fill Saturday's open bartender shift.",
  },
  {
    icon: ClockIcon,
    tag: 'Time off',
    label: 'Change how time off works',
    detail:
      'Set how time off is earned, how much carries over, and who approves requests. Helios sets up the request form and keeps balances up to date.',
    example: 'Give full-time staff 10 days of PTO a year.',
  },
  {
    icon: BanknoteIcon,
    tag: 'Pay rules',
    label: 'Set pay rules',
    detail:
      'Set overtime, night and weekend differentials, and holiday pay. Helios applies them to every timesheet, so payroll comes out right without manual fixes.',
    example: 'Pay time and a half after 40 hours a week.',
  },
  {
    icon: UserPlusIcon,
    tag: 'New hires',
    label: 'Get a new hire started',
    detail:
      'When you hire someone, Helios sends them their paperwork to sign on their phone and shows you what is still missing before their first shift.',
    example: 'Start onboarding for our new hire, Maria.',
  },
  {
    icon: MessageSquareTextIcon,
    tag: 'Growing',
    label: 'Grow with your team',
    detail:
      'Open a location, add a team or change a policy by asking in plain words. Helios shows you what it will change, and makes the update once you say yes.',
    example: "We're opening a second location in Austin.",
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
  const { icon: SelectedIcon, label, detail, example } = CAPABILITIES[selected];

  return (
    <section className="helios-step mt-4 flex w-full flex-col items-center gap-5" aria-labelledby="capabilities-heading">
      <div className="flex flex-col gap-1 text-center">
        <h2 id="capabilities-heading" className="text-2xl font-semibold tracking-tight text-foreground">
          What Helios can do
        </h2>
        <p className="text-sm text-muted-foreground">Tap one to see how it works.</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Things Helios can do">
        {CAPABILITIES.map(({ icon: Icon, tag }, i) => (
          <button
            key={tag}
            type="button"
            className="helios-pill"
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
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          <span className="text-muted-foreground">Try asking: </span>“{example}”
        </p>
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
