'use client';
import React, { useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { usePlanningContext, usePlans } from '../application/hooks';
import {
  affordability, goalPlan, monthlyCapacity, remainingPlanned, requiredPerMonth, surplusPlan, whatIfSpend,
} from '../core/domain/planning';
import { Plus, Info, Chevron } from '../components/ui/icons';

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
  const [goalTarget, setGoalTarget] = useState(0);
  const [goalSaved, setGoalSaved] = useState(0);
  const [goalPerMonth, setGoalPerMonth] = useState(0);
  const [goalMonths, setGoalMonths] = useState(0);
  const [price, setPrice] = useState(0);
  const [withReceivables, setWithReceivables] = useState(false);
  const [whatIfBudgetId, setWhatIfBudgetId] = useState('');
  const [budgetDropdownOpen, setBudgetDropdownOpen] = useState(false);
  const [extraSpend, setExtraSpend] = useState(0);
  const [targetLeftover, setTargetLeftover] = useState(0);

  const capacity = monthlyCapacity(context);
  const money0 = (value: number) => money.fmt(Math.round(value));
  const moneySigned0 = (value: number) => money.fmtSigned(Math.round(value));
  const financialCondition = context.financialCondition;
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
      <div className={`plan-context${financialCondition >= 0 ? ' is-positive' : ' is-tight'}`}>
        <div className="financial-condition-head">
          <div>
            <span>{t('planning.financialCondition')}</span>
            <b className={financialCondition >= 0 ? 'positive' : 'negative'}>{moneySigned0(financialCondition)}</b>
            <p>{t('planning.financialConditionLead')}</p>
          </div>
          <span className="financial-condition-status">
            {t(financialCondition >= 0 ? 'planning.conditionSafe' : 'planning.conditionDeficit')}
          </span>
        </div>

        <div className="financial-condition-breakdown">
          <div><span>{t('planning.assetBalance')}</span><b className="positive">+{money0(context.cashBalance)}</b></div>
          <div><span>{t('planning.lockedSavings')}</span><b>−{money0(context.reserved)}</b></div>
          <div><span>{t('planning.creditBill')}</span><b>−{money0(context.nextMonthBills)}</b></div>
          <div><span>{t('planning.remainingBudget')}</span><b>−{money0(context.budgetRemaining)}</b></div>
        </div>

        <div className="financial-condition-equation">
          <span>{t('planning.formula')}</span>
          <b>
            {money0(context.cashBalance)} − {money0(context.reserved)} − {money0(context.nextMonthBills)} − {money0(context.budgetRemaining)} = <em>{moneySigned0(financialCondition)}</em>
          </b>
        </div>

        <div className={`financial-condition-note${financialCondition >= 0 ? ' ok' : ' warn'}`}>
          <Info />
          <span>
            {financialCondition >= 0
              ? t('planning.conditionSafeNote', { amount: money0(financialCondition) })
              : t('planning.conditionDeficitNote', { amount: money0(Math.abs(financialCondition)) })}
          </span>
        </div>
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
            <div><span>{t('planning.financialCondition')}</span><b className={context.financialCondition >= 0 ? 'positive' : 'negative'}>{moneySigned0(context.financialCondition)}</b></div>
            {withReceivables && <div><span>{t('planning.receivablesIncluded')}</span><b className="positive">+{money0(context.expectedReceivables)}</b></div>}
            <div><span>{t('planning.itemPrice')}</span><b className="negative">-{money0(price)}</b></div>
            <div className="total"><span>{t('planning.leftAfterPurchase')}</span><b className={afford.leftover >= 0 ? 'positive' : 'negative'}>{moneySigned0(afford.leftover)}</b></div>
          </div>

          <div className="calc-breakdown afford-legacy">
            <div><span>{t('planning.inflow')}</span><b className="positive">+{money0(afford.inflow)}</b></div>
            <div><span>{t('planning.budgetMonthly')}</span><b className="negative">−{money0(context.allocatedTotal)}</b></div>
            <div><span>{t('planning.billsNextMonth')}</span><b className="negative">−{money0(context.nextMonthBills)}</b></div>
            <div><span>{t('planning.itemPrice')}</span><b className="negative">−{money0(price)}</b></div>
            <div className="total"><span>{t('planning.leftAfterPurchase')}</span><b className={afford.leftover >= 0 ? 'positive' : 'negative'}>{moneySigned0(afford.leftover)}</b></div>
          </div>

          <div className="calc-result">
            <p className={`cr-verdict ${afford.affordable ? 'ok' : 'bad'}`}>
              {afford.affordable
                ? t('planning.affordYes', { left: money0(afford.leftover) })
                : t('planning.affordNo', { short: money0(-afford.leftover) })}
            </p>
            {!afford.affordable && (
              <div className="cr-note">
                {t('planning.affordConditionNote')}
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
                <div className="input-field">
                  <span id="whatif-budget-label">{t('planning.pickBudget')}</span>
                  <div
                    className={`custom-select${budgetDropdownOpen ? ' open' : ''}`}
                    onBlur={(event) => {
                      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                        setBudgetDropdownOpen(false);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className="custom-select-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={budgetDropdownOpen}
                      aria-labelledby="whatif-budget-label"
                      onClick={() => setBudgetDropdownOpen((open) => !open)}
                    >
                      <span>{whatIfBudget?.category ?? t('common.choose')}</span>
                      <Chevron />
                    </button>
                    {budgetDropdownOpen && (
                      <div className="suggest-list custom-select-list" role="listbox">
                        {budgets.map((budget) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={budget.id === whatIfBudget?.id}
                            className={budget.id === whatIfBudget?.id ? 'on' : ''}
                            key={budget.id}
                            onClick={() => {
                              setWhatIfBudgetId(budget.id);
                              setBudgetDropdownOpen(false);
                            }}
                          >
                            <span>{budget.category}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
