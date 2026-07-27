// ===== Perhitungan split bill berbasis nota =====
// Pajak/servis diisi SEKALI per nota (mis. 11%), lalu disebar ke tiap item sesuai
// harganya. Jadi porsi tiap orang otomatis membawa pajaknya sendiri — bukan pajak
// yang dibagi rata per kepala.

export interface SplitPerson { id: string; name: string; color: string; }
export interface SplitItem {
  id: string;
  name: string;
  price: number;
  sharedBy: string[];   // id peserta yang ikut menanggung item ini
}
export interface Receipt {
  id: string;
  name: string;
  payerId: string;      // siapa yang menalangi nota ini
  taxPercent: number;   // pajak/servis untuk seluruh nota; 0 = tidak kena
  items: SplitItem[];
}

const factor = (taxPercent: number) => 1 + taxPercent / 100;

/** Nilai item setelah menanggung porsi pajaknya. */
export const itemTotal = (item: SplitItem, taxPercent: number) => item.price * factor(taxPercent);
export const itemTax = (item: SplitItem, taxPercent: number) => item.price * (taxPercent / 100);
export const receiptSubtotal = (receipt: Receipt) => receipt.items.reduce((sum, item) => sum + item.price, 0);
export const receiptTax = (receipt: Receipt) => receiptSubtotal(receipt) * (receipt.taxPercent / 100);
export const receiptTotal = (receipt: Receipt) => receiptSubtotal(receipt) * factor(receipt.taxPercent);

export interface PersonBalance {
  personId: string;
  owes: number;   // total konsumsi (sudah termasuk pajak proporsional)
  paid: number;   // total nota yang dia talangi
  net: number;    // paid − owes; positif = berhak menerima
}

/** Berapa yang ditanggung tiap orang dari sebuah nota. */
export function shareOfReceipt(receipt: Receipt): Map<string, number> {
  const shares = new Map<string, number>();
  receipt.items.forEach((item) => {
    if (item.sharedBy.length === 0) return;
    const each = itemTotal(item, receipt.taxPercent) / item.sharedBy.length;
    item.sharedBy.forEach((personId) => shares.set(personId, (shares.get(personId) ?? 0) + each));
  });
  return shares;
}

export function balances(receipts: Receipt[], people: SplitPerson[]): PersonBalance[] {
  const owes = new Map<string, number>();
  const paid = new Map<string, number>();
  receipts.forEach((receipt) => {
    shareOfReceipt(receipt).forEach((amount, personId) => owes.set(personId, (owes.get(personId) ?? 0) + amount));
    paid.set(receipt.payerId, (paid.get(receipt.payerId) ?? 0) + receiptTotal(receipt));
  });
  return people.map((person) => {
    const personOwes = owes.get(person.id) ?? 0;
    const personPaid = paid.get(person.id) ?? 0;
    return { personId: person.id, owes: personOwes, paid: personPaid, net: personPaid - personOwes };
  });
}

export interface Settlement { fromId: string; toId: string; amount: number; }

/**
 * Siapa transfer ke siapa. Greedy: utang terbesar dilunasi ke piutang terbesar,
 * sehingga jumlah transfernya seminimal mungkin.
 */
export function settlements(personBalances: PersonBalance[]): Settlement[] {
  const debtors = personBalances.filter((b) => b.net < -0.5).map((b) => ({ id: b.personId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = personBalances.filter((b) => b.net > 0.5).map((b) => ({ id: b.personId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const result: Settlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0.5) result.push({ fromId: debtor.id, toId: creditor.id, amount: Math.round(amount) });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= 0.5) debtorIndex += 1;
    if (creditor.amount <= 0.5) creditorIndex += 1;
  }
  return result;
}
