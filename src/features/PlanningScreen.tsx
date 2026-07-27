'use client';
import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { usePlanningContext, usePlans } from '../application/hooks';
import {
  affordability, goalPlan, monthlyCapacity, remainingPlanned, requiredPerMonth, surplusPlan, whatIfSpend,
} from '../core/domain/planning';
import { Plus, Info } from '../components/ui/icons';

type Method = 'goal' | 'afford' | 'whatif' | 'surplus';

const num = (raw: string) => Number(raw.replace(/\D/g, '')) || 0;

/** Didefinisikan di luar komponen supaya input tidak kehilangan fokus tiap ketikan. */
function MoneyInput({ label, value, locale, onChange }: {
  label: string; value: number; locale: string; onChange: (next: number) => void;
}) {
  return (
    <label className="input-field">
      <span>{label}</span>
      <div className="money-input">
        <span className="rp">Rp</span>
        <input
          inputMode="numeric"
          value={value ? value.toLocaleString(locale) : ''}
          placeholder="0"
          onChange={(event) => onChange(num(event.target.value))}
        />
      </div>
    </label>
  );
}

const Sandbox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /></svg>
);

export default function PlanningScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const numLocale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: plans } = usePlans();
  const context = usePlanningContext();
  const budgets = context.budgets;

  const [method, setMethod] = useState<Method>('goal');
  // Setiap metode punya input sendiri agar berpindah metode tidak menghapus isian.
  const [goalTarget, setGoalTarget] = useState(10_000_000);
  const [goalSaved, setGoalSaved] = useState(0);
  const [goalPerMonth, setGoalPerMonth] = useState(0);
  const [goalMonths, setGoalMonths] = useState(0);
  const [price, setPrice] = useState(3_500_000);
  const [withReceivables, setWithReceivables] = useState(false);
  const [whatIfBudgetId, setWhatIfBudgetId] = useState('');
  const [extraSpend, setExtraSpend] = useState(150_000);
  const [targetLeftover, setTargetLeftover] = useState(1_000_000);

  const capacity = monthlyCapacity(context);
  const money0 = (value: number) => money.fmt(Math.round(value));
  const totalTarget = plans.reduce((sum, plan) => sum + plan.target, 0);
  const totalSaved = plans.reduce((sum, plan) => sum + plan.saved, 0);
  const savedPct = totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0;

  const goal = goalPlan(goalTarget, goalSaved, goalPerMonth, context);
  const byDeadline = goalMonths > 0 ? requiredPerMonth(goalTarget, goalSaved, goalMonths) : 0;
  const afford = affordability(price, context, withReceivables);
  const whatIfBudget = budgets.find((budget) => budget.id === whatIfBudgetId) ?? budgets[0];
  const whatIf = whatIfBudget ? whatIfSpend(whatIfBudget, extraSpend, context.daysLeft) : null;
  const cutPlan = surplusPlan(targetLeftover, budgets, context.available);

  const methods: Array<[Method, string]> = [
    ['goal', t('planning.mGoal')],
    ['afford', t('planning.mAfford')],
    ['whatif', t('planning.mWhatIf')],
    ['surplus', t('planning.mSurplus')],
  ];

  return (
    <>
      <div className="sandbox-tag"><Sandbox /> {t('planning.sandboxTag')}</div>

      {/* Angka dasar yang dipakai semua simulasi — biar jelas hasilnya datang dari mana. */}
      <div className="plan-context">
        <div><span>{t('planning.cashAvailable')}</span><b>{money0(context.available)}</b></div>
        <div><span>{t('planning.incomeMonthly')}</span><b className="positive">{money0(context.monthlyIncome)}</b></div>
        <div><span>{t('planning.budgetMonthly')}</span><b className="negative">{money0(context.allocatedTotal)}</b></div>
        <div><span>{t('planning.billsNextMonth')}</span><b className="negative">{money0(context.nextMonthBills)}</b></div>
        <div className="wide"><span>{t('planning.capacity')}</span><b className={capacity > 0 ? 'positive' : 'negative'}>{money0(capacity)} <small>/{t('planning.perMonth')}</small></b></div>
      </div>

      <div className="sec"><span className="t">{t('planning.chooseMethod')}</span></div>
      <div className="filter-pills">
        {methods.map(([value, label]) => (
          <button key={value} className={method === value ? 'on' : ''} onClick={() => setMethod(value)}>{label}</button>
        ))}
      </div>

      {method === 'goal' && (
        <div className="calc-card">
          <p className="calc-lead">{t('planning.goalLead')}</p>
          <div className="form-grid">
            <MoneyInput label={t('planning.goalTarget')} value={goalTarget} onChange={setGoalTarget} locale={numLocale} />
            <MoneyInput label={t('planning.goalSaved')} value={goalSaved} onChange={setGoalSaved} locale={numLocale} />
            <MoneyInput label={t('planning.goalPerMonth')} value={goalPerMonth} onChange={setGoalPerMonth} locale={numLocale} />
            <label className="input-field">
              <span>{t('planning.goalDeadline')}</span>
              <input inputMode="numeric" value={goalMonths || ''} placeholder={t('planning.monthsPlaceholder')} onChange={(event) => setGoalMonths(num(event.target.value))} />
            </label>
          </div>

          <div className="calc-result">
            <div className="cr-main">
              <span>{t('planning.needToCollect')}</span>
              <b>{money0(goal.needed)}</b>
            </div>
            {goal.needed === 0 ? (
              <p className="cr-verdict ok">{t('planning.goalReached')}</p>
            ) : goal.perMonth > 0 ? (
              <>
                <p className="cr-verdict ok">
                  {t('planning.goalMonths', { n: goal.months, per: money0(goal.perMonth) })}
                  {goal.finishDate && ` · ${goal.finishDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}`}
                </p>
                <div className="cr-note">
                  {goalPerMonth === 0
                    ? t('planning.usingCapacity', { per: money0(goal.suggestedPerMonth) })
                    : goal.strain > 1
                      ? t('planning.strainWarn', { per: money0(goal.suggestedPerMonth), pct: Math.round(goal.strain * 100) })
                      : t('planning.strainOk', { pct: Math.round(goal.strain * 100) })}
                </div>
              </>
            ) : (
              <p className="cr-verdict bad">{t('planning.noCapacity')}</p>
            )}
            {goalMonths > 0 && (
              <div className="cr-alt">
                <span>{t('planning.ifDeadline', { n: goalMonths })}</span>
                <b>{money0(byDeadline)}<small>/{t('planning.perMonth')}</small></b>
                <em className={byDeadline <= capacity ? 'ok' : 'bad'}>
                  {byDeadline <= capacity ? t('planning.realistic') : t('planning.tooTight')}
                </em>
              </div>
            )}
          </div>
        </div>
      )}

      {method === 'afford' && (
        <div className="calc-card">
          <p className="calc-lead">{t('planning.affordLead')}</p>
          <div className="form-grid">
            <MoneyInput label={t('planning.itemPrice')} value={price} onChange={setPrice} locale={numLocale} />
          </div>
          <label className="cal-toggle calc-toggle">
            <input type="checkbox" checked={withReceivables} onChange={(event) => setWithReceivables(event.target.checked)} />
            <span>{t('planning.includeReceivables', { amount: money0(context.expectedReceivables) })}</span>
          </label>

          <div className="calc-breakdown">
            <div><span>{t('planning.inflow')}</span><b className="positive">+{money0(afford.inflow)}</b></div>
            <div><span>{t('planning.budgetMonthly')}</span><b className="negative">−{money0(context.allocatedTotal)}</b></div>
            <div><span>{t('planning.billsNextMonth')}</span><b className="negative">−{money0(context.nextMonthBills)}</b></div>
            <div className="total"><span>{t('planning.surplusNextMonth')}</span><b className={afford.surplus >= 0 ? 'positive' : 'negative'}>{money0(afford.surplus)}</b></div>
          </div>

          <div className="calc-result">
            <p className={`cr-verdict ${afford.affordable ? 'ok' : 'bad'}`}>
              {afford.affordable
                ? t('planning.affordYes', { left: money0(afford.leftover) })
                : t('planning.affordNo', { short: money0(-afford.leftover) })}
            </p>
            {!afford.affordable && (
              <div className="cr-note">
                {afford.fromCash >= -afford.leftover
                  ? t('planning.affordFromCash', { amount: money0(afford.fromCash) })
                  : t('planning.affordImpossible')}
              </div>
            )}
          </div>
        </div>
      )}

      {method === 'whatif' && (
        <div className="calc-card">
          <p className="calc-lead">{t('planning.whatIfLead')}</p>
          {budgets.length === 0 ? (
            <div className="saving-empty">{t('planning.noBudget')}</div>
          ) : (
            <>
              <div className="form-grid">
                <label className="input-field">
                  <span>{t('planning.pickBudget')}</span>
                  <select value={whatIfBudget?.id ?? ''} onChange={(event) => setWhatIfBudgetId(event.target.value)}>
                    {budgets.map((budget) => <option value={budget.id} key={budget.id}>{budget.category}</option>)}
                  </select>
                </label>
                <MoneyInput label={t('planning.extraSpend')} value={extraSpend} onChange={setExtraSpend} locale={numLocale} />
              </div>
              {whatIf && (
                <div className="calc-result">
                  <div className="whatif-grid">
                    <div>
                      <span>{t('planning.before')}</span>
                      <b>{money0(whatIf.before.remaining)}</b>
                      <small>{money0(whatIf.before.perDay)}/{t('planning.day')}</small>
                    </div>
                    <div className="arrow" aria-hidden>→</div>
                    <div className={whatIf.over ? 'bad' : ''}>
                      <span>{t('planning.after')}</span>
                      <b className={whatIf.over ? 'negative' : ''}>{money0(whatIf.after.remaining)}</b>
                      <small>{money0(whatIf.after.perDay)}/{t('planning.day')}</small>
                    </div>
                  </div>
                  <p className={`cr-verdict ${whatIf.over ? 'bad' : 'ok'}`}>
                    {whatIf.over
                      ? t('planning.whatIfOver', { amount: money0(-whatIf.after.remaining) })
                      : t('planning.whatIfOk', { drop: money0(whatIf.perDayDrop), days: context.daysLeft })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {method === 'surplus' && (
        <div className="calc-card">
          <p className="calc-lead">{t('planning.surplusLead')}</p>
          <div className="form-grid">
            <MoneyInput label={t('planning.targetLeftover')} value={targetLeftover} onChange={setTargetLeftover} locale={numLocale} />
          </div>
          <div className="calc-breakdown">
            <div><span>{t('planning.cashAvailable')}</span><b>{money0(context.available)}</b></div>
            <div><span>{t('planning.plannedRest')}</span><b className="negative">−{money0(remainingPlanned(budgets))}</b></div>
            <div className="total"><span>{t('planning.projectedLeftover')}</span><b className={cutPlan.projected >= 0 ? 'positive' : 'negative'}>{money0(cutPlan.projected)}</b></div>
          </div>
          {cutPlan.needed === 0 ? (
            <p className="cr-verdict ok">{t('planning.surplusSafe')}</p>
          ) : !cutPlan.possible ? (
            <p className="cr-verdict bad">{t('planning.surplusImpossible', { amount: money0(cutPlan.needed) })}</p>
          ) : (
            <>
              <p className="cr-verdict warn">{t('planning.surplusCut', { amount: money0(cutPlan.needed), pct: cutPlan.overallPercent })}</p>
              <div className="cut-list">
                {cutPlan.lines.map((line) => (
                  <div className="cut-row" key={line.budget.id}>
                    <div className="cut-name">
                      <b>{line.budget.category}</b>
                      <small>{money0(line.remaining)} → {money0(line.after)}</small>
                    </div>
                    <div className="cut-bar"><i style={{ width: `${line.percent}%` }} /></div>
                    <div className="cut-num"><b>−{money0(line.cut)}</b><small>−{line.percent}%</small></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="note"><Info /><span>{t('planning.note')}</span></div>

      <div className="sec"><span className="t">{t('planning.savedPlans')}</span><button className="addg" onClick={() => ui.openCreate('planning')}><Plus />{t('common.new')}</button></div>
      <div className="planning-overview">
        <div><span>{t('planning.totalTarget')}</span><b>{money.fmt(totalTarget)}</b></div>
        <div><span>{t('planning.collected')}</span><b>{money.fmt(totalSaved)}</b></div>
        <div className="planning-ring" style={{ background: `radial-gradient(circle at center,var(--surface) 56%,transparent 57%),conic-gradient(var(--mint) 0 ${savedPct}%,var(--surface-3) ${savedPct}% 100%)` }}>
          <strong>{savedPct}%</strong><span>{t('planning.progress')}</span>
        </div>
      </div>
      {plans.map(p => {
        const pct = p.target ? Math.round((p.saved / p.target) * 100) : 0;
        const monthsLeft = capacity > 0 ? Math.ceil(Math.max(0, p.target - p.saved) / capacity) : null;
        return (
          <div className="plan" key={p.id} onClick={() => ui.openItem(p.title, 'planning', p.id)}>
            <div className="ph"><div><div className="pt">{p.title}</div><div className="pmeta">{p.targetDate ? t('planning.targetPrefix') + ' ' + new Date(p.targetDate).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : t('planning.projection')}</div></div>
              <span className={'pstatus ' + (p.status === 'draft' ? 'draft' : 'active')}>{p.status === 'draft' ? t('planning.draft') : t('planning.active')}</span></div>
            <div className="ptg">{money.fmtCompact(p.target)} <small>· {t('planning.setAside')} {money.fmtCompact(p.saved)}</small></div>
            <div className="pbar"><i style={{ width: Math.min(100, pct) + '%' }} /></div>
            <div className="pfoot">
              <span>{pct}% {t('planning.collectedPct')}</span>
              <span>{monthsLeft === null ? t('planning.feasibility') : t('planning.etaMonths', { n: monthsLeft })}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
