'use client';

import React, { useState } from 'react';
import { useInstallments, useWallets } from '../application/hooks';
import { useMoney, useT, useUI } from '../components/AppShell';
import { Card } from '../components/ui/icons';
import type { Transaction } from '../core/domain/types';
import { nextUnpaidInstallment } from '../core/domain/installment-schedule';
import { installmentPaymentAmount, installmentRemainingAmount, installmentTotalPayable } from '../core/domain/installment-pricing';

type Filter = 'active' | 'all' | 'paid';

function installmentAmounts(transaction: Transaction) {
  const tenor = transaction.installmentTenorMonths ?? 0;
  const paid = Math.min(tenor, Math.max(0, transaction.installmentPaidMonths ?? 0));
  return {
    tenor,
    paid,
    total: installmentTotalPayable(transaction),
    remaining: installmentRemainingAmount(transaction),
  };
}

export default function InstallmentsScreen() {
  const ui = useUI();
  const money = useMoney();
  const t = useT();
  const locale = ui.prefs.language === 'EN' ? 'en-US' : 'id-ID';
  const { data: installments, loading } = useInstallments();
  const { wallets } = useWallets();
  const [filter, setFilter] = useState<Filter>('active');
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));
  const active = installments.filter((transaction) => {
    const { tenor, paid } = installmentAmounts(transaction);
    return tenor > 0 && paid < tenor;
  });
  const totalRemaining = active.reduce(
    (sum, transaction) => sum + installmentAmounts(transaction).remaining,
    0,
  );
  const visible = installments.filter((transaction) => {
    const { tenor, paid } = installmentAmounts(transaction);
    return tenor > 0 && (filter === 'all' || (filter === 'active' ? paid < tenor : paid >= tenor));
  });

  return (
    <>
      <section className="installments-summary">
        <span>{t('installments.remainingTotal')}</span>
        <strong>{money.fmt(totalRemaining)}</strong>
        <small>{t('installments.activeCount', { n: active.length })}</small>
        {active.some((transaction) => transaction.installmentItemTotal == null)
          && <small>{t('installments.legacyEstimate')}</small>}
      </section>

      <p className="installments-intro">{t('installments.intro')}</p>

      <div className="filter-pills installments-filters" aria-label={t('installments.filterLabel')}>
        {(['active', 'all', 'paid'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'on' : ''}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`installments.filter.${value}`)}
            <span className="pill-count">
              {value === 'active' ? active.length : value === 'all' ? installments.length : installments.length - active.length}
            </span>
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className="installments-list">
          {visible.map((transaction) => {
            const { tenor, paid, total, remaining } = installmentAmounts(transaction);
            const next = nextUnpaidInstallment(transaction);
            const title = (transaction.note || transaction.merchant || t('installments.untitled'))
              .replace(/\s*\(cicilan\s*\d+\s*\/\s*\d+\)\s*$/i, '')
              .trim() || t('installments.untitled');
            const date = new Date(transaction.date).toLocaleDateString(locale, {
              day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
            });
            return (
              <article className="installment-card" key={transaction.id}>
                <div className="installment-head">
                  <div className="installment-mark" aria-hidden="true"><Card /></div>
                  <div className="installment-title">
                    <h3>{title}</h3>
                    <span>{walletNames.get(transaction.walletId) ?? t('installments.creditCard')} · {date}</span>
                  </div>
                  <span className={`installment-status${paid >= tenor ? ' paid' : ''}`}>
                    {paid >= tenor ? t('installments.paid') : t('installments.active')}
                  </span>
                </div>

                <div className="installment-amounts">
                  <div><span>{t('installments.monthly')}</span><strong>{money.fmt(next?.amount ?? installmentPaymentAmount(transaction, tenor))}</strong></div>
                  <div><span>{t(transaction.installmentItemTotal == null ? 'installments.totalEstimated' : 'installments.total')}</span><strong>{money.fmt(total)}</strong></div>
                  <div><span>{t(transaction.installmentItemTotal == null ? 'installments.remainingEstimated' : 'installments.remaining')}</span><strong>{money.fmt(remaining)}</strong></div>
                </div>
                {transaction.installmentItemTotal != null ? (
                  <div className="installment-pricing-details">
                    <span>{t('installments.itemTotal')} <b>{money.fmt(transaction.installmentItemTotal)}</b></span>
                    <span>{t('installments.interestTotal')} <b>{money.fmt(transaction.installmentInterestTotal ?? 0)}</b></span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="installment-pricing-missing"
                    onClick={() => ui.openCreate('transaksi', true, title, transaction.id)}
                  >
                    {t('installments.completePricing')}
                  </button>
                )}

                <progress className="installment-progress" value={paid} max={tenor} aria-label={t('installments.progress', { paid, tenor })} />
                <div className="installment-foot">
                  <span>{t('installments.progress', { paid, tenor })}</span>
                  {next && <span>
                    {t('installments.next', { amount: money.fmt(next.amount) })} ·{' '}
                    {t('installments.due', {
                      date: new Date(`${next.dueDate}T12:00:00`).toLocaleDateString(locale, {
                        day: 'numeric', month: 'short', year: 'numeric',
                      }),
                    })}
                  </span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state installments-empty">
          <Card />
          <b>{loading ? t('installments.loading') : t('installments.emptyTitle')}</b>
          {!loading && <span>{installments.length === 0 ? t('installments.emptyBody') : t('installments.emptyFilter')}</span>}
        </div>
      )}
    </>
  );
}
