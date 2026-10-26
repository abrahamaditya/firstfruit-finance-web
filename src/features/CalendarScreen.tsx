'use client';

import React, { useMemo, useState } from 'react';
import { useUI, useMoney, useT } from '../components/AppShell';
import { useInstallments, useReminders, useSubscriptions, useTransactions, useWallets } from '../application/hooks';
import { useRepositories } from '../infrastructure/RepositoryProvider';
import { addDays, billingDatesInRange, dayKey, monthGrid, startOfDay, weekGrid } from '../core/domain/calendar';
import { Check, ChevronR, Clock, Plus, Recur, Up, Down, TransferCard } from '../components/ui/icons';
import { isActualIncome, isIncome, netWorthDirection } from '../core/domain/calculations';
import { installmentSchedule } from '../core/domain/installment-schedule';

type View = 'month' | 'week';

export default function CalendarScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const repos = useRepositories();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  // Kalender bisa digeser ke bulan mana pun, jadi sumbernya seluruh transaksi.
  const { data: transactions } = useTransactions();
  const { data: installments } = useInstallments();
  const { wallets } = useWallets();
  const { subs } = useSubscriptions();
  const { reminders } = useReminders();
  const walletName = (id?: string) => wallets.find((wallet) => wallet.id === id)?.name;
  const directionOf = (transaction: typeof transactions[number]) =>
    netWorthDirection(transaction, wallets.find((wallet) => wallet.id === transaction.walletId)?.kind);
  const toneOf = (transaction: typeof transactions[number]) => {
    const direction = directionOf(transaction);
    return direction > 0 ? 'in' : direction < 0 ? 'out' : '';
  };
  const transactionTitle = (transaction: typeof transactions[number]) => {
    if (transaction.type === 'transfer') {
      return `${walletName(transaction.walletId) ?? 'Dompet asal'} → ${walletName(transaction.toWalletId) ?? 'Dompet tujuan'}`;
    }
    return transaction.note || transaction.labels.at(-1) || 'Transaksi';
  };

  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [showTx, setShowTx] = useState(true);

  const days = useMemo(() => (view === 'month' ? monthGrid(anchor) : weekGrid(anchor)), [view, anchor]);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  // Semua yang bisa muncul di kalender dikumpulkan ke satu peta per tanggal.
  const byDay = useMemo(() => {
    const map = new Map<string, {
      tx: typeof transactions;
      bills: Array<{ id: string; name: string; amount: number; kind: 'subscription' | 'installment' }>;
      todos: typeof reminders;
    }>();
    const bucket = (key: string) => {
      let entry = map.get(key);
      if (!entry) { entry = { tx: [], bills: [], todos: [] }; map.set(key, entry); }
      return entry;
    };
    transactions.forEach((item) => bucket(dayKey(item.date)).tx.push(item));
    subs.forEach((sub) =>
      billingDatesInRange(sub, rangeStart, rangeEnd).forEach((date) =>
        bucket(dayKey(date)).bills.push({
          id: `${sub.id}-${dayKey(date)}`, name: sub.name, amount: sub.amount, kind: 'subscription',
        }),
      ),
    );
    const from = dayKey(rangeStart);
    const to = dayKey(rangeEnd);
    installments.flatMap(installmentSchedule)
      .filter((due) => !due.paid && due.dueDate >= from && due.dueDate <= to)
      .forEach((due) => bucket(due.dueDate).bills.push({
        id: due.id, name: `${due.title} ${due.number}/${due.tenor}`, amount: due.amount, kind: 'installment',
      }));
    reminders.forEach((reminder) => bucket(dayKey(reminder.date)).todos.push(reminder));
    return map;
  }, [transactions, installments, subs, reminders, rangeStart, rangeEnd]);

  const todayKey = dayKey(new Date());
  const selectedEntry = byDay.get(selected) ?? { tx: [], bills: [], todos: [] };
  const selectedDate = new Date(`${selected}T12:00:00`);
  const monthLabel = (view === 'month' ? anchor : rangeStart).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekLabel = `${rangeStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${rangeEnd.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const shift = (direction: number) =>
    setAnchor((current) => {
      if (view === 'week') return addDays(current, direction * 7);
      const next = new Date(current);
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      return next;
    });

  const toggleReminder = async (id: string, done: boolean) => {
    await repos.reminders.update(id, { done: !done });
    ui.refresh();
  };

  const dayTotals = (key: string) => {
    const entry = byDay.get(key);
    if (!entry) return { income: 0, actualIncome: 0, expense: 0 };
    return entry.tx.reduce(
      (sum, item) => ({
        income: sum.income + (isIncome(item) ? item.amount : 0),
        actualIncome: sum.actualIncome + (isActualIncome(item) ? item.amount : 0),
        expense: sum.expense + (!item.adjustment && item.type === 'expense' ? item.amount : 0),
      }),
      { income: 0, actualIncome: 0, expense: 0 },
    );
  };

  return (
    <>
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={() => shift(-1)} aria-label={t('cal.previous')}><ChevronR className="flip" /></button>
          <div className="cal-title">
            <b>{monthLabel}</b>
            {view === 'week' && <small>{weekLabel}</small>}
          </div>
          <button onClick={() => shift(1)} aria-label={t('cal.next')}><ChevronR /></button>
        </div>
        <div className="mseg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>{t('cal.month')}</button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>{t('cal.week')}</button>
        </div>
      </div>

      <div className="cal-actions">
        <button className="addg" onClick={() => { setAnchor(startOfDay(new Date())); setSelected(todayKey); }}>{t('cal.today')}</button>
        <label className="cal-toggle">
          <input type="checkbox" checked={showTx} onChange={(event) => setShowTx(event.target.checked)} />
          <span>{t('cal.showTx')}</span>
        </label>
        <button className="addg" onClick={() => ui.openCreate('reminder', false, selected)}><Plus />{t('cal.addReminder')}</button>
      </div>

      <div className="cal-grid-head">
        {[t('cal.mon'), t('cal.tue'), t('cal.wed'), t('cal.thu'), t('cal.fri'), t('cal.sat'), t('cal.sun')].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className={`cal-grid${view === 'week' ? ' week' : ''}`}>
        {days.map((date) => {
          const key = dayKey(date);
          const entry = byDay.get(key);
          const inMonth = view === 'week' || date.getMonth() === anchor.getMonth();
          const totals = dayTotals(key);
          const openTodos = entry?.todos.filter((todo) => !todo.done).length ?? 0;
          return (
            <button
              key={key}
              className={`cal-day${inMonth ? '' : ' muted'}${key === selected ? ' selected' : ''}${key === todayKey ? ' today' : ''}`}
              onClick={() => setSelected(key)}
            >
              <span className="cal-date">{date.getDate()}</span>
              <span className="cal-marks">
                {openTodos > 0 && <i className="mk todo" />}
                {entry && entry.bills.length > 0 && <i className="mk bill" />}
                {showTx && totals.expense > 0 && <i className="mk out" />}
                {showTx && totals.income > 0 && <i className="mk in" />}
                {showTx && totals.actualIncome > 0 && <i className="mk real-in" />}
              </span>
              {showTx && view === 'week' && (totals.income > 0 || totals.expense > 0) && (
                <span className="cal-amt">
                  {totals.expense > 0 && <em className="out">−{money.fmtCompact(totals.expense)}</em>}
                  {totals.income > 0 && <em className="in" title={t('reports.income')}>+{money.fmtCompact(totals.income)}</em>}
                  {totals.actualIncome > 0 && <em className="real-in" title={t('reports.actualIncome')}>{t('cal.realShort')} +{money.fmtCompact(totals.actualIncome)}</em>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sec">
        <span className="t">{selectedDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button className="addg" onClick={() => ui.openCreate('reminder', false, selected)}><Plus />{t('cal.reminder')}</button>
      </div>

      {selectedEntry.todos.length === 0 && selectedEntry.bills.length === 0 && (!showTx || selectedEntry.tx.length === 0) && (
        <div className="empty-state"><Clock /><b>{t('cal.emptyTitle')}</b><span>{t('cal.emptyBody')}</span></div>
      )}

      {selectedEntry.todos.map((todo) => (
        <div className="row" key={todo.id}>
          <button
            className={`cal-check${todo.done ? ' on' : ''}`}
            onClick={() => void toggleReminder(todo.id, todo.done)}
            aria-label={todo.done ? t('cal.markUndone') : t('cal.markDone')}
          >
            {todo.done && <Check />}
          </button>
          <div className="mid" onClick={() => ui.openItem(todo.title, 'reminder', todo.id)}>
            <div className={`t1${todo.done ? ' done' : ''}`}>{todo.title}</div>
            <div className="t2">{todo.note || t('cal.todoTag')}</div>
          </div>
          {todo.amount ? <div className="r"><div className="val">{money.fmt(todo.amount)}</div></div> : null}
        </div>
      ))}

      {selectedEntry.bills.map((bill) => (
        <div className="row" key={bill.id} onClick={() => ui.go(bill.kind === 'installment' ? 'installments' : 'subs')}>
          <div className="ic"><Recur /></div>
          <div className="mid"><div className="t1">{bill.name}</div><div className="t2"><span className="chip">{t(bill.kind === 'installment' ? 'cal.installmentDue' : 'cal.billingDue')}</span></div></div>
          <div className="r"><div className="val out">−{money.fmt(bill.amount)}</div></div>
        </div>
      ))}

      {showTx && selectedEntry.tx.map((item) => (
        <div
          className="row"
          key={item.id}
          onClick={() => ui.openItem(transactionTitle(item), item.type === 'transfer' ? 'transfer' : 'transaksi', item.id)}
        >
          <div className={`ic ${toneOf(item)}`}>
            {item.type === 'transfer' ? <TransferCard /> : directionOf(item) > 0 ? <Down /> : <Up />}
          </div>
          <div className="mid">
            <div className="t1">{transactionTitle(item)}</div>
            <div className="t2">
              {item.adjustment ? (
                <span className="chip">{t('tx.adjustmentChip')}</span>
              ) : item.type === 'income' && (
                <span className="chip" data-cat="income">
                  {isActualIncome(item) ? t('reports.actualIncome') : t('tx.receivableIncome')}
                </span>
              )}
              {item.labels[0] && <span className="chip">{item.labels[0]}</span>}
              {item.merchant && <span className="chip">📍 {item.merchant}</span>}
            </div>
          </div>
          <div className={`r`}>
            <div className={`val ${toneOf(item)}`}>
              {directionOf(item) > 0 ? '+' : directionOf(item) < 0 ? '−' : ''}{money.fmt(item.amount)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
