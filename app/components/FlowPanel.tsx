'use client'

import React from 'react'
import type { KidConfig } from '@/lib/types'

export type ActiveFlow = 'access' | 'agegate'

export interface FlowInputs {
  jurisdiction: string
  dateOfBirth: string
  age: string
  parentEmail: string
  kuid: string
  // Access Age Verification (AgeKit+) criteria
  criteriaMode: 'age' | 'ageCategory'
  criteriaAge: string
  criteriaCategory: 'DIGITAL_YOUTH_OR_ADULT' | 'ADULT'
}

const JURISDICTIONS = [
  ['US-CA', 'California, US (COPPA + CCPA)'],
  ['US', 'United States (COPPA)'],
  ['GB', 'United Kingdom (AADC)'],
  ['DE', 'Germany (GDPR-K)'],
  ['FR', 'France (GDPR-K)'],
  ['KR', 'South Korea'],
  ['AU', 'Australia'],
  ['BR', 'Brazil (LGPD)'],
  ['JP', 'Japan'],
] as const

const AGE_PRESETS = [
  ['Child · 8', '2017-08-15'],
  ['Teen · 14', '2011-08-15'],
  ['Adult · 27', '1998-08-15'],
] as const

export default function FlowPanel({
  config,
  activeFlow,
  inputs,
  onChange,
  onReset,
  productId,
  onProductChange,
}: {
  config: KidConfig | null
  activeFlow: ActiveFlow
  inputs: FlowInputs
  onChange: (next: FlowInputs) => void
  onReset: () => void
  productId: string
  onProductChange: (id: string) => void
}) {
  const set = <K extends keyof FlowInputs>(key: K, value: FlowInputs[K]) =>
    onChange({ ...inputs, [key]: value })

  const isAccess = activeFlow === 'access'

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="border-b border-ink-700/70 px-4 py-3">
        <h2 className="font-mono text-sm font-semibold text-ink-50">Inputs</h2>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <p className="text-[12.5px] leading-relaxed text-ink-400">
          {isAccess
            ? 'AgeKit+ Access Age Verification: create a verification request, run the hosted check (face / ID), and poll the result. Date of birth / age below are optional hints.'
            : 'CDK age gate + VPC: get jurisdiction requirements, run the age gate, and when consent is required email the challenge to a trusted adult and poll the result.'}
        </p>

        {config && config.products.length > 0 && (
          <Field label="Product (API key)" hint="selects which k-ID key is used">
            <select
              value={productId}
              onChange={(e) => onProductChange(e.target.value)}
              className="w-full cursor-pointer rounded-md border border-run/40 bg-run/5 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors focus:border-run/60 focus:ring-1 focus:ring-run/40"
            >
              {config.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.hasKey ? '' : ' — no key'}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Jurisdiction" hint="ISO 3166 country or subdivision">
          <select
            value={inputs.jurisdiction}
            onChange={(e) => set('jurisdiction', e.target.value)}
            className="w-full cursor-pointer rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors focus:border-run/60 focus:ring-1 focus:ring-run/40"
          >
            {JURISDICTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {code} — {label}
              </option>
            ))}
          </select>
        </Field>

        {/* Access-AV: criteria (required) */}
        {isAccess && (
          <div className="space-y-3 rounded-lg border border-pending/30 bg-pending/5 p-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-pending">
              Verification criteria (required)
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-ink-700/70 bg-ink-900/60 p-1">
              <SmallTab active={inputs.criteriaMode === 'age'} onClick={() => set('criteriaMode', 'age')}>
                Age threshold
              </SmallTab>
              <SmallTab
                active={inputs.criteriaMode === 'ageCategory'}
                onClick={() => set('criteriaMode', 'ageCategory')}
              >
                Age category
              </SmallTab>
            </div>
            {inputs.criteriaMode === 'age' ? (
              <Field label="Pass if at least (age)" hint="criteria.age">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={inputs.criteriaAge}
                  onChange={(e) => set('criteriaAge', e.target.value)}
                  className="w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors focus:border-run/60 focus:ring-1 focus:ring-run/40"
                />
              </Field>
            ) : (
              <Field label="Category" hint="criteria.ageCategory">
                <select
                  value={inputs.criteriaCategory}
                  onChange={(e) => set('criteriaCategory', e.target.value as FlowInputs['criteriaCategory'])}
                  className="w-full cursor-pointer rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors focus:border-run/60 focus:ring-1 focus:ring-run/40"
                >
                  <option value="ADULT">ADULT</option>
                  <option value="DIGITAL_YOUTH_OR_ADULT">DIGITAL_YOUTH_OR_ADULT</option>
                </select>
              </Field>
            )}
          </div>
        )}

        <Field
          label={isAccess ? 'Date of birth (hint)' : 'Date of birth'}
          hint={isAccess ? 'subject.claimedDateOfBirth' : 'YYYY-MM-DD · drives the age decision'}
        >
          <div className="mb-2 flex flex-wrap gap-1.5">
            {AGE_PRESETS.map(([label, dob]) => (
              <button
                key={dob}
                type="button"
                onClick={() => set('dateOfBirth', dob)}
                className={`cursor-pointer rounded border px-2 py-1 font-mono text-[11px] transition-colors duration-200 ${
                  inputs.dateOfBirth === dob
                    ? 'border-run/50 bg-run/10 text-run'
                    : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={inputs.dateOfBirth}
            onChange={(e) => set('dateOfBirth', e.target.value)}
            className="w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors focus:border-run/60 focus:ring-1 focus:ring-run/40"
          />
        </Field>

        <Field label={isAccess ? 'Age (hint, optional)' : 'Age (optional)'} hint={isAccess ? 'subject.claimedAge' : 'sent as integer'}>
          <input
            type="number"
            min={0}
            max={120}
            placeholder="e.g. 14"
            value={inputs.age}
            onChange={(e) => set('age', e.target.value)}
            className="w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-run/60 focus:ring-1 focus:ring-run/40"
          />
        </Field>

        {/* VPC-only: parent email */}
        {!isAccess && (
          <Field label="Parent / guardian email" hint="for challenge/send-email (VPC)">
            <input
              type="email"
              placeholder="parent@example.com"
              value={inputs.parentEmail}
              onChange={(e) => set('parentEmail', e.target.value)}
              className="w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[13px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-run/60 focus:ring-1 focus:ring-run/40"
            />
          </Field>
        )}

        <Field label="kuid (optional)" hint="Link to a k-ID user id">
          <input
            type="text"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={inputs.kuid}
            onChange={(e) => set('kuid', e.target.value)}
            className="w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[12px] text-ink-100 outline-none transition-colors placeholder:text-ink-600 focus:border-run/60 focus:ring-1 focus:ring-run/40"
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-ink-700/70 px-4 py-4">
        <ConfigStatus config={config} />
        <button
          type="button"
          onClick={onReset}
          className="w-full cursor-pointer rounded-md border border-ink-700 px-4 py-2 font-mono text-[12px] text-ink-300 transition-colors duration-200 hover:border-ink-600 hover:text-ink-50"
        >
          Reset flow state
        </button>
      </div>
    </section>
  )
}

function SmallTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded px-2 py-1.5 font-mono text-[11.5px] transition-colors duration-200 ${
        active ? 'bg-ink-700/70 text-ink-50' : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-100'
      }`}
    >
      {children}
    </button>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  const id = React.useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-medium text-ink-200">
        {label}
        {hint && <span className="ml-2 font-mono text-[11px] font-normal text-ink-500">{hint}</span>}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  )
}

function ConfigStatus({ config }: { config: KidConfig | null }) {
  if (!config) {
    return <p className="font-mono text-[11px] text-ink-500">Loading config…</p>
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
      <span className={config.testMode ? 'text-pending' : 'text-prohibited'}>
        ● {config.testMode ? 'TEST' : 'LIVE'}
      </span>
      <span className="text-ink-500">{config.apiUrl.replace(/^https?:\/\//, '')}</span>
      <span className={config.hasApiKey ? 'text-run' : 'text-prohibited'}>
        {config.hasApiKey ? 'key ✓' : 'no key ✗'}
      </span>
      <span className={config.webhookConfigured ? 'text-run' : 'text-ink-600'}>
        {config.webhookConfigured ? 'webhook ✓' : 'webhook —'}
      </span>
    </div>
  )
}
